import crypto from 'node:crypto';
import { ondcConfig } from '../config.js';

/**
 * Build an ONDC context object per TRV11 2.0.0.
 *
 * @param {object} opts
 * @param {string} opts.action           e.g. 'search', 'on_search', 'confirm'
 * @param {string} [opts.transactionId]  Stable across one booking; generated if omitted
 * @param {string} [opts.messageId]      Unique per request; always generated fresh
 * @param {string} [opts.bppId]          Required for callbacks and post-search actions
 * @param {string} [opts.bppUri]         Required for callbacks and post-search actions
 * @param {string} [opts.cityCode]       Defaults to std:022 (Mumbai)
 * @returns {object}
 */
export function buildContext({
  action,
  transactionId,
  messageId,
  bppId,
  bppUri,
  cityCode = 'std:022',
}) {
  const ctx = {
    domain: 'ONDC:TRV11',
    action,
    version: '2.0.0',
    bap_id: ondcConfig.subscriberId,
    bap_uri: ondcConfig.subscriberUrl,
    transaction_id: transactionId ?? crypto.randomUUID(),
    message_id: messageId ?? crypto.randomUUID(),
    location: {
      country: { code: 'IND' },
      city: { code: cityCode },
    },
    timestamp: new Date().toISOString(),
    ttl: 'PT30S',
  };

  if (bppId) ctx.bpp_id = bppId;
  if (bppUri) ctx.bpp_uri = bppUri;

  return ctx;
}
