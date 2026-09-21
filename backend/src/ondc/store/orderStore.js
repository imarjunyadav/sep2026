/**
 * In-memory order/transaction store for ONDC booking flow.
 *
 * Keyed by transaction_id. Stores the evolving state of each booking
 * through the full BAP flow: search → select → init → confirm → status.
 *
 * Ephemeral — suitable for Pramaan testing. Swap for a database for production.
 */

const store = new Map();

// Auto-expire entries after 2 hours to prevent unbounded growth
const TTL_MS = 2 * 60 * 60 * 1000;

export const OrderStatus = Object.freeze({
  SEARCHING: 'SEARCHING',
  SEARCH_COMPLETE: 'SEARCH_COMPLETE',
  SELECTED: 'SELECTED',
  INITIALIZED: 'INITIALIZED',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

/**
 * Create a new transaction entry. Returns the transaction_id.
 */
export function createTransaction(transactionId) {
  store.set(transactionId, {
    transactionId,
    status: OrderStatus.SEARCHING,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    // Set during on_search:
    bppId: null,
    bppUri: null,
    searchOptions: [],    // Array of catalog items from on_search
    // Set during select/on_select:
    selectedProviderId: null,
    selectedItemId: null,
    selectedFulfillmentId: null,
    quote: null,
    // Set during init/on_init:
    billing: null,
    payment: null,        // payment object from on_init (includes bank details)
    // Set during confirm/on_confirm:
    orderId: null,        // BPP's order.id
    ticket: null,         // { qrBase64, validTo, status, fulfillments }
    // Set during on_status:
    orderStatus: null,
  });
  return transactionId;
}

export function getTransaction(transactionId) {
  const entry = store.get(transactionId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(transactionId);
    return null;
  }
  return entry;
}

export function updateTransaction(transactionId, patch) {
  const entry = store.get(transactionId);
  if (!entry) return null;
  Object.assign(entry, patch, { updatedAt: Date.now() });
  return entry;
}

export function deleteTransaction(transactionId) {
  store.delete(transactionId);
}
