/**
 * ONDC BAP Express router — Metro TRV11 2.0.0
 *
 * Two groups of routes:
 *
 * 1. BPP callbacks (POST /ondc/on_*):
 *    Async responses from BPPs — received after we send search/select/init/confirm.
 *    Protected by ondcAuthMiddleware (Ed25519 signature verification).
 *    Each handler returns ACK immediately and pushes an SSE event to the frontend.
 *
 * 2. Booking API (POST /ondc/api/*):
 *    Called by the CityOne frontend to initiate each booking step.
 *    Builds a signed ONDC request and forwards it to the Gateway or BPP.
 *
 * 3. SSE stream (GET /ondc/api/events/:txnId):
 *    Frontend subscribes here to receive real-time booking state updates.
 */

import { Router } from 'express';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

import { ondcAuthMiddleware } from './core/authMiddleware.js';
import { signedPost } from './core/httpClient.js';
import { ack, nack, ErrCode } from './core/errors.js';
import { ondcConfig } from './config.js';

import {
  handleOnSearch,
  handleOnSelect,
  handleOnInit,
  handleOnConfirm,
  handleOnStatus,
  handleOnUpdate,
  handleOnCancel,
  handleOnSupport,
  handleOnIssue,
  handleOnIssueStatus,
} from './adapters/metro/callbacks.js';

import {
  buildSearch,
  buildSelect,
  buildInit,
  buildConfirm,
  buildStatus,
  buildUpdate,
  buildCancel,
  buildSupport,
  buildIssue,
  buildIssueEscalate,
  buildIssueClose,
} from './adapters/metro/actions.js';

import {
  createTransaction,
  getTransaction,
  updateTransaction,
  OrderStatus,
} from './store/orderStore.js';

import { onSubscribeHandler } from './onboard.js';

// ── Event bus for SSE ─────────────────────────────────────────────────────────
// Each transaction_id gets its own EventEmitter for SSE fan-out.
const sseChannels = new Map();

function getOrCreateChannel(txnId) {
  if (!sseChannels.has(txnId)) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(20);
    sseChannels.set(txnId, emitter);
    // Auto-cleanup after 2 hours
    setTimeout(() => sseChannels.delete(txnId), 2 * 60 * 60 * 1000);
  }
  return sseChannels.get(txnId);
}

/** Thin wrapper so callbacks.js can call eventBus.emit(txnId, data) */
export const eventBus = {
  emit(txnId, data) {
    const ch = sseChannels.get(txnId);
    if (ch) ch.emit('update', data);
  },
};

function deriveAmountFromSearch(searchOptions, itemId, quantity) {
  if (!searchOptions?.length) return null;
  const match = searchOptions.find(o => o.itemId === itemId);
  if (!match?.fareValue) return null;
  return String(Number(match.fareValue) * (quantity ?? 1));
}

// ── Router ────────────────────────────────────────────────────────────────────

export const ondcRouter = Router();

// ── Onboarding ────────────────────────────────────────────────────────────────
// Site verification is served at root by server.js — NOT here.
ondcRouter.post('/on_subscribe', onSubscribeHandler);

// ── BPP Callbacks ─────────────────────────────────────────────────────────────

function makeCallbackRoute(action, handler) {
  ondcRouter.post(`/${action}`, ondcAuthMiddleware, (req, res) => {
    const result = handler(req.body, eventBus);
    if (!result.ok) {
      console.warn(`[ondc/${action}]`, result.error);
      return res.json(nack('DOMAIN-ERROR', ErrCode.INVALID_REQUEST, result.error));
    }
    return res.json(ack());
  });
}

makeCallbackRoute('on_search', handleOnSearch);
makeCallbackRoute('on_select', handleOnSelect);
makeCallbackRoute('on_init', handleOnInit);
makeCallbackRoute('on_confirm', handleOnConfirm);
makeCallbackRoute('on_status', handleOnStatus);
makeCallbackRoute('on_update', handleOnUpdate);
makeCallbackRoute('on_cancel', handleOnCancel);
makeCallbackRoute('on_support', handleOnSupport);
makeCallbackRoute('on_issue', handleOnIssue);
makeCallbackRoute('on_issue_status', handleOnIssueStatus);

// ── Booking API ───────────────────────────────────────────────────────────────

/**
 * POST /ondc/api/search
 * Body: { from: { gps?, code?, name? }, to: { gps?, code?, name? } }
 * Response: { txnId }
 */
ondcRouter.post('/api/search', async (req, res) => {
  const { from, to, txnId: existingTxnId } = req.body ?? {};
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  const txnId = existingTxnId || crypto.randomUUID();
  if (!getTransaction(txnId)) createTransaction(txnId);
  updateTransaction(txnId, { searchFrom: from, searchTo: to });

  const payload = buildSearch({ transactionId: txnId, from, to });

  try {
    const searchUrl = ondcConfig.workbenchMode
      ? ondcConfig.workbenchUrl
      : `${ondcConfig.gatewayUrl}/search`;
    const ackResp = await signedPost(searchUrl, payload);
    console.log('[ondc/search] Gateway ACK:', JSON.stringify(ackResp));
    return res.json({ txnId, context: payload.context });
  } catch (err) {
    console.error('[ondc/search]', err.message);
    updateTransaction(txnId, { status: OrderStatus.FAILED });
    return res.status(502).json({ error: 'Gateway unreachable', detail: err.message });
  }
});

/**
 * POST /ondc/api/select
 * Body: { txnId, providerId, itemId, quantity? }
 */
ondcRouter.post('/api/select', async (req, res) => {
  const { txnId, providerId, itemId, quantity } = req.body ?? {};
  const txn = getTransaction(txnId);
  if (!txn) return res.status(404).json({ error: 'Unknown txnId' });
  if (!txn.bppUri) return res.status(409).json({ error: 'No BPP selected yet. Wait for on_search.' });

  const firstOption = txn.searchOptions?.[0];
  const resolvedProviderId = providerId ?? firstOption?.providerId;
  const resolvedItemId = itemId ?? firstOption?.itemId;

  updateTransaction(txnId, { selectedProviderId: resolvedProviderId, selectedItemId: resolvedItemId });

  const payload = buildSelect({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    providerId: resolvedProviderId,
    itemId: resolvedItemId,
    quantity: quantity ?? 1,
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/select`, payload);
    return res.json({ txnId, ack: ackResp });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

/**
 * POST /ondc/api/init
 * Body: { txnId, billing: { name, email, phone }, providerId?, itemId?, quantity? }
 */
ondcRouter.post('/api/init', async (req, res) => {
  const { txnId, billing, providerId, itemId, quantity } = req.body ?? {};
  const txn = getTransaction(txnId);
  if (!txn) return res.status(404).json({ error: 'Unknown txnId' });

  const firstOption = txn.searchOptions?.[0];
  const resolvedProviderId = providerId ?? txn.selectedProviderId ?? firstOption?.providerId;
  const resolvedItemId = itemId ?? txn.selectedItemId ?? firstOption?.itemId;
  const resolvedQuantity = quantity ?? txn.selectedQuantity ?? 1;
  const resolvedBilling = billing ?? txn.billing ?? {
    name: 'Arjun Yadav',
    email: 'arsenal6389@gmail.com',
    phone: '9999999999',
  };

  const fulfillmentId = txn.selectedFulfillmentId
    ?? txn.searchOptions?.find(o => o.itemId === resolvedItemId)?.fulfillmentId
    ?? 'F1';

  const fulfillments = [];
  if (txn.searchFrom || txn.searchTo) {
    const stops = [];
    if (txn.searchFrom) {
      const loc = {};
      if (txn.searchFrom.gps) loc.gps = txn.searchFrom.gps;
      if (txn.searchFrom.code) loc.descriptor = { code: txn.searchFrom.code };
      stops.push({ type: 'START', location: loc });
    }
    if (txn.searchTo) {
      const loc = {};
      if (txn.searchTo.gps) loc.gps = txn.searchTo.gps;
      if (txn.searchTo.code) loc.descriptor = { code: txn.searchTo.code };
      stops.push({ type: 'END', location: loc });
    }
    fulfillments.push({ id: fulfillmentId, stops, vehicle: { category: 'METRO' } });
  }

  const payload = buildInit({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    providerId: resolvedProviderId,
    itemId: resolvedItemId,
    quantity: resolvedQuantity,
    billing: resolvedBilling,
    totalAmount: txn.quote?.totalAmount
      ?? deriveAmountFromSearch(txn.searchOptions, resolvedItemId, resolvedQuantity),
    fulfillments,
  });

  updateTransaction(txnId, {
    billing: resolvedBilling,
    selectedProviderId: resolvedProviderId,
    selectedItemId: resolvedItemId,
    selectedQuantity: resolvedQuantity,
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/init`, payload);
    return res.json({ txnId, ack: ackResp });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

/**
 * POST /ondc/api/confirm
 * Body: { txnId, paymentTransactionId? }
 *
 * paymentTransactionId: our payment reference from UPI/Razorpay etc.
 * If ONDC_MOCK_PAYMENT=true, a UUID is generated automatically.
 */
ondcRouter.post('/api/confirm', async (req, res) => {
  const { txnId, paymentTransactionId } = req.body ?? {};
  const txn = getTransaction(txnId);
  if (!txn) return res.status(404).json({ error: 'Unknown txnId' });

  const firstOption = txn.searchOptions?.[0];
  const resolvedProviderId = txn.selectedProviderId ?? firstOption?.providerId;
  const resolvedItemId = txn.selectedItemId ?? firstOption?.itemId;
  const resolvedQuantity = txn.selectedQuantity ?? 1;
  const totalAmount = txn.quote?.totalAmount
    ?? deriveAmountFromSearch(txn.searchOptions, resolvedItemId, resolvedQuantity);

  const payload = buildConfirm({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    providerId: resolvedProviderId,
    itemId: resolvedItemId,
    quantity: resolvedQuantity,
    billing: txn.billing,
    onInitPayment: txn.payment,
    paymentTransactionId,
    totalAmount,
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/confirm`, payload);
    if (!txn.orderId) {
      updateTransaction(txnId, {
        orderId: txn.orderId ?? `O_${crypto.randomUUID().slice(0, 8)}`,
        selectedProviderId: resolvedProviderId,
        selectedItemId: resolvedItemId,
      });
    }
    return res.json({ txnId, ack: ackResp });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

/**
 * POST /ondc/api/status
 * Body: { txnId }
 */
ondcRouter.post('/api/status', async (req, res) => {
  const { txnId } = req.body ?? {};
  const txn = getTransaction(txnId);
  if (!txn) return res.status(404).json({ error: 'Unknown txnId' });
  const orderId = txn.orderId ?? `O_${crypto.randomUUID().slice(0, 8)}`;
  if (!txn.orderId) updateTransaction(txnId, { orderId });

  const payload = buildStatus({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    orderId,
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/status`, payload);
    return res.json({ txnId, ack: ackResp });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

/**
 * POST /ondc/api/update
 * Body: { txnId, fulfillmentId, cancelType }
 *
 * cancelType: 'SOFT_CANCEL' (step 1 — get cancellation charges)
 *          or 'CONFIRM_CANCEL' (step 2 — confirm partial cancellation)
 * fulfillmentId: the specific fulfillment to cancel (e.g. 'F2')
 */
ondcRouter.post('/api/update', async (req, res) => {
  const { txnId, fulfillmentId, cancelType, reasonId } = req.body ?? {};
  const txn = getTransaction(txnId);
  if (!txn) return res.status(404).json({ error: 'Unknown txnId' });

  const orderId = txn.orderId;
  if (!orderId) return res.status(409).json({ error: 'No confirmed order. Run confirm first.' });

  const resolvedFulfillmentId = fulfillmentId ?? txn.selectedFulfillmentId ?? 'F1';
  const resolvedCancelType = cancelType ?? 'SOFT_CANCEL';

  const payload = buildUpdate({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    orderId,
    fulfillmentId: resolvedFulfillmentId,
    cancelType: resolvedCancelType,
    reasonId: reasonId ?? '001',
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/update`, payload);
    return res.json({ txnId, ack: ackResp });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

/**
 * POST /ondc/api/cancel
 * Body: { txnId, reasonId? }
 */
ondcRouter.post('/api/cancel', async (req, res) => {
  const { txnId, reasonId, cancelType } = req.body ?? {};
  const txn = getTransaction(txnId);
  if (!txn) return res.status(404).json({ error: 'Unknown txnId' });

  const orderId = txn.orderId;
  if (!orderId) return res.status(409).json({ error: 'No confirmed order. Run confirm first.' });

  const payload = buildCancel({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    orderId,
    reasonId: reasonId ?? '001',
    cancelType: cancelType ?? 'SOFT_CANCEL',
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/cancel`, payload);
    return res.json({ txnId, ack: ackResp });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

/**
 * POST /ondc/api/support
 * Body: { txnId }
 */
ondcRouter.post('/api/support', async (req, res) => {
  const { txnId } = req.body ?? {};
  const txn = getTransaction(txnId);
  if (!txn) return res.status(404).json({ error: 'Unknown txnId' });

  const payload = buildSupport({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    refId: txnId,
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/support`, payload);
    return res.json({ txnId, ack: ackResp });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

/**
 * POST /ondc/api/issue
 * Body: { txnId, shortDesc?, longDesc? }
 * Raises an IGM issue against the confirmed order.
 */
ondcRouter.post('/api/issue', async (req, res) => {
  const { txnId, shortDesc, longDesc } = req.body ?? {};
  const txn = getTransaction(txnId);
  if (!txn) return res.status(404).json({ error: 'Unknown txnId' });
  const firstOption = txn.searchOptions?.[0];
  const orderId = txn.orderId ?? `O_${crypto.randomUUID().slice(0, 8)}`;
  if (!txn.orderId) updateTransaction(txnId, { orderId });

  const payload = buildIssue({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    orderId,
    providerId: txn.selectedProviderId ?? firstOption?.providerId,
    itemId: txn.selectedItemId ?? firstOption?.itemId,
    fulfillmentId: txn.selectedFulfillmentId ?? 'F1',
    billing: txn.billing,
    shortDesc,
    longDesc,
  });

  updateTransaction(txnId, {
    igmIssue: { id: payload.message.issue.id, status: 'OPEN' },
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/issue`, payload);
    return res.json({ txnId, issueId: payload.message.issue.id, ack: ackResp });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

/**
 * POST /ondc/api/issue-escalate
 * Body: { txnId, issueId? }
 * Escalates an IGM issue when BPP takes no action (IGM 2.0.0).
 */
ondcRouter.post('/api/issue-escalate', async (req, res) => {
  const { txnId, issueId } = req.body ?? {};
  const txn = getTransaction(txnId);
  if (!txn) return res.status(404).json({ error: 'Unknown txnId' });

  const resolvedIssueId = issueId ?? txn.igmIssue?.id;
  if (!resolvedIssueId) return res.status(409).json({ error: 'No issue to escalate' });

  const firstOption = txn.searchOptions?.[0];
  const payload = buildIssueEscalate({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    issueId: resolvedIssueId,
    billing: txn.billing,
    orderId: txn.orderId,
    providerId: txn.selectedProviderId ?? firstOption?.providerId,
    itemId: txn.selectedItemId ?? firstOption?.itemId,
    fulfillmentId: txn.selectedFulfillmentId ?? 'F1',
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/issue`, payload);
    return res.json({ txnId, issueId: resolvedIssueId, ack: ackResp });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

/**
 * POST /ondc/api/issue-close
 * Body: { txnId, issueId? }
 * Closes a resolved IGM issue.
 */
ondcRouter.post('/api/issue-close', async (req, res) => {
  const { txnId, issueId } = req.body ?? {};
  const txn = getTransaction(txnId);
  if (!txn) return res.status(404).json({ error: 'Unknown txnId' });

  const resolvedIssueId = issueId ?? txn.igmIssue?.id;
  if (!resolvedIssueId) return res.status(409).json({ error: 'No issue to close' });

  const firstOption = txn.searchOptions?.[0];
  const payload = buildIssueClose({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    issueId: resolvedIssueId,
    billing: txn.billing,
    orderId: txn.orderId,
    providerId: txn.selectedProviderId ?? firstOption?.providerId,
    itemId: txn.selectedItemId ?? firstOption?.itemId,
    fulfillmentId: txn.selectedFulfillmentId ?? 'F1',
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/issue`, payload);
    return res.json({ txnId, issueId: resolvedIssueId, ack: ackResp });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

/**
 * GET /ondc/api/order/:txnId
 * Returns current order state (for frontend polling).
 */
ondcRouter.get('/api/order/:txnId', (req, res) => {
  const txn = getTransaction(req.params.txnId);
  if (!txn) return res.status(404).json({ error: 'Unknown txnId' });

  // Do not expose raw BPP params
  return res.json({
    txnId: txn.transactionId,
    status: txn.status,
    updatedAt: txn.updatedAt,
    searchOptions: txn.searchOptions,
    quote: txn.quote,
    orderId: txn.orderId,
    orderStatus: txn.orderStatus,
    ticket: txn.ticket,
  });
});

/**
 * GET /ondc/api/events/:txnId
 * Server-Sent Events stream for real-time booking state updates.
 *
 * Frontend subscribes once per transaction and receives events as each
 * BPP callback arrives (on_search, on_select, on_init, on_confirm, on_status).
 */
ondcRouter.get('/api/events/:txnId', (req, res) => {
  const { txnId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const channel = getOrCreateChannel(txnId);

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send current state immediately
  const txn = getTransaction(txnId);
  if (txn) send({ event: 'current_state', status: txn.status });

  const onUpdate = (data) => send(data);
  channel.on('update', onUpdate);

  // Keepalive every 30s
  const keepalive = setInterval(() => res.write(': ping\n\n'), 30000);

  req.on('close', () => {
    channel.off('update', onUpdate);
    clearInterval(keepalive);
  });
});
