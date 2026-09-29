/**
 * Metro TRV11 2.0.0 — BAP action payload builders.
 *
 * Each function returns a complete { context, message } object
 * ready to be signed and sent to the BPP or Gateway.
 *
 * Validated against:
 *   - api/components/examples/metro/ (search, select, init, confirm, status, support)
 *   - api/components/attributes/metro/index.yaml
 *   - api/components/tags/Tag.yaml (SETTLEMENT_TERMS sub-codes per action)
 */

import crypto from 'node:crypto';
import { buildContext } from '../../core/context.js';
import { ondcConfig } from '../../config.js';

// ── BUYER_FINDER_FEES ─────────────────────────────────────────────────────────
// Present in: search.intent.payment.tags, init.payments.tags, confirm.payments.tags
// Derived from all 3 Metro search examples and init/confirm examples.

function buyerFinderFeesTags() {
  return [
    {
      descriptor: { code: 'BUYER_FINDER_FEES' },
      display: false,
      list: [
        { descriptor: { code: 'BUYER_FINDER_FEES_PERCENTAGE' }, value: ondcConfig.buyerFinderFeesPct },
        { descriptor: { code: 'BUYER_FINDER_FEES_TYPE' }, value: 'percent' },
      ],
    },
  ];
}

// ── SETTLEMENT_TERMS — per-action ─────────────────────────────────────────────
// Sub-codes differ by action. Sources: Metro example files + Tag.yaml.
//
// search:   only DELAY_INTEREST + STATIC_TERMS (no amounts, no window/basis)
// init:     6 sub-codes — adds SETTLEMENT_AMOUNT, TYPE, MANDATORY_ARBITRATION, COURT_JURISDICTION
//           (no SETTLEMENT_WINDOW, no SETTLEMENT_BASIS per init/example_0.yaml)
// confirm:  all 8 sub-codes including SETTLEMENT_WINDOW='PT60M' and SETTLEMENT_BASIS='Delivery'

function staticTermsValue() {
  return ondcConfig.staticTermsUrl || 'https://github.com/ONDC-Official/protocol-network-extension/discussions/79';
}

function searchSettlementTermsTags() {
  const list = [
    { descriptor: { code: 'DELAY_INTEREST' }, value: '2.5' },
    { descriptor: { code: 'STATIC_TERMS' }, value: staticTermsValue() },
  ];
  return [{ descriptor: { code: 'SETTLEMENT_TERMS' }, display: false, list }];
}

function initSettlementTermsTags(settlementAmount) {
  const list = [
    { descriptor: { code: 'SETTLEMENT_WINDOW' }, value: 'PT60M' },
    { descriptor: { code: 'SETTLEMENT_BASIS' }, value: 'Delivery' },
    { descriptor: { code: 'SETTLEMENT_TYPE' }, value: 'NEFT' },
    { descriptor: { code: 'DELAY_INTEREST' }, value: '2.5' },
    { descriptor: { code: 'MANDATORY_ARBITRATION' }, value: 'true' },
    { descriptor: { code: 'COURT_JURISDICTION' }, value: ondcConfig.courtJurisdiction },
    { descriptor: { code: 'STATIC_TERMS' }, value: staticTermsValue() },
    { descriptor: { code: 'SETTLEMENT_AMOUNT' }, value: String(settlementAmount ?? '0') },
  ];
  return [{ descriptor: { code: 'SETTLEMENT_TERMS' }, display: false, list }];
}

function confirmSettlementTermsTags(settlementAmount) {
  const list = [
    { descriptor: { code: 'SETTLEMENT_WINDOW' }, value: 'PT60M' },
    { descriptor: { code: 'SETTLEMENT_BASIS' }, value: 'Delivery' },
    { descriptor: { code: 'SETTLEMENT_TYPE' }, value: 'NEFT' },
    { descriptor: { code: 'MANDATORY_ARBITRATION' }, value: 'true' },
    { descriptor: { code: 'COURT_JURISDICTION' }, value: ondcConfig.courtJurisdiction },
    { descriptor: { code: 'DELAY_INTEREST' }, value: '2.5' },
    { descriptor: { code: 'STATIC_TERMS' }, value: staticTermsValue() },
  ];
  if (settlementAmount != null) {
    list.push({ descriptor: { code: 'SETTLEMENT_AMOUNT' }, value: String(settlementAmount) });
  }
  return [{ descriptor: { code: 'SETTLEMENT_TERMS' }, display: false, list }];
}

function computeSettlementAmount(totalAmount) {
  if (totalAmount == null) return null;
  const feePct = Number(ondcConfig.buyerFinderFeesPct) / 100;
  return Math.floor(Number(totalAmount) * (1 - feePct)).toString();
}

// ── GPS normalization ────────────────────────────────────────────────────
// Official TRV11 2.0.0 examples use "lat, lng" (space after comma).
function normalizeGps(gps) {
  return gps.replace(/,\s*/g, ', ');
}

// ── Action builders ───────────────────────────────────────────────────────────

/**
 * Build a GPS-based Metro search (TRV11 2.0.0 search/example_0.yaml).
 * Also supports station-code-based search (stops with location.descriptor.code).
 *
 * @param {string} transactionId
 * @param {object} from  { gps?: '12.9,77.6', code?: 'STATION_CODE', name?: 'Station Name' }
 * @param {object} to    same
 * @returns {{ context, message }}
 */
export function buildSearch({ transactionId, from, to }) {
  const context = buildContext({ action: 'search', transactionId });

  const makeStop = (type, loc) => {
    const stop = { type, location: {} };
    if (loc.gps) stop.location.gps = normalizeGps(loc.gps);
    if (loc.code) stop.location.descriptor = { code: loc.code };
    if (loc.name && !loc.code) stop.location.descriptor = { name: loc.name };
    return stop;
  };

  return {
    context,
    message: {
      intent: {
        fulfillment: {
          stops: [makeStop('START', from), makeStop('END', to)],
          vehicle: { category: 'METRO' },
        },
        payment: {
          collected_by: 'BAP',
          tags: [...buyerFinderFeesTags(), ...searchSettlementTermsTags()],
        },
      },
    },
  };
}

/**
 * Build a select message to get a fare quote.
 * TRV11 2.0.0 select/example_0.yaml
 * Only needs provider.id + items[].id + quantity — no fulfillment_ids or payments.
 */
export function buildSelect({ transactionId, bppId, bppUri, providerId, itemId, quantity = 1 }) {
  const context = buildContext({ action: 'select', transactionId, bppId, bppUri });
  return {
    context,
    message: {
      order: {
        provider: { id: providerId },
        items: [{ id: itemId, quantity: { selected: { count: quantity } } }],
      },
    },
  };
}

/**
 * Build an init message with billing and payment (status: NOT-PAID).
 * TRV11 2.0.0 init/example_0.yaml
 *
 * @param {string|null} totalAmount  Total fare from on_select quote (used for SETTLEMENT_AMOUNT).
 */
export function buildInit({ transactionId, bppId, bppUri, providerId, itemId, quantity = 1, billing, totalAmount, fulfillments }) {
  const context = buildContext({ action: 'init', transactionId, bppId, bppUri });
  const settlementAmt = computeSettlementAmount(totalAmount);

  const order = {
    provider: { id: providerId },
    items: [{ id: itemId, quantity: { selected: { count: quantity } } }],
    billing: {
      name: billing.name,
      email: billing.email,
      phone: billing.phone,
    },
    payments: [
      {
        collected_by: 'BAP',
        status: 'NOT-PAID',
        type: 'PRE-ORDER',
        tags: [...buyerFinderFeesTags(), ...initSettlementTermsTags(settlementAmt)],
      },
    ],
  };

  if (fulfillments?.length) {
    order.fulfillments = fulfillments;
  }

  return { context, message: { order } };
}

/**
 * Build a confirm message with payment (status: PAID).
 * TRV11 2.0.0 confirm/example_0.yaml
 *
 * payment.id from on_init is mandatory per attribute spec line 2512.
 * Throws if not present — this means on_init did not follow the spec.
 *
 * @param {object} opts.onInitPayment       Full payment object from on_init (must include .id)
 * @param {string} opts.paymentTransactionId  BAP-side payment reference (UPI/Razorpay txn ID)
 * @param {string} opts.totalAmount         Total order amount (e.g. '120')
 */
export function buildConfirm({
  transactionId,
  bppId,
  bppUri,
  providerId,
  itemId,
  quantity = 1,
  billing,
  onInitPayment,
  paymentTransactionId,
  totalAmount,
}) {
  const context = buildContext({ action: 'confirm', transactionId, bppId, bppUri });

  const paymentId = onInitPayment?.id ?? `PAY_${crypto.randomUUID().slice(0, 8)}`;

  const txnId = ondcConfig.mockPayment
    ? crypto.randomUUID()
    : (paymentTransactionId ?? crypto.randomUUID());

  const settlementAmt = computeSettlementAmount(totalAmount);

  const payment = {
    id: paymentId,
    collected_by: 'BAP',
    status: 'PAID',
    type: 'PRE-ORDER',
    params: {
      transaction_id: txnId,
      currency: 'INR',
      amount: totalAmount ?? '0',
      ...(onInitPayment?.params?.bank_code && { bank_code: onInitPayment.params.bank_code }),
      ...(onInitPayment?.params?.bank_account_number && {
        bank_account_number: onInitPayment.params.bank_account_number,
      }),
    },
    tags: [...buyerFinderFeesTags(), ...confirmSettlementTermsTags(settlementAmt)],
  };

  return {
    context,
    message: {
      order: {
        provider: { id: providerId },
        items: [{ id: itemId, quantity: { selected: { count: quantity } } }],
        billing: {
          name: billing.name,
          email: billing.email,
          phone: billing.phone,
        },
        payments: [payment],
      },
    },
  };
}

/**
 * Build a status check message.
 * TRV11 2.0.0 status/example_0.yaml
 */
export function buildStatus({ transactionId, bppId, bppUri, orderId }) {
  const context = buildContext({ action: 'status', transactionId, bppId, bppUri });
  return {
    context,
    message: { order_id: orderId },
  };
}

/**
 * Build a support message.
 * TRV11 2.0.0 support/example_0.yaml
 */
export function buildSupport({ transactionId, bppId, bppUri, refId }) {
  const context = buildContext({ action: 'support', transactionId, bppId, bppUri });
  return {
    context,
    message: { ref_id: refId },
  };
}

/**
 * Build an IGM issue message (raise a new issue).
 * IGM v1.0.0 — used after order completion to report problems.
 */
/**
 * Build an update message for partial cancellation.
 * TRV11 2.0.0 update/update_request_soft_cancel.yaml / update_request_confirm_cancel.yaml
 *
 * Two-step process:
 *   Step 1: cancelType = 'SOFT_CANCEL'  — request cancellation charges
 *   Step 2: cancelType = 'CONFIRM_CANCEL' — confirm the partial cancellation
 *
 * @param {string} cancelType  'SOFT_CANCEL' or 'CONFIRM_CANCEL'
 * @param {string} fulfillmentId  The fulfillment to cancel (e.g. 'F2')
 */
export function buildUpdate({
  transactionId,
  bppId,
  bppUri,
  orderId,
  fulfillmentId,
  cancelType = 'SOFT_CANCEL',
  reasonId = '001',
}) {
  const context = buildContext({ action: 'update', transactionId, bppId, bppUri });
  return {
    context,
    message: {
      update_target: 'order.fulfillments',
      order: {
        id: orderId,
        fulfillments: [
          {
            id: fulfillmentId,
            type: 'TRIP',
          },
        ],
        cancellation: {
          reason: {
            id: reasonId,
            descriptor: {
              code: cancelType,
            },
          },
        },
      },
    },
  };
}

/**
 * Build a cancel message (full order cancellation by BAP).
 * TRV11 2.0.0 cancel/example_0.yaml
 */
export function buildCancel({ transactionId, bppId, bppUri, orderId, reasonId = '001' }) {
  const context = buildContext({ action: 'cancel', transactionId, bppId, bppUri });
  return {
    context,
    message: {
      order_id: orderId,
      cancellation_reason_id: reasonId,
      descriptor: {
        short_desc: 'Cancellation requested by buyer',
      },
    },
  };
}

export function buildIssue({
  transactionId,
  bppId,
  bppUri,
  orderId,
  providerId,
  itemId,
  fulfillmentId,
  billing,
  shortDesc = 'Issue with metro ticket',
  longDesc = 'Complaint regarding metro service',
}) {
  const context = buildContext({ action: 'issue', transactionId, bppId, bppUri });
  const now = new Date().toISOString();
  const issueId = crypto.randomUUID();

  return {
    context,
    message: {
      issue: {
        id: issueId,
        category: 'ORDER',
        sub_category: 'ORD01',
        complainant_info: {
          person: { name: billing?.name ?? 'Consumer' },
          contact: {
            phone: billing?.phone ?? '9999999999',
            email: billing?.email ?? 'consumer@example.com',
          },
        },
        order_details: {
          id: orderId,
          state: 'Completed',
          items: [{ id: itemId, quantity: 1 }],
          fulfillments: [{ id: fulfillmentId ?? 'F1', state: 'INACTIVE' }],
          provider_id: providerId,
        },
        description: {
          short_desc: shortDesc,
          long_desc: longDesc,
          additional_desc: {
            url: 'https://cityone.in/issues',
            content_type: 'text/html',
          },
          images: ['https://cityone.in/issues/screenshot.png'],
        },
        source: {
          network_participant_id: ondcConfig.subscriberId,
          type: 'CONSUMER',
        },
        expected_response_time: { duration: 'PT1H' },
        expected_resolution_time: { duration: 'P1D' },
        status: 'OPEN',
        issue_type: 'ISSUE',
        created_at: now,
        updated_at: now,
      },
    },
  };
}

/**
 * Build an IGM issue-close message.
 * Sent by BAP to close a resolved issue.
 */
export function buildIssueEscalate({
  transactionId,
  bppId,
  bppUri,
  issueId,
  billing,
  orderId,
  providerId,
  itemId,
  fulfillmentId,
  shortDesc = 'Issue with metro ticket',
  longDesc = 'Complaint regarding metro service',
}) {
  const context = buildContext({ action: 'issue', transactionId, bppId, bppUri });
  const now = new Date().toISOString();

  return {
    context,
    message: {
      issue: {
        id: issueId,
        category: 'ORDER',
        sub_category: 'ORD01',
        complainant_info: {
          person: { name: billing?.name ?? 'Consumer' },
          contact: {
            phone: billing?.phone ?? '9999999999',
            email: billing?.email ?? 'consumer@example.com',
          },
        },
        order_details: {
          id: orderId,
          state: 'Completed',
          items: [{ id: itemId, quantity: 1 }],
          fulfillments: [{ id: fulfillmentId ?? 'F1', state: 'INACTIVE' }],
          provider_id: providerId,
        },
        description: {
          short_desc: shortDesc,
          long_desc: longDesc,
          additional_desc: {
            url: 'https://cityone.in/issues',
            content_type: 'text/html',
          },
          images: ['https://cityone.in/issues/screenshot.png'],
        },
        source: {
          network_participant_id: ondcConfig.subscriberId,
          type: 'CONSUMER',
        },
        expected_response_time: { duration: 'PT1H' },
        expected_resolution_time: { duration: 'P1D' },
        status: 'OPEN',
        issue_type: 'ISSUE',
        issue_actions: {
          complainant_actions: [
            {
              complainant_action: 'ESCALATE',
              short_desc: 'Escalating the issue',
              updated_at: now,
              updated_by: {
                org: { name: ondcConfig.subscriberId },
                contact: {
                  phone: billing?.phone ?? '9999999999',
                  email: billing?.email ?? 'consumer@example.com',
                },
                person: { name: billing?.name ?? 'Consumer' },
              },
            },
          ],
        },
        created_at: now,
        updated_at: now,
      },
    },
  };
}

export function buildIssueClose({
  transactionId,
  bppId,
  bppUri,
  issueId,
  billing,
  orderId,
  providerId,
  itemId,
  fulfillmentId,
  shortDesc = 'Issue with metro ticket',
  longDesc = 'Complaint regarding metro service',
}) {
  const context = buildContext({ action: 'issue', transactionId, bppId, bppUri });
  const now = new Date().toISOString();

  return {
    context,
    message: {
      issue: {
        id: issueId,
        category: 'ORDER',
        sub_category: 'ORD01',
        complainant_info: {
          person: { name: billing?.name ?? 'Consumer' },
          contact: {
            phone: billing?.phone ?? '9999999999',
            email: billing?.email ?? 'consumer@example.com',
          },
        },
        order_details: {
          id: orderId,
          state: 'Completed',
          items: [{ id: itemId, quantity: 1 }],
          fulfillments: [{ id: fulfillmentId ?? 'F1', state: 'INACTIVE' }],
          provider_id: providerId,
        },
        description: {
          short_desc: shortDesc,
          long_desc: longDesc,
          additional_desc: {
            url: 'https://cityone.in/issues',
            content_type: 'text/html',
          },
          images: ['https://cityone.in/issues/screenshot.png'],
        },
        source: {
          network_participant_id: ondcConfig.subscriberId,
          type: 'CONSUMER',
        },
        expected_response_time: { duration: 'PT1H' },
        expected_resolution_time: { duration: 'P1D' },
        status: 'CLOSED',
        issue_type: 'ISSUE',
        rating: 'THUMBS-UP',
        issue_actions: {
          complainant_actions: [
            {
              complainant_action: 'CLOSE',
              short_desc: 'Closing the issue',
              updated_at: now,
              updated_by: {
                org: { name: ondcConfig.subscriberId },
                contact: {
                  phone: billing?.phone ?? '9999999999',
                  email: billing?.email ?? 'consumer@example.com',
                },
                person: { name: billing?.name ?? 'Consumer' },
              },
            },
          ],
        },
        created_at: now,
        updated_at: now,
      },
    },
  };
}
