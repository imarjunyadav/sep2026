/**
 * Step 5 validation: verify the API contract before wiring to a running server.
 *   1. Routes pipeline: findJourneys → serializeJourney — checks shape, required
 *      fields, and that all internal fields are stripped.
 *   2. Places API: live autocomplete + details calls against Google.
 */
import 'dotenv/config';
import { findJourneys } from './services/journeyService.js';
import { serializeJourney } from './api/journeys.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function hr(label) {
  console.log('\n' + '═'.repeat(72));
  console.log(`TEST: ${label}`);
  console.log('═'.repeat(72));
}

let passed = 0, failed = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`  ✗ ${msg}`);
    failed++;
  } else {
    passed++;
  }
}

function assertAbsent(obj, key) {
  if (key in obj) {
    console.error(`  ✗ Internal field "${key}" must not appear in response`);
    failed++;
  } else {
    passed++;
  }
}

// ── 1. Routes pipeline ─────────────────────────────────────────────────────────

hr('Routes: findJourneys → serializeJourney (Churchgate → Bandra)');

const { journeys, warnings } = await findJourneys(
  { lat: 18.9322, lng: 72.8264, name: 'Churchgate' },
  { lat: 19.0548, lng: 72.8393, name: 'Bandra' },
  new Date(),
);

console.log(`  ${journeys.length} journey(s) returned`);
if (warnings.length) console.log(`  Warnings: ${warnings.join('; ')}`);

assert(Array.isArray(journeys), 'findJourneys returns journeys array');
assert(Array.isArray(warnings), 'findJourneys returns warnings array');
assert(journeys.length > 0, 'at least one journey returned');

for (let i = 0; i < journeys.length; i++) {
  const raw = journeys[i];
  const s   = serializeJourney(raw);

  // Required top-level fields
  assert(typeof s.id           === 'string',  `[${i}] id is string`);
  assert(typeof s.category     === 'string',  `[${i}] category is string`);
  assert(typeof s.durationSecs === 'number',  `[${i}] durationSecs is number`);
  assert(typeof s.totalWalkSecs === 'number',  `[${i}] totalWalkSecs is number`);
  assert(typeof s.waitSecs     === 'number',  `[${i}] waitSecs is number`);
  assert(typeof s.transferCount === 'number', `[${i}] transferCount is number`);
  assert(Array.isArray(s.legs),               `[${i}] legs is array`);

  // departure/arrival must be ISO strings or null
  if (s.departure !== null) {
    assert(typeof s.departure === 'string' && !isNaN(Date.parse(s.departure)),
      `[${i}] departure is valid ISO string`);
  }
  if (s.arrival !== null) {
    assert(typeof s.arrival === 'string' && !isNaN(Date.parse(s.arrival)),
      `[${i}] arrival is valid ISO string`);
  }

  // Internal fields must be absent
  assertAbsent(s, 'effectiveCost');
  assertAbsent(s, 'source');
  assertAbsent(s, 'boardCode');
  assertAbsent(s, 'alightCode');
  assertAbsent(s, '_costBreakdown');
  assertAbsent(s, 'totalDurationSecs');
  assertAbsent(s, 'walkSecs');
  assertAbsent(s, 'totalDistanceMeters');

  // Leg checks
  for (let k = 0; k < s.legs.length; k++) {
    const leg = s.legs[k];
    assert(typeof leg.mode         === 'string',  `[${i}] leg[${k}].mode is string`);
    assert(typeof leg.durationSecs === 'number',  `[${i}] leg[${k}].durationSecs is number`);
    assert(typeof leg.isEstimated  === 'boolean', `[${i}] leg[${k}].isEstimated is boolean`);
    assert(leg.from && typeof leg.from.lat === 'number', `[${i}] leg[${k}].from has lat`);
    assert(leg.to   && typeof leg.to.lat   === 'number', `[${i}] leg[${k}].to has lat`);
    assertAbsent(leg, 'metadata');
    assertAbsent(leg, 'provider');
    assertAbsent(leg, 'vehicle');
    assertAbsent(leg, 'stops');
  }

  const modeStr = s.legs.map(l => l.mode).join(' → ');
  const depStr  = s.departure ? new Date(s.departure).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }) : '?';
  const arrStr  = s.arrival   ? new Date(s.arrival).toLocaleTimeString('en-IN',   { timeZone: 'Asia/Kolkata', hour12: true }) : '?';
  console.log(`  [${i + 1}] ${s.category.padEnd(12)} ${Math.round(s.durationSecs/60)}m  wait=${s.waitSecs/60|0}m  walk=${Math.round(s.totalWalkSecs/60)}m  transfers=${s.transferCount}  ${depStr}→${arrStr}`);
  console.log(`       legs: ${modeStr}`);
  if (s.legs.some(l => l.isEstimated)) console.log('       (walk legs are estimated)');
}

// ── 2. Places autocomplete ─────────────────────────────────────────────────────

hr('Places autocomplete: q=Bandra (lat/lng bias: Mumbai Central)');

// Replicate the handler logic directly, without starting the server
import { request } from 'node:https';
import { config } from './config.js';

function placesPost(path, body, fieldMask) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(`https://places.googleapis.com/v1${path}`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'Content-Length':  Buffer.byteLength(payload),
        'X-Goog-Api-Key':  config.googleKey,
        'X-Goog-FieldMask': fieldMask,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function placesGet(path, fieldMask) {
  return new Promise((resolve, reject) => {
    const req = request(`https://places.googleapis.com/v1${path}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key':  config.googleKey,
        'X-Goog-FieldMask': fieldMask,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

try {
  const ac = await placesPost(
    '/places:autocomplete',
    {
      input: 'Bandra',
      includedRegionCodes: ['in'],
      locationBias: { circle: { center: { latitude: 18.94, longitude: 72.84 }, radius: 50000 } },
    },
    'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
  );

  if (ac.status !== 200) {
    console.warn(`  [SKIPPED] HTTP ${ac.status}: ${JSON.stringify(ac.body).slice(0, 200)}`);
    console.warn('  (Ensure the Places API (New) is enabled for GOOGLE_BACKEND_MAPS_KEY)');
  } else {
    const preds = (ac.body.suggestions ?? []).map(s => {
      const p = s.placePrediction ?? {};
      return {
        placeId: p.placeId ?? null,
        name:    p.structuredFormat?.mainText?.text    ?? p.text?.text ?? '',
        address: p.structuredFormat?.secondaryText?.text ?? '',
      };
    });
    console.log(`  HTTP 200 — ${preds.length} prediction(s)`);
    assert(preds.length > 0, 'autocomplete returned at least one prediction');
    for (const p of preds.slice(0, 3)) {
      console.log(`    "${p.name}" — ${p.address}  [${p.placeId?.slice(0, 20)}...]`);
    }

    // ── 3. Places details ────────────────────────────────────────────────────
    const firstId = preds[0]?.placeId;
    if (firstId) {
      hr(`Places details: placeId=${firstId.slice(0, 30)}...`);
      const det = await placesGet(
        `/places/${encodeURIComponent(firstId)}`,
        'id,displayName,formattedAddress,location',
      );
      if (det.status !== 200) {
        console.warn(`  [SKIPPED] HTTP ${det.status}: ${JSON.stringify(det.body).slice(0, 200)}`);
      } else {
        const loc = det.body.location;
        assert(typeof loc?.latitude  === 'number', 'details.location.latitude is number');
        assert(typeof loc?.longitude === 'number', 'details.location.longitude is number');
        assert(typeof det.body.displayName?.text === 'string', 'displayName.text is string');
        console.log(`  ✓ "${det.body.displayName?.text}"  [${loc?.latitude}, ${loc?.longitude}]`);
        console.log(`    ${det.body.formattedAddress}`);
      }
    }
  }
} catch (err) {
  console.warn(`  [SKIPPED] ${err.message.slice(0, 120)}`);
}

// ── 4. Validation — bad inputs ─────────────────────────────────────────────────

hr('Validation: validatePoint');

import { journeysRouter } from './api/journeys.js';

// We can test the validation logic by sending mock request objects
function mockReqRes(body) {
  let responseCode = null, responseBody = null;
  const res = {
    status(code) { responseCode = code; return this; },
    json(body)   { responseBody = body; return this; },
  };
  const req = { body };
  return { req, res, getCode: () => responseCode, getBody: () => responseBody };
}

// Walk the router stack to find the POST /routes handler
const postRoutesLayer = journeysRouter.stack.find(
  l => l.route?.path === '/routes' && l.route?.methods?.post
);
const handler = postRoutesLayer?.route?.stack[0]?.handle;

if (!handler) {
  console.warn('  [SKIP] Could not extract handler from router stack for unit test');
} else {
  async function callHandler(body) {
    const { req, res, getCode, getBody } = mockReqRes(body);
    await handler(req, res, (err) => { responseCode = 500; });
    return { code: getCode(), body: getBody() };
  }

  let r;

  r = await callHandler({});
  assert(r.code === 400, 'missing origin → 400');
  assert(r.body?.error === 'INVALID_REQUEST', 'error code INVALID_REQUEST');

  r = await callHandler({ origin: { lat: 'not-a-number', lng: 72.8 }, destination: { lat: 19.0, lng: 72.8 } });
  assert(r.code === 400, 'non-numeric lat → 400');
  assert(r.body?.detail?.includes('origin.lat'), 'detail mentions origin.lat');

  r = await callHandler({ origin: { lat: 91, lng: 72.8 }, destination: { lat: 19.0, lng: 72.8 } });
  assert(r.code === 400, 'lat > 90 → 400');

  r = await callHandler({ origin: { lat: 18.9, lng: 72.8 }, destination: {} });
  assert(r.code === 400, 'destination missing lat → 400');

  r = await callHandler({ origin: { lat: 18.9, lng: 72.8 }, destination: { lat: 19.0, lng: 72.8 }, departureTime: 'not-a-date' });
  assert(r.code === 400, 'invalid departureTime → 400');
  assert(r.body?.detail?.includes('departureTime'), 'detail mentions departureTime');

  console.log('  Validation tests complete');
}

// ── Summary ────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(72));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(72));
if (failed > 0) process.exit(1);
