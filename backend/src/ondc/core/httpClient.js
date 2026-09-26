/**
 * Signed outbound HTTP client for ONDC BAP requests.
 *
 * Every request is signed with the BAP's Ed25519 private key.
 * Returns the synchronous ACK/NACK from the BPP or Gateway.
 */

import https from 'node:https';
import { createAuthorizationHeader } from './signing.js';
import { ondcConfig } from '../config.js';
import { logRequest } from '../store/requestLog.js';

/**
 * POST a signed ONDC message to a URL.
 *
 * @param {string} url         Full URL (https://...)
 * @param {object} payload     The full ONDC request object { context, message }
 * @returns {Promise<object>}  Parsed JSON response (ACK/NACK)
 */
export async function signedPost(url, payload) {
  if (!ondcConfig.signingPrivateKey) {
    throw new Error('ONDC_SIGNING_PRIVATE_KEY not configured — set env vars before making ONDC requests');
  }

  const body = JSON.stringify(payload);

  console.log(`[ondc-http] --> POST ${url}`, body);

  const authHeader = createAuthorizationHeader(
    body,
    ondcConfig.signingPrivateKey,
    ondcConfig.subscriberId,
    ondcConfig.uniqueKeyId,
  );

  const start = Date.now();
  let resp;
  try {
    resp = await httpPost(url, body, authHeader);
    console.log(`[ondc-http] <-- ${url}`, JSON.stringify(resp));
    logRequest({
      direction: 'outbound',
      action: payload.context?.action,
      transactionId: payload.context?.transaction_id,
      messageId: payload.context?.message_id,
      url,
      requestBody: payload,
      responseBody: resp,
      durationMs: Date.now() - start,
    });
    return resp;
  } catch (err) {
    logRequest({
      direction: 'outbound',
      action: payload.context?.action,
      transactionId: payload.context?.transaction_id,
      messageId: payload.context?.message_id,
      url,
      requestBody: payload,
      durationMs: Date.now() - start,
      error: err.message,
    });
    throw err;
  }
}

async function httpPost(url, body, authorizationHeader) {
  const parsed = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: authorizationHeader,
        },
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data, status: res.statusCode });
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`ONDC request timeout: ${url}`));
    });
    req.write(body);
    req.end();
  });
}
