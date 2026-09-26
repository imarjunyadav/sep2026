/**
 * ONDC request/response logger.
 * Writes to Supabase ondc_request_log table when available, otherwise console-only.
 */

import { supabase } from './supabaseClient.js';

export async function logRequest({
  direction,
  action,
  transactionId,
  messageId,
  url,
  requestBody,
  responseBody,
  statusCode,
  durationMs,
  error,
}) {
  if (!supabase) return;

  const { error: dbErr } = await supabase.from('ondc_request_log').insert({
    direction,
    action,
    transaction_id: transactionId ?? null,
    message_id: messageId ?? null,
    url: url ?? null,
    request_body: requestBody ?? null,
    response_body: responseBody ?? null,
    status_code: statusCode ?? null,
    duration_ms: durationMs ?? null,
    error: error ?? null,
  });

  if (dbErr) console.error('[request-log] write failed:', dbErr.message);
}
