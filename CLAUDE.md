# CityOne — ONDC TRV11 BAP (Mumbai Multimodal Journey Planner)

## Project Overview
- **App**: CityOne — multimodal journey planner for Mumbai
- **ONDC Role**: BAP (Buyer Application Platform) for Transit domain
- **Domain**: ONDC:TRV11 v2.0.0 (Metro transit)
- **Subscriber ID**: cityone.in
- **BAP URI**: https://cityone.in
- **Owner**: Arjun Yadav (arsenal6389@gmail.com)
- **Deployment**: Docker on GCP VM "cityone-app" (uses `docker build`/`docker run`, NOT docker compose)
- **Branch**: `claude/dazzling-clarke-c9f3td`

## Architecture
- **Backend**: Node.js/Express
  - ONDC router mounted at `/ondc` (backend/src/ondc/router.js)
  - API endpoints at `/ondc/api/{action}` — search, select, init, confirm, status, update, cancel, support, issue, issue-escalate, issue-close
  - API expects `txnId` in request body (NOT `transactionId`)
  - In-memory order store (container restart clears all transaction state)
  - Callbacks at `/ondc/callbacks/on_{action}`
- **Key Files**:
  - `backend/src/ondc/router.js` — Main ONDC Express router (all 11 API endpoints)
  - `backend/src/ondc/adapters/metro/callbacks.js` — Inbound BPP callback handlers
  - `backend/src/ondc/adapters/metro/actions.js` — BAP action payload builders
  - `backend/src/ondc/core/context.js` — Builds ONDC context objects (default cityCode: std:022 for Mumbai)

## ONDC Workbench Testing (Pramaan Report)

### Workbench Mock BPP
- **BPP ID**: workbench.ondc.tech
- **BPP URI**: https://workbench.ondc.tech/api-service/ONDC:TRV11/2.0.0/seller
- **City Code**: std:011 (Delhi — Workbench uses Delhi Metro station codes)
- **Station Codes**: SHAHEED_STHAL (start), AZADPUR (end)
- **Vehicle**: METRO
- **"WITHOUT SEARCH ND SELECT" flows**: Skip GPS-based search1 and select — use station code-based search (search2)

### Known Workbench Mock BPP Issues (do NOT try to fix — they don't block completion)
- BPP on_search catalog returns `fulfillments: []` → causes cascading errors in on_init, on_confirm, on_status
- on_init: "Missing fulfillments in sessionData" + message_id mismatch (BPP generates new message_id)
- on_confirm: "Payment id mismatch: expected undefined" (BPP session never stored payment ID)
- on_status: "Missing required fields" (cascading from empty fulfillments)
- on_issue: "Missing or invalid issue refs array"
- Unsolicited on_issue: GENERATION_ERROR (onIssueStatusGenerator crashes on undefined fulfillments)
- BPP error contexts missing bap_id/bpp_id → our BAP NACKs with "subscriberID not set"
- BPP sends error `code` as number (400) but ONDC spec requires string → our BAP NACKs

### Completed Workbench Flows (All 3 at 100%)

#### Flow 1: SJT with IGM v1.0.0 — 13 steps ✅
- Standard order flow + IGM v1.0.0 (issue → on_issue → issue_status → on_issue_status)

#### Flow 2: SJT with IGM Rejection v2.0.0 — 21 steps ✅
- Standard order flow + IGM v2.0.0 with rejection path

#### Flow 3: SJT with IGM No Action v2.0.0 — 15 steps ✅
- Transaction ID: 356d1406-b4af-428d-82b6-c5f06ea6f1be
- Issue ID: 5f623c8f-2662-4dae-8d0b-2ab29a8064a1
- Order ID: O_4537f510
- Steps: search → on_search → init → on_init → confirm → on_confirm → status → on_status(x2) → issue(OPEN) → on_issue → on_issue(unsolicited) → issue(ESCALATE) → on_issue → issue(CLOSE with THUMBS-UP)
- Completed: 2026-09-30

### IGM (Issue/Grievance Management) Details
- **IGM v1.0.0**: issue, on_issue, issue_status, on_issue_status
- **IGM v2.0.0**: issue (OPEN/ESCALATE/CLOSE), on_issue — reuses `issue` action for all states
- **Issue close**: status=CLOSED, rating=THUMBS-UP, complainant_action=CLOSE

### ONDC Portal Progress
- Step 2.b: Pramaan Test Report — All 3 flows completed, report regenerated
- Step 2.c: Live walkthrough for customer grievance and payout processes — PENDING
- Production signed Authorization header (registry.js) — DEFERRED
- Supabase on VM — DELIBERATELY DEFERRED

## Security Constraints
- Do NOT modify the GCP VM directly
- Do NOT modify or regenerate ONDC keys
- Do NOT log complete Authorization header, private key, or any credential/signature material
- Never print or expose secret values
- All git pushes go to branch `claude/dazzling-clarke-c9f3td` only

## Billing Info (for ONDC payloads)
- Name: Arjun Yadav
- Phone: 9999999999
- Email: arsenal6389@gmail.com

## Provider/Item IDs (Workbench)
- Provider: P1
- Item: I1 (SJT — Single Journey Ticket, INR 60)
- Fulfillment: F1
- Category: C1 (TICKET)
- Payment: PA1 (collected_by: BAP, type: PRE-ORDER)
