/**
 * Sign the ONDC portal's unique_req_id for site verification.
 *
 * Run AFTER setting ONDC_SIGNING_PRIVATE_KEY in .env.
 * The unique_req_id comes from the ONDC portal during /subscribe onboarding.
 *
 * Usage (from repo root):
 *   node backend/src/ondc/scripts/sign-site-verification.js <unique_req_id>
 *
 * Output: prints ONDC_SITE_VERIFICATION_SIGNED=<value>
 *   1. Add that line to .env
 *   2. Add it to GCP Secret Manager (ONDC_SITE_VERIFICATION_SIGNED)
 *   3. Redeploy Cloud Run
 *   4. Verify: curl https://<subscriber_id>/ondc-site-verification.html
 *   5. The page must show: <meta name="ondc-site-verification" content="<value>"/>
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../../.env') });

const uniqueReqId = process.argv[2];

if (!uniqueReqId) {
  console.error('Error: unique_req_id is required.');
  console.error('Usage: node backend/src/ondc/scripts/sign-site-verification.js <unique_req_id>');
  console.error('Get the unique_req_id from the ONDC portal during onboarding.');
  process.exit(1);
}

const privKeyB64 = process.env.ONDC_SIGNING_PRIVATE_KEY;
if (!privKeyB64) {
  console.error('Error: ONDC_SIGNING_PRIVATE_KEY not set in .env');
  console.error('Generate keys first: node backend/src/ondc/keygen.js');
  process.exit(1);
}

// Reconstruct Ed25519 private key from libsodium format (seed[0:32] + pub[32:64])
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const raw = Buffer.from(privKeyB64, 'base64');
if (raw.length !== 64) {
  console.error(`Error: ONDC_SIGNING_PRIVATE_KEY should be 64 bytes (got ${raw.length}). Re-generate keys.`);
  process.exit(1);
}
const seed = raw.subarray(0, 32);
const privKey = crypto.createPrivateKey({
  key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
  format: 'der',
  type: 'pkcs8',
});

const signature = crypto
  .sign(null, Buffer.from(uniqueReqId, 'utf8'), privKey)
  .toString('base64');

const subscriberId = process.env.ONDC_SUBSCRIBER_ID || '<your-host>';

console.log('\n# Add this to .env and GCP Secret Manager:');
console.log(`ONDC_SITE_VERIFICATION_SIGNED=${signature}`);
console.log('\n# After redeploying, verify with:');
console.log(`curl https://${subscriberId}/ondc-site-verification.html`);
console.log('\n# The response must contain:');
console.log(`#   <meta name="ondc-site-verification" content="${signature}"/>`);
