# ONDC BAP Implementation Guide

This document covers the complete ONDC TRV11 v2.0.0 BAP (Buyer App) implementation in CityOne. It is intended for engineers continuing ONDC integration, Pramaan testing, and ONDC certification.

---

## Table of Contents

1. [What ONDC Is and Our Role](#what-ondc-is-and-our-role)
2. [Identity and Registration](#identity-and-registration)
3. [Signing and Verification](#signing-and-verification)
4. [The Full Booking Flow](#the-full-booking-flow)
5. [Code Map](#code-map)
6. [Environment Variables Reference](#environment-variables-reference)
7. [ONDC Endpoints](#ondc-endpoints)
8. [Payload Reference](#payload-reference)
9. [Order Store and SSE Events](#order-store-and-sse-events)
10. [Postman Testing Guide](#postman-testing-guide)
11. [Onboarding and Site Verification](#onboarding-and-site-verification)
12. [Known Limitations](#known-limitations)

---

## What ONDC Is and Our Role

ONDC (Open Network for Digital Commerce) is an open protocol for commerce, built on the Beckn specification. It enables any buyer app and any seller app to transact without direct integration — they speak a common protocol over HTTP.

**CityOne's role: BAP (Buyer App Platform)**

A BAP:
- Initiates all transactions (search, select, init, confirm, status, support)
- Signs every outgoing request with its Ed25519 private key
- Receives async callback responses from BPPs at its public URL
- Verifies the Ed25519 signature on every inbound callback using the BPP's public key from the ONDC registry

**BPP (Buyer Platform Provider / Seller App)**: the Metro operator's software. BPPs register their catalog in the ONDC network and respond to our requests with catalogs, quotes, and ticket confirmations.

**ONDC Gateway**: a network intermediary that receives our `/search` and fans it out to all registered BPPs matching our domain and city. Only `/search` goes via the Gateway — all subsequent actions go directly to the BPP.

**Protocol Workbench**: ONDC's reference BPP for pre-production testing. Use it at `https://ref.app.ondc.org` during Pramaan testing.

**Domain**: `ONDC:TRV11` — ONDC's transit/mobility domain (Metro, Bus, Ferry). Version: `2.0.0`.

---

## Identity and Registration

| Field | Value |
|---|---|
| `subscriber_id` | `ONDC_SUBSCRIBER_ID` env var — set after completing ONDC registration |
| `subscriber_url` | `ONDC_SUBSCRIBER_URL` env var — your public HTTPS base URL |
| Domain | `ONDC:TRV11` |
| City | `std:022` (Mumbai) |
| Type | `buyerApp` |
| Environment | Pre-production (`preprod.registry.ondc.org`) |

The `subscriber_id` is included in every outgoing request's `context.bap_id`. The `subscriber_url` is `context.bap_uri` — BPPs send async callbacks by appending the action: `POST {ONDC_SUBSCRIBER_URL}/on_search`.

The `unique_key_id` is a UUID assigned during registration and included in every Authorization header's `keyId`.

### Key pairs

Two key pairs are required:

**Ed25519 (signing):** Used to sign every outbound request and to verify inbound callbacks.
- Private key: 64 bytes base64 (libsodium format: `seed[0:32] + public[32:64]`)
- Public key: 32 bytes base64 (raw)
- Registered in the ONDC registry; any BPP can look up our public key to verify our signatures

**X25519 (encryption):** Used only during the `/on_subscribe` challenge-response onboarding step.
- Private key: 32 bytes base64 (raw scalar)
- Public key: 44 bytes base64 (SPKI DER format, always starts with `MCow`)

If you ever need to re-generate keys (for a new registration):
```bash
node backend/src/ondc/keygen.js
```
Run this once per ONDC registration. Store the output securely — the private keys cannot be recovered if lost and would require re-registration with ONDC.

---

## Signing and Verification

### Outbound request signing

Every request we send to the ONDC Gateway or a BPP must carry an `Authorization` header in this format:

```
Signature keyId="{subscriber_id}|<unique_key_id>|ed25519",
          algorithm="ed25519",
          created="<unix_timestamp>",
          expires="<unix_timestamp + 300>",
          headers="(created) (expires) digest",
          signature="<base64>"
```

How the signature is produced (`backend/src/ondc/core/signing.js`):

1. Hash the raw request body bytes with **BLAKE2b-512**: `blake2b512(body)` → 64-byte hash → base64
2. Build the signing string:
   ```
   (created): <unix_ts>
   (expires): <unix_ts + 300>
   digest: BLAKE-512=<base64_of_hash>
   ```
3. Sign the UTF-8 bytes of that string with our **Ed25519 private key**
4. Base64-encode the 64-byte signature
5. Assemble the `Signature ...` header

The 5-minute `expires` window is enforced by receivers — stale signatures are rejected.

### Inbound callback verification

When a BPP sends a callback to `/on_search` etc., the `ondcAuthMiddleware` (`backend/src/ondc/core/authMiddleware.js`):

1. Parses the `Authorization` header and extracts `keyId`, `created`, `expires`, `signature`
2. Derives the BPP's `subscriber_id` and `ukId` from `keyId`
3. Calls the ONDC registry (`POST https://preprod.registry.ondc.org/v2.0/lookup`) to get the BPP's Ed25519 public key — cached for 5 minutes per subscriber/key pair
4. Re-derives the signing string using the raw request body (`req.rawBody`) and the `created`/`expires` from the header
5. Verifies the Ed25519 signature against the registry public key
6. If an `X-Gateway-Authorization` header is also present, verifies that separately (same process, Gateway's key)

The raw body is captured by this middleware in `server.js`:
```js
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
```
Without this, `req.body` is the parsed JSON object and the original bytes (which were actually hashed and signed) are lost.

---

## The Full Booking Flow

```
User selects Metro in CityOne
         │
         ▼
POST /ondc/api/search  (CityOne frontend → backend)
         │  backend creates txnId, signs, POSTs to gateway
         ▼
POST https://preprod.gateway.ondc.org/search
         │  gateway fans out to BPPs in domain=ONDC:TRV11, city=std:022
         ▼
Backend receives ACK from gateway
         │  returns { txnId } to frontend
         │  frontend opens SSE: GET /ondc/api/events/:txnId
         │
         │  [async, ~1–5 seconds later]
         ▼
POST https://{ONDC_SUBSCRIBER_URL}/on_search  (BPP → our server)
         │  backend verifies BPP signature
         │  parses catalog → stores searchOptions, bppId, bppUri
         │  emits SSE event { event: 'on_search', options: [...] }
         │
         ▼
Frontend shows route options, user picks one
         │
         ▼
POST /ondc/api/select  { txnId, providerId, itemId, quantity }
         │  backend signs, POSTs directly to {bppUri}/select
         │
         │  [async]
         ▼
POST https://{ONDC_SUBSCRIBER_URL}/on_select  (BPP → our server)
         │  backend stores quote (totalAmount, currency, breakup, payment)
         │  emits SSE { event: 'on_select', quote }
         │
         ▼
User enters billing details
         │
         ▼
POST /ondc/api/init  { txnId, billing: { name, email, phone } }
         │  backend stores billing, signs, POSTs to {bppUri}/init
         │
         │  [async]
         ▼
POST https://{ONDC_SUBSCRIBER_URL}/on_init  (BPP → our server)
         │  backend stores payment object (includes BPP's payment.id)
         │  emits SSE { event: 'on_init', totalAmount, payment }
         │
         ▼
User pays (UPI/Razorpay/etc.) — outside ONDC protocol
         │
         ▼
POST /ondc/api/confirm  { txnId, paymentTransactionId }
         │  backend uses payment object from on_init (with payment.id)
         │  changes payment.status to PAID
         │  signs, POSTs to {bppUri}/confirm
         │
         │  [async]
         ▼
POST https://{ONDC_SUBSCRIBER_URL}/on_confirm  (BPP → our server)
         │  backend stores orderId, QR ticket data
         │  emits SSE { event: 'on_confirm', orderId, tickets }
         │
         ▼
Frontend shows QR code — user scans at Metro gate
```

**Key timing note**: Every action is fire-and-forget. The BAP sends a request and immediately gets back a synchronous ACK. The real response (catalog, quote, ticket) arrives as a separate async POST from the BPP seconds later. The SSE stream keeps the frontend updated in real-time.

---

## Code Map

| File | Purpose |
|---|---|
| `backend/src/ondc/config.js` | All ONDC env var reads |
| `backend/src/ondc/core/context.js` | Builds the `context` object for every outbound request |
| `backend/src/ondc/core/signing.js` | Ed25519 sign/verify, BLAKE-512 digest |
| `backend/src/ondc/core/authMiddleware.js` | Express middleware that verifies inbound BPP signatures |
| `backend/src/ondc/core/registry.js` | ONDC registry lookup with 5-min TTL cache |
| `backend/src/ondc/core/httpClient.js` | `signedPost(url, payload)` — signs and sends a request |
| `backend/src/ondc/core/errors.js` | `ack()`, `nack()`, ONDC error codes |
| `backend/src/ondc/adapters/metro/actions.js` | Builds TRV11 v2.0.0 payloads: search/select/init/confirm/status/support |
| `backend/src/ondc/adapters/metro/callbacks.js` | Handles inbound BPP responses: on_search/on_select/… |
| `backend/src/ondc/adapters/metro/mapper.js` | Parses raw ONDC JSON into CityOne-friendly objects |
| `backend/src/ondc/store/orderStore.js` | In-memory transaction store (search → ticket lifecycle) |
| `backend/src/ondc/router.js` | Express router: /ondc/api/* + /ondc/on_* + SSE |
| `backend/src/server.js` | Root-level /on_* routes (the real BPP callback destinations) |
| `backend/src/ondc/onboard.js` | Site verification handler + on_subscribe decryption |
| `backend/src/ondc/keygen.js` | Key generation utility |
| `backend/src/ondc/scripts/sign-site-verification.js` | Sign the unique_req_id for site verification |
| `backend/src/ondc/scripts/subscribe-payload.js` | Generate the /subscribe registration payload |

---

## Environment Variables Reference

See the main [README Environment Variables section](../README.md#environment-variables) for the full table. ONDC-specific variables:

```
ONDC_SUBSCRIBER_ID=<your-registered-domain>
ONDC_SUBSCRIBER_URL=https://<your-registered-domain>
ONDC_UNIQUE_KEY_ID=<uuid-from-ondc-portal>
ONDC_SIGNING_PRIVATE_KEY=<64-byte-base64>    # secret
ONDC_SIGNING_PUBLIC_KEY=<32-byte-base64>
ONDC_ENCRYPTION_PRIVATE_KEY=<32-byte-base64> # secret
ONDC_ENCRYPTION_PUBLIC_KEY=<44-byte-base64-MCow...>
ONDC_SITE_VERIFICATION_SIGNED=<base64-signature>
ONDC_REGISTRY_URL=https://preprod.registry.ondc.org
ONDC_GATEWAY_URL=https://preprod.gateway.ondc.org
ONDC_ENV=uat
ONDC_MOCK_PAYMENT=false
ONDC_BUYER_FINDER_FEES_PCT=1
ONDC_COURT_JURISDICTION=Mumbai
ONDC_STATIC_TERMS_URL=
```

---

## ONDC Endpoints

### Inbound (BPP → our server)

All six callback actions arrive at root-level routes (because `bap_uri = {ONDC_SUBSCRIBER_URL}` has no path, so the BPP appends the action directly). These routes are also available under `/ondc/on_*` as aliases.

| Route | Handler |
|---|---|
| `GET /ondc-site-verification.html` | Returns HTML with signed `<meta>` tag |
| `POST /on_subscribe` (and `/ondc/on_subscribe`) | Decrypts ONDC challenge, returns `{ answer }` |
| `POST /on_search` (and `/ondc/on_search`) | Parses catalog, stores options, emits SSE |
| `POST /on_select` (and `/ondc/on_select`) | Parses quote, stores, emits SSE |
| `POST /on_init` (and `/ondc/on_init`) | Parses payment object (with BPP's payment.id), stores, emits SSE |
| `POST /on_confirm` (and `/ondc/on_confirm`) | Parses orderId + QR ticket, stores, emits SSE |
| `POST /on_status` (and `/ondc/on_status`) | Updates ticket/orderStatus, emits SSE |
| `POST /on_support` (and `/ondc/on_support`) | Emits raw support data via SSE |

All `/on_*` routes (except `/on_subscribe`) are protected by `ondcAuthMiddleware`.

### Outbound (our server → ONDC)

| Destination | When |
|---|---|
| `POST https://preprod.gateway.ondc.org/search` | On `/ondc/api/search` |
| `POST {bppUri}/select` | On `/ondc/api/select` (bppUri from on_search) |
| `POST {bppUri}/init` | On `/ondc/api/init` |
| `POST {bppUri}/confirm` | On `/ondc/api/confirm` |
| `POST {bppUri}/status` | On `/ondc/api/status` |
| `POST {bppUri}/support` | On `/ondc/api/support` |

---

## Payload Reference

### search — `POST {gatewayUrl}/search`

```json
{
  "context": {
    "domain": "ONDC:TRV11",
    "action": "search",
    "version": "2.0.0",
    "bap_id": "<ONDC_SUBSCRIBER_ID>",
    "bap_uri": "<ONDC_SUBSCRIBER_URL>",
    "transaction_id": "<uuid>",
    "message_id": "<uuid>",
    "location": { "country": { "code": "IND" }, "city": { "code": "std:022" } },
    "timestamp": "<ISO8601>",
    "ttl": "PT30S"
  },
  "message": {
    "intent": {
      "fulfillment": {
        "stops": [
          { "type": "START", "location": { "gps": "19.0760,72.8777" } },
          { "type": "END",   "location": { "gps": "19.1136,72.8683" } }
        ]
      },
      "payment": {
        "tags": [
          {
            "descriptor": { "code": "BUYER_FINDER_FEES" },
            "list": [
              { "descriptor": { "code": "BUYER_FINDER_FEES_PERCENTAGE" }, "value": "1" },
              { "descriptor": { "code": "BUYER_FINDER_FEES_TYPE" }, "value": "percent" }
            ]
          },
          {
            "descriptor": { "code": "SETTLEMENT_TERMS" },
            "list": [
              { "descriptor": { "code": "DELAY_INTEREST" }, "value": "2.5" },
              { "descriptor": { "code": "STATIC_TERMS" }, "value": "<url-if-set>" }
            ]
          }
        ]
      }
    }
  }
}
```

### select — `POST {bppUri}/select`

```json
{
  "context": { "...same fields...", "action": "select", "bpp_id": "<bpp_id>", "bpp_uri": "<bpp_uri>" },
  "message": {
    "order": {
      "provider": { "id": "<providerId>" },
      "items": [{ "id": "<itemId>", "quantity": { "selected": { "count": 1 } } }],
      "fulfillments": [
        { "stops": [
            { "type": "START", "location": { "gps": "19.0760,72.8777" } },
            { "type": "END",   "location": { "gps": "19.1136,72.8683" } }
        ]}
      ]
    }
  }
}
```

### init — `POST {bppUri}/init`

```json
{
  "context": { "...action: init..." },
  "message": {
    "order": {
      "provider": { "id": "<providerId>" },
      "items": [{ "id": "<itemId>", "quantity": { "selected": { "count": 1 } } }],
      "billing": {
        "name":  "Arjun Yadav",
        "email": "arjun@example.com",
        "phone": "+919876543210"
      },
      "fulfillments": [{ "stops": [ ... ] }],
      "payments": [{
        "collected_by": "BPP",
        "status": "NOT-PAID",
        "type": "PRE-ORDER",
        "tags": [
          { "descriptor": { "code": "BUYER_FINDER_FEES" }, "list": [ ... ] },
          {
            "descriptor": { "code": "SETTLEMENT_TERMS" },
            "list": [
              { "descriptor": { "code": "SETTLEMENT_TYPE" }, "value": "NEFT" },
              { "descriptor": { "code": "DELAY_INTEREST" }, "value": "2.5" },
              { "descriptor": { "code": "MANDATORY_ARBITRATION" }, "value": "true" },
              { "descriptor": { "code": "COURT_JURISDICTION" }, "value": "Mumbai" },
              { "descriptor": { "code": "STATIC_TERMS" }, "value": "<url>" },
              { "descriptor": { "code": "SETTLEMENT_AMOUNT" }, "value": "60.00" }
            ]
          }
        ]
      }]
    }
  }
}
```

### confirm — `POST {bppUri}/confirm`

The `payment` object is taken from `on_init` (which carries the BPP's assigned `payment.id`) and the status is changed to `PAID`. If `payment.id` from `on_init` is missing, `buildConfirm()` throws — this prevents sending a confirm before `on_init` arrives.

```json
{
  "context": { "...action: confirm..." },
  "message": {
    "order": {
      "provider": { "id": "<providerId>" },
      "items": [{ "id": "<itemId>", "quantity": { "selected": { "count": 1 } } }],
      "billing": { "name": "...", "email": "...", "phone": "..." },
      "fulfillments": [{ "stops": [ ... ] }],
      "payments": [{
        "id": "<payment-id-from-on_init>",
        "collected_by": "BPP",
        "status": "PAID",
        "type": "PRE-ORDER",
        "params": {
          "transaction_id": "<upi-ref-or-uuid>",
          "amount": "60.00",
          "currency": "INR"
        },
        "tags": [
          { "descriptor": { "code": "BUYER_FINDER_FEES" }, "list": [ ... ] },
          {
            "descriptor": { "code": "SETTLEMENT_TERMS" },
            "list": [
              { "descriptor": { "code": "SETTLEMENT_WINDOW" }, "value": "PT60M" },
              { "descriptor": { "code": "SETTLEMENT_BASIS" }, "value": "Delivery" },
              { "descriptor": { "code": "SETTLEMENT_TYPE" }, "value": "NEFT" },
              { "descriptor": { "code": "MANDATORY_ARBITRATION" }, "value": "true" },
              { "descriptor": { "code": "COURT_JURISDICTION" }, "value": "Mumbai" },
              { "descriptor": { "code": "DELAY_INTEREST" }, "value": "2.5" },
              { "descriptor": { "code": "STATIC_TERMS" }, "value": "<url>" },
              { "descriptor": { "code": "SETTLEMENT_AMOUNT" }, "value": "60.00" }
            ]
          }
        ]
      }]
    }
  }
}
```

**Settlement terms summary by action:**

| Action | Sub-codes |
|---|---|
| search | `DELAY_INTEREST`, `STATIC_TERMS` |
| init | + `SETTLEMENT_TYPE`, `MANDATORY_ARBITRATION`, `COURT_JURISDICTION`, `SETTLEMENT_AMOUNT` |
| confirm | + `SETTLEMENT_WINDOW=PT60M`, `SETTLEMENT_BASIS=Delivery` |

---

## Order Store and SSE Events

### Transaction states

```
SEARCHING        → txnId created, gateway called
SEARCH_COMPLETE  → on_search arrived; bppUri, searchOptions stored
SELECTED         → on_select arrived; quote stored
INITIALIZED      → on_init arrived; payment.id stored
CONFIRMED        → on_confirm arrived; orderId + ticket (QR) stored
COMPLETED        → (future: after on_status shows ticket used)
FAILED           → signedPost threw an error
```

### Transaction object fields

```js
{
  transactionId,
  status,                   // OrderStatus enum
  createdAt, updatedAt,
  bppId, bppUri,            // from on_search; used for subsequent calls
  searchOptions,            // array of parsed catalog items
  selectedProviderId,
  selectedItemId,
  quote,                    // { totalAmount, currency, breakup[], payment }
  billing,                  // { name, email, phone }
  payment,                  // payment object from on_init (with BPP's id field)
  orderId,                  // BPP's order.id (from on_confirm)
  ticket,                   // { qrBase64, validTo, status, fulfillments }
  orderStatus,              // BPP's order status string
}
```

### SSE events

The frontend subscribes at `GET /ondc/api/events/:txnId`. Events are newline-delimited:

```
data: {"event":"current_state","status":"SEARCHING"}

: ping

data: {"event":"on_search","options":[{"bppId":"...","itemName":"...","fare":"60",...}]}

data: {"event":"on_select","quote":{"totalAmount":"60.00","currency":"INR",...}}

data: {"event":"on_init","totalAmount":"60.00","payment":{"id":"pay-xyz",...}}

data: {"event":"on_confirm","orderId":"ord-456","tickets":[{"qrBase64":"...","validTo":"..."}]}
```

Channels are cleaned up after 2 hours (same TTL as the order store).

### Polling alternative

If SSE is inconvenient for testing: `GET /ondc/api/order/:txnId` returns the current transaction state on demand.

---

## Postman Testing Guide

### Environment setup

Create a Postman environment with:
```
base_url : https://<your-domain>    (live deployment)
local_url: http://localhost:8080    (local development)
txnId    : (leave blank; fill after search)
```

### Tests that work immediately (no DNS required)

These work against `http://localhost:8080` while developing locally:

**1. Health check**
```
GET {{local_url}}/api/health
```
Expected: `{ "ok": true, "service": "cityone-backend", ... }`

**2. Site verification**
```
GET {{local_url}}/ondc-site-verification.html
```
Expected: HTML with `<meta name="ondc-site-verification" content="<88-char-base64>"/>`
If `content=""` is empty, `ONDC_SITE_VERIFICATION_SIGNED` is not set in your environment.

**3. Start a search**
```
POST {{local_url}}/ondc/api/search
Content-Type: application/json

{
  "from": { "gps": "19.0760,72.8777", "name": "CST" },
  "to":   { "gps": "19.1136,72.8683", "name": "Andheri" }
}
```
Expected: `{ "txnId": "<uuid>", "context": { ... } }`
Save the `txnId` to your environment variable.

If you get `502 Gateway unreachable`: `ONDC_SIGNING_PRIVATE_KEY` is not set or the ONDC Preprod Gateway is down.

**4. Poll order state**
```
GET {{local_url}}/ondc/api/order/{{txnId}}
```
Expected: `{ "status": "SEARCHING", "searchOptions": [], ... }`

**5. Test error handling — select before on_search**
```
POST {{local_url}}/ondc/api/select
Content-Type: application/json

{ "txnId": "{{txnId}}", "providerId": "test", "itemId": "test", "quantity": 1 }
```
Expected: `409 Conflict — "No BPP selected yet. Wait for on_search."` This confirms the guard works.

**6. Open SSE stream (curl)**
```bash
curl -N http://localhost:8080/ondc/api/events/{{txnId}}
```
You'll see:
```
data: {"event":"current_state","status":"SEARCHING"}
: ping
```
Keep this open — events arrive here when callbacks come in.

### Tests that require DNS + TLS

The following require `ONDC_SUBSCRIBER_URL` to resolve to your server with valid TLS, because ONDC BPPs send callbacks to that URL:

- Full search → on_search callback → select → on_select → … → on_confirm flow
- ONDC Pramaan testing via Protocol Workbench
- ONDC registry verification (registry fetches `/ondc-site-verification.html` from your subscriber domain)

### Simulating a callback locally (advanced)

To test the callback handler without a real BPP, you can send a manually constructed `on_search` POST to your local server. You need a valid `Authorization` header with an Ed25519 signature from a registered ONDC subscriber. The easiest approach:

1. Use the ONDC Protocol Workbench's test runner — it sends real signed callbacks
2. Or write a test script that signs the callback using your own signing key (pretending to be a BPP) — since the registry won't find your key as a BPP, auth will fail; to bypass for local testing you can temporarily disable `ondcAuthMiddleware` on a specific test route

---

## Onboarding and Site Verification

### ONDC Registration Steps

1. Generate key pairs: `node backend/src/ondc/keygen.js` — run once, store output in your secrets manager
2. Generate the subscriber registration payload: `node backend/src/ondc/scripts/subscribe-payload.js`
3. POST the payload to `https://preprod.registry.ondc.org/ondc/subscribe`
4. Note the `unique_req_id` issued by the ONDC portal
5. Generate site verification: `node backend/src/ondc/scripts/sign-site-verification.js <unique_req_id>`
6. Set `ONDC_SITE_VERIFICATION_SIGNED` in your environment
7. Set all other `ONDC_*` env vars from your key generation output and the ONDC portal

### Site verification

The ONDC registry verifies domain ownership by fetching `GET https://{ONDC_SUBSCRIBER_URL}/ondc-site-verification.html` and checking the `content` attribute of the `<meta name="ondc-site-verification">` tag.

The value is: `base64(Ed25519_sign(unique_req_id, signing_private_key))`

where `unique_req_id` was provided by the ONDC portal during registration.

To regenerate (if needed):
```bash
# Requires ONDC_SIGNING_PRIVATE_KEY in .env
node backend/src/ondc/scripts/sign-site-verification.js <unique_req_id>
# Output: ONDC_SITE_VERIFICATION_SIGNED=<base64>
```

Set the output value as `ONDC_SITE_VERIFICATION_SIGNED` in your environment.

### on_subscribe handler

During ONDC registration, the registry POSTs an encrypted challenge to `POST /on_subscribe`. Our handler (`backend/src/ondc/onboard.js`) decrypts it:

1. X25519 DH: `our_encryption_private_key × ONDC_fixed_published_key → sharedSecret`
2. AES key: `SHA-256(sharedSecret)[0:16]`
3. Decrypt: `AES-128-ECB(encrypted_challenge, aes_key)` → `answer`
4. Return: `{ "answer": "<decrypted_string>" }`

ONDC uses a fixed published X25519 key per environment (UAT or prod), not an ephemeral key per challenge. The UAT key is hardcoded in `onboard.js:ONDC_ENC_PUBLIC_KEYS.uat`.

This must be completed once during initial ONDC registration. It would only need to be repeated if re-registering or rotating keys.

---

## Known Limitations

### In-memory order store

The transaction store (`backend/src/ondc/store/orderStore.js`) lives in process memory and is lost on restart. With multiple running instances (horizontal scaling), different instances have separate stores. A search that creates txnId on instance A will fail if the `on_search` callback hits instance B — instance B has no record of that transaction.

**For production:** Replace the store with Redis or a database. The store interface (`createTransaction`, `getTransaction`, `updateTransaction`) is isolated in one file — a drop-in replacement is straightforward.

### No frontend booking UI

The ONDC API backend (`/ondc/api/search`, `/select`, `/init`, `/confirm`, `/status`) is complete and tested. There are no React components in the frontend to call these APIs. A Metro booking user flow must be built in the frontend.

### No payment gateway integration

The `/ondc/api/confirm` endpoint accepts a `paymentTransactionId` from the caller. No UPI/Razorpay integration is included. For Pramaan testing, set `ONDC_MOCK_PAYMENT=true` and the backend auto-generates a UUID as the payment transaction ID.

### Preprod only

`ONDC_REGISTRY_URL` and `ONDC_GATEWAY_URL` are set to `preprod.*`. For ONDC production certification and live deployment, change these to the production URLs and complete the certification process.
