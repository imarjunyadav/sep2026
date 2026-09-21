/**
 * ONDC Registry client — subscriber key lookup with TTL cache.
 *
 * The registry's /lookup endpoint returns subscriber info including
 * signing_public_key for signature verification.
 */

import https from 'node:https';
import { ondcConfig } from '../config.js';

// Cache: Map<`${subscriberId}|${uniqueKeyId}` -> { publicKey, expiresAt }>
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Look up a subscriber's Ed25519 public key from the ONDC registry.
 *
 * @param {string} subscriberId   e.g. 'api.example-bpp.com'
 * @param {string} uniqueKeyId    from the Authorization header keyId
 * @returns {Promise<string|null>} base64 public key or null if not found
 */
export async function lookupPublicKey(subscriberId, uniqueKeyId) {
  const cacheKey = `${subscriberId}|${uniqueKeyId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.publicKey;
  }

  try {
    const result = await registryLookup(subscriberId, uniqueKeyId);
    if (result) {
      cache.set(cacheKey, { publicKey: result, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return result;
  } catch (err) {
    console.error('[registry] lookup failed:', err.message);
    return null;
  }
}

async function registryLookup(subscriberId, uniqueKeyId) {
  const body = JSON.stringify({ subscriber_id: subscriberId, ukId: uniqueKeyId });
  const url = new URL('/v2.0/lookup', ondcConfig.registryUrl);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            // Registry returns an array; find matching subscriber+keyId
            const entry = Array.isArray(parsed)
              ? parsed.find(e => e.subscriber_id === subscriberId && e.ukId === uniqueKeyId)
              : parsed;
            resolve(entry?.signing_public_key ?? null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('registry lookup timeout')); });
    req.write(body);
    req.end();
  });
}
