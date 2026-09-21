/**
 * Express middleware — verifies ONDC inbound request signatures.
 *
 * Applied to all callback endpoints (on_search, on_select, on_init,
 * on_confirm, on_status, on_support).
 *
 * Verifies:
 *   - Authorization header (from BPP)
 *   - X-Gateway-Authorization header (from BG/Gateway, when present on search flow)
 */

import { extractKeyId, verifyAuthorizationHeader } from './signing.js';
import { lookupPublicKey } from './registry.js';
import { nack, ErrCode } from './errors.js';

export async function ondcAuthMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const gatewayHeader = req.headers['x-gateway-authorization'];

  if (!authHeader) {
    return res.status(401).json(nack('DOMAIN-ERROR', ErrCode.INVALID_SIGNATURE, 'Missing Authorization header'));
  }

  // Raw body for signature verification — express json() parses it, so we re-serialize
  // We keep the original raw body via the rawBody field set by express.json({ verify })
  const rawBody = req.rawBody ?? JSON.stringify(req.body);

  const result = await verifyHeader(authHeader, rawBody);
  if (!result.ok) {
    console.warn('[ondc-auth] Authorization header invalid:', result.error);
    return res.status(401).json(nack('DOMAIN-ERROR', ErrCode.INVALID_SIGNATURE, result.error));
  }

  // When a Gateway-forwarded request also carries X-Gateway-Authorization, verify that too
  if (gatewayHeader) {
    const gwResult = await verifyHeader(gatewayHeader, rawBody);
    if (!gwResult.ok) {
      console.warn('[ondc-auth] X-Gateway-Authorization invalid:', gwResult.error);
      return res.status(401).json(nack('DOMAIN-ERROR', ErrCode.INVALID_SIGNATURE, gwResult.error));
    }
  }

  next();
}

async function verifyHeader(header, rawBody) {
  const keyId = extractKeyId(header);
  if (!keyId) return { ok: false, error: 'Cannot parse keyId from header' };

  const [subscriberId, uniqueKeyId, algorithm] = keyId.split('|');
  if (algorithm !== 'ed25519') return { ok: false, error: `Unsupported algorithm: ${algorithm}` };

  const publicKey = await lookupPublicKey(subscriberId, uniqueKeyId);
  if (!publicKey) return { ok: false, error: `No public key found for ${subscriberId}|${uniqueKeyId}` };

  return verifyAuthorizationHeader(header, rawBody, publicKey);
}
