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
  handleOnSupport,
} from './adapters/metro/callbacks.js';

import {
  buildSearch,
  buildSelect,
  buildInit,
  buildConfirm,
  buildStatus,
  buildSupport,
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
makeCallbackRoute('on_support', handleOnSupport);

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

  updateTransaction(txnId, { selectedProviderId: providerId, selectedItemId: itemId });

  const payload = buildSelect({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    providerId,
    itemId,
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

  const resolvedProviderId = providerId ?? txn.selectedProviderId;
  const resolvedItemId = itemId ?? txn.selectedItemId;
  const resolvedQuantity = quantity ?? txn.selectedQuantity ?? 1;

  const payload = buildInit({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    providerId: resolvedProviderId,
    itemId: resolvedItemId,
    quantity: resolvedQuantity,
    billing,
    totalAmount: txn.quote?.totalAmount
      ?? deriveAmountFromSearch(txn.searchOptions, resolvedItemId, resolvedQuantity),
  });

  updateTransaction(txnId, {
    billing,
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

  const payload = buildConfirm({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    providerId: txn.selectedProviderId,
    itemId: txn.selectedItemId,
    quantity: txn.selectedQuantity ?? 1,
    billing: txn.billing,
    onInitPayment: txn.payment,
    paymentTransactionId,
    totalAmount: txn.quote?.totalAmount,
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/confirm`, payload);
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
  if (!txn.orderId) return res.status(409).json({ error: 'Order not confirmed yet' });

  const payload = buildStatus({
    transactionId: txnId,
    bppId: txn.bppId,
    bppUri: txn.bppUri,
    orderId: txn.orderId,
  });

  try {
    const ackResp = await signedPost(`${txn.bppUri}/status`, payload);
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
