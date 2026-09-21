/**
 * Generate the ONDC /subscribe request payload.
 *
 * Reads keys and subscriber config from .env, fills in all known static fields,
 * and marks fields that require legal entity details as FILL_IN.
 *
 * Usage (from repo root):
 *   node backend/src/ondc/scripts/subscribe-payload.js
 *
 * Output: JSON to POST to https://preprod.registry.ondc.org/ondc/subscribe
 *
 * Workflow:
 *   1. Fill in all FILL_IN fields below (or edit this script)
 *   2. POST the JSON to the registry
 *   3. Registry fetches /ondc-site-verification.html (must be live)
 *   4. Registry POSTs to /ondc/on_subscribe with a challenge
 *   5. Our handler decrypts and returns { answer }
 *   6. Registry confirms — check status with /v2.0/lookup
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../../.env') });

const subscriberId      = process.env.ONDC_SUBSCRIBER_ID;
const subscriberUrl     = process.env.ONDC_SUBSCRIBER_URL;
const uniqueKeyId       = process.env.ONDC_UNIQUE_KEY_ID;
const signingPublicKey  = process.env.ONDC_SIGNING_PUBLIC_KEY;
const encPublicKey      = process.env.ONDC_ENCRYPTION_PUBLIC_KEY;

const missing = [];
if (!subscriberId)     missing.push('ONDC_SUBSCRIBER_ID');
if (!subscriberUrl)    missing.push('ONDC_SUBSCRIBER_URL');
if (!uniqueKeyId)      missing.push('ONDC_UNIQUE_KEY_ID');
if (!signingPublicKey) missing.push('ONDC_SIGNING_PUBLIC_KEY');
if (!encPublicKey)     missing.push('ONDC_ENCRYPTION_PUBLIC_KEY');

if (missing.length > 0) {
  console.error('Error: Missing required .env values:', missing.join(', '));
  console.error('\nSteps:');
  console.error('  1. node backend/src/ondc/keygen.js         — generate signing + encryption keys');
  console.error('  2. node -e "console.log(require(\'crypto\').randomUUID())"  — generate ONDC_UNIQUE_KEY_ID');
  console.error('  3. Add all four values to .env');
  process.exit(1);
}

// Validate key formats
const sigPubBytes = Buffer.from(signingPublicKey, 'base64').length;
const encPubBytes = Buffer.from(encPublicKey, 'base64').length;

if (sigPubBytes !== 32) {
  console.error(`Error: ONDC_SIGNING_PUBLIC_KEY should be 32 bytes (got ${sigPubBytes}). Re-generate keys.`);
  process.exit(1);
}
if (encPubBytes !== 44) {
  console.error(`Error: ONDC_ENCRYPTION_PUBLIC_KEY should be 44 bytes SPKI DER (got ${encPubBytes}).`);
  console.error('  Ensure keygen.js was run after the X25519 format fix (MCow... prefix).');
  process.exit(1);
}

if (!encPublicKey.startsWith('MCow')) {
  console.warn('Warning: ONDC_ENCRYPTION_PUBLIC_KEY does not start with MCow — verify it is SPKI DER format.');
}

const now        = new Date();
const validFrom  = now.toISOString();
const oneYearOut = new Date(now);
oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
const validUntil = oneYearOut.toISOString();

const payload = {
  context: {
    operation: { ops_no: 1 },
  },
  message: {
    request_id: crypto.randomUUID(),
    timestamp: now.toISOString(),
    entity: {
      gst: {
        legal_entity_name: 'FILL_IN',        // legal name as on GST certificate
        business_address:  'FILL_IN',        // registered business address
        city_code:         ['std:022'],
        gst_no:            'FILL_IN',        // 15-char GSTIN (or SIH exemption ID)
      },
      pan: {
        name_as_per_pan: 'FILL_IN',          // name exactly as printed on PAN
        pan_no:          'FILL_IN',          // 10-char PAN
      },
      name_of_authorised_signatory:    'FILL_IN',
      address_of_authorised_signatory: 'FILL_IN',
      email_id:  'FILL_IN',
      mobile_no: 'FILL_IN',                  // 10-digit mobile, no country code
      country:   'IND',
      subscriber_id: subscriberId,           // host only, no scheme
      unique_key_id: uniqueKeyId,
      callback_url:  `${subscriberUrl}/ondc`,
      key_pair: {
        signing_public_key:    signingPublicKey,   // 32-byte raw Ed25519 base64
        encryption_public_key: encPublicKey,       // 44-byte SPKI DER X25519 base64 (MCow...)
        valid_from:  validFrom,
        valid_until: validUntil,
      },
    },
    network_participant: [
      {
        subscriber_url: `${subscriberUrl}/ondc`,
        domain:         'ONDC:TRV11',
        type:           'buyerApp',
        msn:            false,
        city_code:      ['std:022'],
      },
    ],
  },
};

console.log('\n# POST to: https://preprod.registry.ondc.org/ondc/subscribe');
console.log('# Content-Type: application/json');
console.log('# Replace all FILL_IN values before submitting\n');
console.log(JSON.stringify(payload, null, 2));
console.log('\n# After submitting, verify registration with:');
console.log(`# curl -s -X POST https://preprod.registry.ondc.org/v2.0/lookup \\`);
console.log(`#   -H 'Content-Type: application/json' \\`);
console.log(`#   -d '{"subscriber_id":"${subscriberId}","domain":"ONDC:TRV11"}'`);
