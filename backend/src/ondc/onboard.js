/**
 * ONDC onboarding artifacts.
 *
 * Covers:
 *   GET  /ondc-site-verification.html  — site ownership proof (served at root by server.js)
 *   POST /ondc/on_subscribe            — challenge-response for key proof
 *
 * The on_subscribe handler decrypts a challenge using the BAP's X25519
 * encryption private key (DH with ONDC's fixed published X25519 public key)
 * and returns it in plaintext. Uses Node.js built-in crypto.
 */

import crypto from 'node:crypto';
import { ondcConfig } from './config.js';

// ── DER key wrapper for X25519 private key ────────────────────────────────────
const PKCS8_X25519_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');

function x25519PrivateKey(base64) {
  const raw = Buffer.from(base64, 'base64').subarray(0, 32);
  return crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_X25519_PREFIX, raw]),
    format: 'der',
    type: 'pkcs8',
  });
}

// ONDC's fixed X25519 public keys (SPKI DER, base64) used to encrypt on_subscribe challenges.
// ONDC uses a static key per environment — NOT an ephemeral key per challenge.
// Source: ONDC Onboarding Guide (Network Participant Onboarding v2.x).
const ONDC_ENC_PUBLIC_KEYS = {
  uat:  'MCowBQYDK2VuAyEARa/WcMCzNQp4DWjvTI4DK7vHL6EdaHqN4GjFIu9wxxM=',
  prod: 'MCowBQYDK2VuAyEAwASk2D4O3p/tuD8f9sNQAQlwOU2w3DAumcOK9qHCFwI=',
};

/**
 * Serve the ONDC site verification HTML.
 *
 * The meta tag value is: base64( Ed25519_sign(unique_req_id, privKey) )
 * where unique_req_id comes from the ONDC portal during onboarding.
 *
 * Served at root path /ondc-site-verification.html (registered in server.js, not router.js).
 */
export function siteVerificationHandler(req, res) {
  const signedContent = process.env.ONDC_SITE_VERIFICATION_SIGNED || '';

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta name="ondc-site-verification" content="${signedContent}" />
  </head>
  <body>CityOne ONDC BAP</body>
</html>`);
}

/**
 * POST /ondc/on_subscribe
 *
 * ONDC registry calls this during subscriber onboarding.
 * Request body: { subscriber_id, challenge }
 *   challenge is base64( AES-128-ECB( challengeString, aesKey ) )
 *   where aesKey = SHA-256( X25519-DH( ONDC_fixed_priv, our_enc_pub ) )[0:16]
 *
 * Decryption:
 *   1. X25519 ECDH: our private key × ONDC's fixed published public key → sharedSecret
 *   2. aesKey = SHA-256(sharedSecret)[0:16]
 *   3. AES-128-ECB decrypt(challenge) → challengeString
 *   4. Return { answer: challengeString }
 */
export async function onSubscribeHandler(req, res) {
  try {
    const { challenge } = req.body ?? {};

    if (!challenge) {
      return res.status(400).json({ error: 'Missing challenge' });
    }

    if (!ondcConfig.encryptionPrivateKey) {
      console.error('[on_subscribe] ONDC_ENCRYPTION_PRIVATE_KEY not set');
      return res.status(500).json({ error: 'Encryption key not configured' });
    }

    const answer = decryptChallenge(challenge, ondcConfig.encryptionPrivateKey);
    return res.json({ answer });
  } catch (err) {
    console.error('[on_subscribe] Error:', err.message);
    return res.status(500).json({ error: 'Failed to decrypt challenge', detail: err.message });
  }
}

function decryptChallenge(encryptedBase64, encPrivBase64) {
  const privKey = x25519PrivateKey(encPrivBase64);

  // ONDC uses a fixed published X25519 public key per environment to encrypt challenges.
  const ondcPubKeyB64 = ONDC_ENC_PUBLIC_KEYS[ondcConfig.env] ?? ONDC_ENC_PUBLIC_KEYS.uat;
  const ondcPubKey = crypto.createPublicKey({
    key: Buffer.from(ondcPubKeyB64, 'base64'),
    format: 'der',
    type: 'spki',
  });

  const sharedSecret = crypto.diffieHellman({ privateKey: privKey, publicKey: ondcPubKey });
  const aesKey = crypto.createHash('sha256').update(sharedSecret).digest().subarray(0, 16);

  const decipher = crypto.createDecipheriv('aes-128-ecb', aesKey, null);
  decipher.setAutoPadding(true);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}
