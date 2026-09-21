/**
 * ONDC signing/verification — TRV11 2.0.0
 *
 * Signing algorithm: Ed25519 (standard Beckn HTTP Signatures)
 * Digest algorithm:  BLAKE-512 (blake2b-512)
 * Key format:        raw base64 bytes
 *   private key — 64 bytes (libsodium format: seed[0:32] + public[32:64])
 *   public key  — 32 bytes
 *
 * All implemented with Node.js built-in crypto — no external dependencies.
 * DER wrappers let Node's crypto accept the raw bytes ONDC keys use.
 */

import crypto from 'node:crypto';

// ── DER key wrappers ──────────────────────────────────────────────────────────

// PKCS8 DER prefix for Ed25519 private key (32-byte seed)
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
// SPKI DER prefix for Ed25519 public key (32 bytes)
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function privateKeyFromRawBase64(b64) {
  // Input: 64-byte base64 (libsodium: seed[0:32] + pub[32:64])
  const raw = Buffer.from(b64, 'base64');
  const seed = raw.subarray(0, 32);
  return crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

function publicKeyFromRawBase64(b64) {
  // Input: 32-byte base64
  const raw = Buffer.from(b64, 'base64');
  return crypto.createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
}

// ── Digest ─────────────────────────────────────────────────────────────────────

function blake2b512Base64(body) {
  const data = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  return crypto.createHash('blake2b512').update(data).digest('base64');
}

// ── Signing string ─────────────────────────────────────────────────────────────
// Format per Beckn HTTP Signatures (consistent ": " after each header name)
function buildSigningString(created, expires, digestBase64) {
  return `(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${digestBase64}`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Create an Authorization header value for an outbound ONDC request.
 *
 * @param {string|Buffer} body           Raw request body
 * @param {string} privateKeyBase64      64-byte Ed25519 private key (base64)
 * @param {string} subscriberId          Our subscriber_id (e.g. host only)
 * @param {string} uniqueKeyId           Our unique_key_id registered with ONDC
 * @returns {string}  Full "Signature keyId=..." header value
 */
export function createAuthorizationHeader(body, privateKeyBase64, subscriberId, uniqueKeyId) {
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 300; // 5 minutes validity

  const digestBase64 = blake2b512Base64(body);
  const signingString = buildSigningString(created, expires, digestBase64);

  const privKey = privateKeyFromRawBase64(privateKeyBase64);
  const signature = crypto
    .sign(null, Buffer.from(signingString, 'utf8'), privKey)
    .toString('base64');

  return (
    `Signature keyId="${subscriberId}|${uniqueKeyId}|ed25519",` +
    `algorithm="ed25519",` +
    `created="${created}",` +
    `expires="${expires}",` +
    `headers="(created) (expires) digest",` +
    `signature="${signature}"`
  );
}

/**
 * Verify an inbound Authorization or X-Gateway-Authorization header.
 *
 * @param {string} authHeader    Value of the Authorization header
 * @param {string|Buffer} body   Raw request body
 * @param {string} publicKeyBase64  32-byte Ed25519 public key (base64) from registry
 * @returns {{ ok: boolean, error?: string }}
 */
export function verifyAuthorizationHeader(authHeader, body, publicKeyBase64) {
  try {
    const params = parseSignatureParams(authHeader);
    if (!params) return { ok: false, error: 'malformed Authorization header' };

    const { created, expires, signature } = params;
    if (!created || !expires || !signature) {
      return { ok: false, error: 'missing required signature params' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > Number(expires)) return { ok: false, error: 'signature expired' };
    if (now < Number(created) - 60) return { ok: false, error: 'signature created in future' };

    const digestBase64 = blake2b512Base64(body);
    const signingString = buildSigningString(created, expires, digestBase64);

    const pubKey = publicKeyFromRawBase64(publicKeyBase64);
    const ok = crypto.verify(
      null,
      Buffer.from(signingString, 'utf8'),
      pubKey,
      Buffer.from(signature, 'base64'),
    );

    return ok ? { ok: true } : { ok: false, error: 'signature mismatch' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Extract keyId (subscriber_id|unique_key_id|algorithm) from Authorization header.
 */
export function extractKeyId(authHeader) {
  const params = parseSignatureParams(authHeader);
  return params?.keyId ?? null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseSignatureParams(header) {
  if (!header) return null;
  const body = header.replace(/^Signature\s+/, '');
  const params = {};
  // Match key="value" pairs (value may contain = but not ")
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    params[m[1]] = m[2];
  }
  return Object.keys(params).length > 0 ? params : null;
}
