# CityOne — Mumbai Multimodal Journey Planner

CityOne is a React + Node.js application that plans multimodal journeys across Mumbai (Walk, Mumbai Local, Metro, BEST Bus) and provides an ONDC-protocol BAP (Buyer App) layer for Metro ticket booking via the ONDC network.

The ONDC BAP integration is built on TRV11 v2.0.0 and will be registered under CityOne's own ONDC Network Participant identity. See [docs/ONDC.md](docs/ONDC.md) for the full ONDC technical guide.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Repository Layout](#repository-layout)
3. [Getting Started (Local)](#getting-started-local)
4. [Environment Variables](#environment-variables)
5. [ONDC BAP Integration](#ondc-bap-integration)
6. [Deployment](#deployment)
7. [API Reference](#api-reference)
8. [Testing](#testing)
9. [Implementation Status](#implementation-status)
10. [ONDC Onboarding Checklist](#ondc-onboarding-checklist)

---

## Architecture

```
Browser (React / Leaflet)
        │
        │  /api/*  /ondc/api/*  SSE
        ▼
Express Backend  (Node.js, port 8080)
        │
        ├── Journey Planner
        │     ├── Google Routes API    — walk, drive, transit (Google Transit)
        │     └── RailRadar API        — Mumbai Local train schedules
        │
        └── ONDC BAP (TRV11 v2.0.0)
              ├── Outbound: signed POST → ONDC Gateway / BPP
              └── Inbound:  BPP callbacks → POST /on_search, /on_select, …
                            (arrive at https://{ONDC_SUBSCRIBER_URL}/on_*)
```

The frontend is a Vite/React SPA served as static files by the same Express process. In production the Docker image contains a pre-built `frontend/dist/` and the Express server serves it.

---

## Repository Layout

```
.
├── backend/
│   └── src/
│       ├── server.js             — Express entry point
│       ├── config.js             — All env var reads (backend)
│       ├── api/
│       │   ├── journeys.js       — POST /api/routes
│       │   └── places.js         — GET /api/places/autocomplete, /details
│       ├── services/
│       │   └── journeyService.js — Multimodal routing logic
│       ├── providers/
│       │   ├── googleRoutes.js   — Google Routes API client
│       │   └── railRadar.js      — RailRadar API client (Mumbai Local)
│       ├── models/journey.js     — Journey/Leg data model
│       ├── data/
│       │   └── mumbaiLocalStations.js — Station catalog (coords + codes)
│       ├── utils/nearbyStations.js    — Haversine station lookup
│       └── ondc/                 — ONDC BAP implementation (see docs/ONDC.md)
│           ├── config.js         — ONDC env var reads
│           ├── router.js         — /ondc/* routes + SSE
│           ├── onboard.js        — Site verification + on_subscribe handler
│           ├── keygen.js         — Key generation utility (run once at onboarding)
│           ├── core/             — Signing, verification, registry, HTTP client
│           ├── adapters/metro/   — TRV11 2.0.0 payload builders + callback handlers
│           ├── store/orderStore.js — In-memory transaction store
│           └── scripts/          — Onboarding helper scripts
├── frontend/
│   └── src/                      — React components + Vite config
├── e2e/smoke.spec.js             — Playwright smoke tests
├── .env.example                  — Complete env var reference (copy to .env)
├── docker-compose.yml            — Local development with Docker
├── Dockerfile                    — Multi-stage build (Node 22, production)
├── .github/workflows/deploy.yml  — Generic Docker build stub (adapt to your infra)
└── docs/
    └── ONDC.md                   — ONDC BAP implementation guide
```

---

## Getting Started (Local)

### Prerequisites

- Node.js 22+ (matches the Docker image; blake2b512 requires Node 17.6+)
- npm 10+
- A `.env` file with the required API keys (see [Environment Variables](#environment-variables))

### Option A — Node directly

```bash
# 1. Install dependencies for all workspaces
npm install

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum set GOOGLE_BACKEND_MAPS_KEY and RAILRADAR_API_KEY

# 3. Start backend (port 8080) and frontend dev server (port 5173) concurrently
npm run dev

# Or individually:
npm run dev:backend     # backend only
npm run dev:frontend    # frontend only (proxies /api → localhost:8080)
```

The frontend dev server at http://localhost:5173 proxies `/api` to the backend. In production the backend serves the built frontend directly.

### Option B — Docker Compose

```bash
cp .env.example .env
# Edit .env — fill in required keys

docker compose up --build
# App available at http://localhost:8080
```

### Build the frontend only

```bash
npm run build       # produces frontend/dist/
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in each value. In production, inject as environment variables — the app reads `process.env` directly.

### Application Keys

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_BACKEND_MAPS_KEY` | Yes | Server-side key for Google Routes API and Places API. Must have Routes API and Places API (New) enabled. Restrict to your server IP. |
| `GOOGLE_FRONTEND_MAPS_KEY` | Recommended | Browser-safe Google Maps JavaScript API key. Delivered to the browser via `GET /api/config/public`. If omitted, falls back to `GOOGLE_ANDROID_MAPS_KEY`, then to none (map tiles still work via Leaflet/OSM). |
| `GOOGLE_ANDROID_MAPS_KEY` | Optional | Fallback for the frontend Maps key. |
| `RAILRADAR_API_KEY` | Yes | RailRadar API key for Mumbai Local train schedules. Free tier: 50 req/day; 22 h cache per station pair. Get a key at railradar.in. |
| `PORT` | Optional | HTTP port. Defaults to 8080. |
| `NODE_ENV` | Optional | `development` or `production`. |

### ONDC BAP Credentials

These values come from your ONDC Network Participant registration. Complete ONDC onboarding before filling these. See [ONDC Onboarding Checklist](#ondc-onboarding-checklist) below.

| Variable | Required | Description |
|---|---|---|
| `ONDC_SUBSCRIBER_ID` | Yes | Your ONDC subscriber ID — the domain name you registered with ONDC. |
| `ONDC_SUBSCRIBER_URL` | Yes | Your public HTTPS base URL. BPPs send callbacks to `{ONDC_SUBSCRIBER_URL}/on_search` etc. |
| `ONDC_UNIQUE_KEY_ID` | Yes | UUID assigned when you registered your key pair with ONDC. Included in every outbound Authorization header. |
| `ONDC_SIGNING_PRIVATE_KEY` | Yes | Ed25519 private key, 64 bytes base64 (libsodium format). **Secret — never commit.** |
| `ONDC_SIGNING_PUBLIC_KEY` | Yes | Ed25519 public key, 32 bytes base64. Not secret — registered in ONDC registry. |
| `ONDC_ENCRYPTION_PRIVATE_KEY` | Yes | X25519 private key, 32 bytes base64. **Secret — never commit.** Used during `/on_subscribe` only. |
| `ONDC_ENCRYPTION_PUBLIC_KEY` | Yes | X25519 public key, 44 bytes base64 (SPKI DER, starts with `MCow`). Not secret. |
| `ONDC_SITE_VERIFICATION_SIGNED` | Yes | Base64 Ed25519 signature of the `unique_req_id` from the ONDC portal. Served at `/ondc-site-verification.html`. |
| `ONDC_REGISTRY_URL` | Optional | ONDC registry. Default: `https://preprod.registry.ondc.org`. Change to `https://registry.ondc.org` for production. |
| `ONDC_GATEWAY_URL` | Optional | ONDC gateway. Default: `https://preprod.gateway.ondc.org`. Change for production. |
| `ONDC_ENV` | Optional | `uat` or `prod`. Default: `uat`. |
| `ONDC_MOCK_PAYMENT` | Optional | `true` to auto-generate payment transaction ID for Pramaan testing. Default: `false`. |
| `ONDC_BUYER_FINDER_FEES_PCT` | Optional | BAP commission percentage. Default: `1`. |
| `ONDC_COURT_JURISDICTION` | Optional | Jurisdiction for settlement terms. Default: `Mumbai`. |
| `ONDC_STATIC_TERMS_URL` | Optional | URL to your static terms document. |

### Secrets Management

Private keys must never be in the repository, Docker images, or logs.

- Use a secrets manager (GCP Secret Manager, AWS Secrets Manager, HashiCorp Vault, or your hosting platform's secrets).
- Inject `ONDC_SIGNING_PRIVATE_KEY` and `ONDC_ENCRYPTION_PRIVATE_KEY` as runtime environment variables only.

---

## ONDC BAP Integration

See [`docs/ONDC.md`](docs/ONDC.md) for the complete technical guide covering:
- The ONDC BAP request/callback flow (TRV11 v2.0.0)
- Ed25519 signing and BLAKE-512 digest implementation
- All ONDC API endpoints and payload structures
- Postman testing guide
- How to generate `ONDC_SITE_VERIFICATION_SIGNED`
- Registry lookup, auth middleware, and SSE event stream

### Quick reference — ONDC-related HTTP endpoints

```
# Served by this app (inbound from ONDC network):
GET  /ondc-site-verification.html   — domain ownership proof
POST /on_subscribe                  — onboarding challenge-response
POST /on_search                     — BPP sends search results
POST /on_select                     — BPP sends fare quote
POST /on_init                       — BPP acknowledges billing
POST /on_confirm                    — BPP issues ticket
POST /on_status                     — BPP sends status update
POST /on_support                    — BPP sends support data

# Called by the frontend (booking flow):
POST /ondc/api/search               — initiate Metro search
POST /ondc/api/select               — select a route/provider
POST /ondc/api/init                 — submit billing details
POST /ondc/api/confirm              — confirm booking after payment
POST /ondc/api/status               — poll order status
POST /ondc/api/support              — request support
GET  /ondc/api/order/:txnId         — get current order state
GET  /ondc/api/events/:txnId        — SSE stream for real-time booking updates
```

---

## Deployment

### Docker (any host)

```bash
# Build image
docker build -t cityone:latest .

# Run (supply env vars via --env-file or -e flags)
docker run -d --restart unless-stopped -p 8080:8080 --env-file .env cityone:latest

# Or with Docker Compose (uses docker-compose.yml):
docker compose up --build
```

The app listens on `PORT` (default 8080). It serves the React SPA and the API from the same process — no separate frontend server needed.

**Infrastructure requirements:**
- Any host that can run a Docker container and expose HTTPS on port 443
- A domain pointing to the host — must match `ONDC_SUBSCRIBER_URL` registered with ONDC
- HTTPS/TLS termination in front of the container (nginx, Caddy, a load balancer, etc.)
- The `ONDC_SUBSCRIBER_URL` must be reachable by the ONDC network for callbacks

**nginx reverse proxy note:** The proxy must forward the raw request body unchanged. The app captures raw bytes for BLAKE-512 ONDC signature verification. Standard `proxy_pass` with no body filters is correct.

### CI/CD

`.github/workflows/deploy.yml` is a generic Docker build stub with commented examples for SSH deploy, Docker Hub, GCP, and AWS. Adapt it to your own infrastructure and secrets management.

---

## API Reference

**`POST /api/routes`** — Plan a multimodal journey

```json
{
  "origin":      { "lat": 19.0760, "lng": 72.8777, "name": "CST" },
  "destination": { "lat": 19.1136, "lng": 72.8683, "name": "Andheri" },
  "departureTime": "2026-09-21T09:00:00+05:30"
}
```

**`GET /api/places/autocomplete?q=Andheri&lat=19.0760&lng=72.8777`**

**`GET /api/places/details?placeId=ChIJ...`**

**`GET /api/health`** — service status + provider key check

**`GET /api/config/public`** — returns `GOOGLE_FRONTEND_MAPS_KEY` for the browser

---

## Testing

### Backend integration tests

```bash
npm run test:google    # Google Routes + Places API
npm run test:railradar # RailRadar connectivity
npm run test:journey   # journey service (hardcoded Mumbai points)
npm run test:api       # /api/routes HTTP endpoint
```

### E2E smoke tests

```bash
# Start the app first
npx playwright test e2e/smoke.spec.js
```

### Verify setup after deployment

```bash
# Health check
curl https://<your-domain>/api/health

# Site verification (ONDC registry fetches this)
curl https://<your-domain>/ondc-site-verification.html
# Must return: <meta name="ondc-site-verification" content="<non-empty base64>"/>

# Registry lookup (after ONDC onboarding is complete)
curl -s -X POST https://preprod.registry.ondc.org/v2.0/lookup \
  -H 'Content-Type: application/json' \
  -d '{"subscriber_id":"<your-subscriber-id>","domain":"ONDC:TRV11"}'

# Initiate a search
curl -s -X POST https://<your-domain>/ondc/api/search \
  -H 'Content-Type: application/json' \
  -d '{"from":{"gps":"19.0760,72.8777","name":"CST"},"to":{"gps":"19.1136,72.8683","name":"Andheri"}}'
```

---

## Implementation Status

### Fully implemented

- **Multimodal journey planner**: Walk + Mumbai Local (all 3 lines) + Metro + Bus + Drive. Route construction, ranking, IST time handling, map polylines.
- **ONDC BAP TRV11 v2.0.0**: All 6 actions (search/select/init/confirm/status/support) with correct payload structures, per-action SETTLEMENT_TERMS, BUYER_FINDER_FEES.
- **ONDC auth**: Ed25519 signing, BLAKE-512 body digest, registry-based verification of inbound BPP callbacks.
- **ONDC callback routing**: Root-level routes (`POST /on_search` etc.) matching a `bap_uri` with no path component.
- **SSE event stream**: Real-time booking state pushed to browser.
- **In-memory order store**: Full transaction lifecycle with 2-hour TTL auto-expiry.
- **ONDC onboarding handlers**: Site verification HTML endpoint; `/on_subscribe` challenge decryption (X25519 + AES-128-ECB).
- **Docker**: Multi-stage production build.

### Not yet implemented

- **Frontend Metro booking UI**: ONDC booking backend is complete, but no React components yet for the booking flow (search → pick route → enter billing → pay → QR ticket).
- **Payment integration**: No UPI/payment gateway; set `ONDC_MOCK_PAYMENT=true` for Pramaan testing.
- **Persistent order store**: Current in-memory store loses state on restart and does not share state across instances. Replace `orderStore.js` with Redis or a database for production.

---

## ONDC Onboarding Checklist

Before the ONDC booking flow can work end-to-end:

- [ ] Company Pvt Ltd registered
- [ ] Domain acquired (e.g. `mobility.cityone.in` or similar)
- [ ] HTTPS/TLS set up on domain
- [ ] ONDC Network Participant account created at https://ondc.org
- [ ] Generate key pairs: `node backend/src/ondc/keygen.js` (run once; store output securely in your secrets manager)
- [ ] Register on ONDC Preprod portal — submit subscriber payload: `node backend/src/ondc/scripts/subscribe-payload.js`
- [ ] Note `unique_req_id` from ONDC portal
- [ ] Generate site verification signature: `node backend/src/ondc/scripts/sign-site-verification.js <unique_req_id>`
- [ ] Set all `ONDC_*` env vars in your deployment
- [ ] Verify: `curl https://<your-domain>/ondc-site-verification.html` returns non-empty `content=`
- [ ] Verify: ONDC Preprod registry lookup returns your key registration
- [ ] Complete ONDC Pramaan testing (end-to-end booking test on preprod)
- [ ] When ready for production: switch `ONDC_REGISTRY_URL` and `ONDC_GATEWAY_URL` to production URLs, set `ONDC_ENV=prod`
- [ ] Complete ONDC production certification

See [`docs/ONDC.md`](docs/ONDC.md) for detailed guidance on each step.
