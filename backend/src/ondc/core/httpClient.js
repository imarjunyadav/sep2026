/**
 * Signed outbound HTTP client for ONDC BAP requests.
 *
 * Every request is signed with the BAP's Ed25519 private key.
 * Returns the synchronous ACK/NACK from the BPP or Gateway.
 */

import https from 'node:https';
import { createAuthorizationHeader } from './signing.js';
import { ondcConfig } from '../config.js';

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

  const authHeader = createAuthorizationHeader(
    body,
    ondcConfig.signingPrivateKey,
    ondcConfig.subscriberId,
    ondcConfig.uniqueKeyId,
  );

  return httpPost(url, body, authHeader);
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
