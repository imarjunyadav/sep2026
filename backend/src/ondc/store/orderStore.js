/**
 * ONDC order/transaction store.
 *
 * Uses Supabase (ondc_transactions table) when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set. Falls back to an in-memory Map
 * for local development.
 */

import { supabase } from './supabaseClient.js';

export const OrderStatus = Object.freeze({
  SEARCHING: 'SEARCHING',
  SEARCH_COMPLETE: 'SEARCH_COMPLETE',
  SELECTED: 'SELECTED',
  INITIALIZED: 'INITIALIZED',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

const TABLE = 'ondc_transactions';

// Column mapping: JS camelCase → DB snake_case
const toDb = (patch) => {
  const map = {
    transactionId: 'transaction_id',
    bppId: 'bpp_id',
    bppUri: 'bpp_uri',
    searchOptions: 'search_options',
    selectedProviderId: 'selected_provider_id',
    selectedItemId: 'selected_item_id',
    selectedFulfillmentId: 'selected_fulfillment_id',
    selectedQuantity: 'selected_quantity',
    orderId: 'order_id',
    orderStatus: 'order_status',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  };
  const row = {};
  for (const [k, v] of Object.entries(patch)) {
    row[map[k] ?? k] = v;
  }
  return row;
};

const fromDb = (row) => {
  if (!row) return null;
  return {
    transactionId: row.transaction_id,
    status: row.status,
    bppId: row.bpp_id,
    bppUri: row.bpp_uri,
    searchOptions: row.search_options ?? [],
    selectedProviderId: row.selected_provider_id,
    selectedItemId: row.selected_item_id,
    selectedFulfillmentId: row.selected_fulfillment_id,
    selectedQuantity: row.selected_quantity,
    quote: row.quote,
    billing: row.billing,
    payment: row.payment,
    orderId: row.order_id,
    orderStatus: row.order_status,
    ticket: row.ticket,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// ── Supabase implementation ──────────────────────────────────────────────────

async function sbCreate(transactionId) {
  const { error } = await supabase
    .from(TABLE)
    .insert({ transaction_id: transactionId, status: OrderStatus.SEARCHING });
  if (error) console.error('[store/supabase] create error:', error.message);
  return transactionId;
}

async function sbGet(transactionId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle();
  if (error) {
    console.error('[store/supabase] get error:', error.message);
    return null;
  }
  return fromDb(data);
}

async function sbUpdate(transactionId, patch) {
  const dbPatch = toDb(patch);
  delete dbPatch.transaction_id;
  const { data, error } = await supabase
    .from(TABLE)
    .update(dbPatch)
    .eq('transaction_id', transactionId)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[store/supabase] update error:', error.message);
    return null;
  }
  return fromDb(data);
}

async function sbDelete(transactionId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('transaction_id', transactionId);
  if (error) console.error('[store/supabase] delete error:', error.message);
}

// ── In-memory fallback ───────────────────────────────────────────────────────

const memStore = new Map();
const TTL_MS = 2 * 60 * 60 * 1000;

function memCreate(transactionId) {
  memStore.set(transactionId, {
    transactionId,
    status: OrderStatus.SEARCHING,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bppId: null,
    bppUri: null,
    searchOptions: [],
    selectedProviderId: null,
    selectedItemId: null,
    selectedFulfillmentId: null,
    quote: null,
    billing: null,
    payment: null,
    orderId: null,
    ticket: null,
    orderStatus: null,
  });
  return transactionId;
}

function memGet(transactionId) {
  const entry = memStore.get(transactionId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    memStore.delete(transactionId);
    return null;
  }
  return entry;
}

function memUpdate(transactionId, patch) {
  const entry = memStore.get(transactionId);
  if (!entry) return null;
  Object.assign(entry, patch, { updatedAt: Date.now() });
  return entry;
}

function memDelete(transactionId) {
  memStore.delete(transactionId);
}

// ── Exports (async-safe wrappers) ────────────────────────────────────────────

const useSupabase = Boolean(supabase);

if (useSupabase) {
  console.log('[store] Using Supabase for transaction storage');
} else {
  console.log('[store] Using in-memory store (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for persistence)');
}

export function createTransaction(transactionId) {
  if (useSupabase) {
    sbCreate(transactionId);
    memCreate(transactionId);
  } else {
    memCreate(transactionId);
  }
  return transactionId;
}

export function getTransaction(transactionId) {
  if (useSupabase) {
    const mem = memGet(transactionId);
    if (mem) return mem;
    return null;
  }
  return memGet(transactionId);
}

export async function getTransactionAsync(transactionId) {
  if (useSupabase) {
    const mem = memGet(transactionId);
    if (mem) return mem;
    const db = await sbGet(transactionId);
    if (db) {
      memStore.set(transactionId, { ...db, createdAt: Date.now() });
    }
    return db;
  }
  return memGet(transactionId);
}

export function updateTransaction(transactionId, patch) {
  if (useSupabase) {
    sbUpdate(transactionId, patch);
  }
  return memUpdate(transactionId, patch);
}

export function deleteTransaction(transactionId) {
  if (useSupabase) {
    sbDelete(transactionId);
  }
  memDelete(transactionId);
}
