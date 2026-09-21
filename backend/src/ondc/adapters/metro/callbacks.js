/**
 * Metro TRV11 2.0.0 — inbound BPP callback handlers.
 *
 * Each handler:
 *   1. Validates the context (domain, action, version)
 *   2. Parses the payload via mapper.js
 *   3. Updates the order store
 *   4. Returns { ok: true } or { ok: false, error }
 *
 * The router sends ACK and emits SSE updates to the frontend.
 */

import {
  getTransaction,
  updateTransaction,
  OrderStatus,
} from '../../store/orderStore.js';
import {
  parseOnSearch,
  parseOnSelect,
  parseOnInit,
  parseOnConfirm,
  parseOnStatus,
} from './mapper.js';

const EXPECTED_DOMAIN = 'ONDC:TRV11';
const EXPECTED_VERSION = '2.0.0';

function validateContext(ctx, expectedAction) {
  if (ctx?.domain !== EXPECTED_DOMAIN) return `Expected domain ${EXPECTED_DOMAIN}, got ${ctx?.domain}`;
  if (ctx?.version !== EXPECTED_VERSION) return `Expected version ${EXPECTED_VERSION}, got ${ctx?.version}`;
  if (ctx?.action !== expectedAction) return `Expected action ${expectedAction}, got ${ctx?.action}`;
  return null;
}

export function handleOnSearch(body, eventBus) {
  const ctx = body?.context;
  const err = validateContext(ctx, 'on_search');
  if (err) return { ok: false, error: err };

  const txnId = ctx.transaction_id;
  const txn = getTransaction(txnId);
  if (!txn) return { ok: false, error: `Unknown transaction_id: ${txnId}` };

  const options = parseOnSearch(body);

  updateTransaction(txnId, {
    bppId: ctx.bpp_id,
    bppUri: ctx.bpp_uri,
    status: OrderStatus.SEARCH_COMPLETE,
    searchOptions: [...(txn.searchOptions ?? []), ...options],
  });

  eventBus.emit(txnId, { event: 'on_search', options });
  return { ok: true };
}

export function handleOnSelect(body, eventBus) {
  const ctx = body?.context;
  const err = validateContext(ctx, 'on_select');
  if (err) return { ok: false, error: err };

  const txnId = ctx.transaction_id;
  const txn = getTransaction(txnId);
  if (!txn) return { ok: false, error: `Unknown transaction_id: ${txnId}` };

  const parsed = parseOnSelect(body);
  if (!parsed) return { ok: false, error: 'Could not parse on_select order' };

  updateTransaction(txnId, {
    status: OrderStatus.SELECTED,
    quote: parsed,
  });

  eventBus.emit(txnId, { event: 'on_select', quote: parsed });
  return { ok: true };
}

export function handleOnInit(body, eventBus) {
  const ctx = body?.context;
  const err = validateContext(ctx, 'on_init');
  if (err) return { ok: false, error: err };

  const txnId = ctx.transaction_id;
  const txn = getTransaction(txnId);
  if (!txn) return { ok: false, error: `Unknown transaction_id: ${txnId}` };

  const parsed = parseOnInit(body);
  if (!parsed) return { ok: false, error: 'Could not parse on_init order' };

  updateTransaction(txnId, {
    status: OrderStatus.INITIALIZED,
    billing: parsed.billing,
    payment: parsed.payment,
    quote: { totalAmount: parsed.totalAmount, currency: parsed.currency },
  });

  eventBus.emit(txnId, { event: 'on_init', totalAmount: parsed.totalAmount, payment: parsed.payment });
  return { ok: true };
}

export function handleOnConfirm(body, eventBus) {
  const ctx = body?.context;
  const err = validateContext(ctx, 'on_confirm');
  if (err) return { ok: false, error: err };

  const txnId = ctx.transaction_id;
  const txn = getTransaction(txnId);
  if (!txn) return { ok: false, error: `Unknown transaction_id: ${txnId}` };

  const parsed = parseOnConfirm(body);
  if (!parsed) return { ok: false, error: 'Could not parse on_confirm order' };

  updateTransaction(txnId, {
    status: OrderStatus.CONFIRMED,
    orderId: parsed.orderId,
    orderStatus: parsed.orderStatus,
    ticket: { tickets: parsed.tickets, payment: parsed.payment },
  });

  eventBus.emit(txnId, { event: 'on_confirm', orderId: parsed.orderId, tickets: parsed.tickets });
  return { ok: true };
}

export function handleOnStatus(body, eventBus) {
  const ctx = body?.context;
  const err = validateContext(ctx, 'on_status');
  if (err) return { ok: false, error: err };

  const txnId = ctx.transaction_id;
  const txn = getTransaction(txnId);
  if (!txn) return { ok: false, error: `Unknown transaction_id: ${txnId}` };

  const parsed = parseOnStatus(body);
  if (!parsed) return { ok: false, error: 'Could not parse on_status order' };

  updateTransaction(txnId, {
    orderStatus: parsed.orderStatus,
    ticket: { tickets: parsed.tickets, payment: parsed.payment },
  });

  eventBus.emit(txnId, { event: 'on_status', orderStatus: parsed.orderStatus, tickets: parsed.tickets });
  return { ok: true };
}

export function handleOnSupport(body, eventBus) {
  const ctx = body?.context;
  const err = validateContext(ctx, 'on_support');
  if (err) return { ok: false, error: err };

  const txnId = ctx.transaction_id;
  const support = body?.message ?? {};

  eventBus.emit(txnId, { event: 'on_support', support });
  return { ok: true };
}
