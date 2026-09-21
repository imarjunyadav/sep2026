/**
 * ONDC key generation utility.
 *
 * Generates the two key pairs required for ONDC BAP registration:
 *   1. Ed25519 signing key pair  (for request signing/verification)
 *   2. X25519 encryption key pair (for on_subscribe challenge decryption)
 *
 * Usage:
 *   node backend/src/ondc/keygen.js
 *
 * Output: base64-encoded keys to paste into .env and submit to ONDC portal.
 *
 * Key formats (verified against ONDC Onboarding doc + Postman examples):
 *   Ed25519 private key — 64 bytes base64 (libsodium: seed[0:32] + public[32:64])
 *   Ed25519 public key  — 32 bytes base64 (raw — portal accepts this format)
 *   X25519 private key  — 32 bytes base64 (raw scalar)
 *   X25519 public key   — 44 bytes base64 (SPKI DER — portal REQUIRES this format,
 *                          starts with "MCowBQYDK2VuAyEA...")
 */

import crypto from 'node:crypto';

function generateEd25519() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

  const privDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const pubDer = publicKey.export({ format: 'der', type: 'spki' });

  // Ed25519 PKCS8 DER: last 32 bytes = seed
  const seed = privDer.subarray(privDer.length - 32);
  // Ed25519 SPKI DER: last 32 bytes = raw public key
  const pub = pubDer.subarray(pubDer.length - 32);

  // libsodium private key format: seed(32) + public(32)
  const libsodiumPriv = Buffer.concat([seed, pub]);

  return {
    privateKey: libsodiumPriv.toString('base64'),  // 64 bytes
    publicKey: pub.toString('base64'),              // 32 bytes — raw, correct for portal
  };
}

function generateX25519() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('x25519');

  const privDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const pubDer = publicKey.export({ format: 'der', type: 'spki' });

  // X25519 PKCS8 DER: last 32 bytes = raw private scalar
  const rawPriv = privDer.subarray(privDer.length - 32);

  return {
    privateKey: rawPriv.toString('base64'),  // 32 bytes raw — correct for ONDC_ENCRYPTION_PRIVATE_KEY
    publicKey: pubDer.toString('base64'),    // 44 bytes SPKI DER — portal REQUIRES this format
  };
}

const signing = generateEd25519();
const encryption = generateX25519();

console.log('\n=== ONDC Key Generation ===\n');
console.log('Copy ALL four lines into .env (private keys) and GCP Secret Manager.\n');
console.log('# Ed25519 signing keys:');
console.log(`ONDC_SIGNING_PRIVATE_KEY=${signing.privateKey}`);
console.log(`ONDC_SIGNING_PUBLIC_KEY=${signing.publicKey}`);
console.log('');
console.log('# X25519 encryption keys:');
console.log(`ONDC_ENCRYPTION_PRIVATE_KEY=${encryption.privateKey}`);
console.log(`ONDC_ENCRYPTION_PUBLIC_KEY=${encryption.publicKey}`);
console.log('');
console.log('# Submit ONLY these two public keys to the ONDC portal /subscribe request:');
console.log(`  signing_public_key:    ${signing.publicKey}   (32 bytes, raw Ed25519)`);
console.log(`  encryption_public_key: ${encryption.publicKey}   (44 bytes, SPKI DER — starts with MCow...)`);
console.log('');
