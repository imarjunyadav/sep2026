/**
 * Step 4 validation: run findJourneys against real APIs for diverse Mumbai O/D pairs.
 * Shows candidate selection, filtering decisions, effective costs, and ranked results.
 */
import 'dotenv/config';
import { findJourneys, fmt } from './services/journeyService.js';
import { JOURNEY_CONFIG as cfg } from './journeyConfig.js';

function hr(label) {
  console.log('\n' + '═'.repeat(72));
  console.log(`TEST: ${label}`);
  console.log('═'.repeat(72));
}

function fmtTime(d) {
  if (!d) return '?';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

function printJourney(j, rank) {
  const dep = fmtTime(j.departure);
  const arr = fmtTime(j.arrival);
  const ec  = fmt(j.effectiveCost);
  const bd  = j._costBreakdown;
  const modeStr = j.legs.map(l => l.mode).join(' → ');

  console.log(`\n  #${rank} [${j.category}] effectiveCost=${ec} total=${fmt(j.totalDurationSecs)}`);
  console.log(`     dep=${dep}  arr=${arr}  source=${j.source ?? 'unknown'}`);
  console.log(`     modes: ${modeStr}`);

  if (bd) {
    const parts = [
      bd.transitSecs ? `transit=${fmt(bd.transitSecs)}×${cfg.TRANSIT_MULTIPLIER}` : null,
      bd.walkSecs    ? `walk=${fmt(bd.walkSecs)}×${cfg.WALK_MULTIPLIER}` : null,
      bd.waitSecs    ? `wait=${fmt(bd.waitSecs)}×${cfg.WAIT_MULTIPLIER}` : null,
    ].filter(Boolean);
    if (parts.length) console.log(`     cost breakdown: ${parts.join('  ')}`);
  }

  if (j.waitSecs) console.log(`     platform wait: ${fmt(j.waitSecs)}`);
  if (j.totalWalkSecs) console.log(`     total walking: ${fmt(j.totalWalkSecs)} (${j.totalWalkSecs < 2400 ? 'ok' : 'near-cap'})`);

  for (const leg of j.legs) {
    const legDep = leg.departure ? fmtTime(leg.departure) : null;
    const legArr = leg.arrival   ? fmtTime(leg.arrival)   : null;
    const timing = legDep ? ` [${legDep}→${legArr}]` : '';
    const line   = leg.line ? ` (${leg.line})` : '';
    const est    = leg.metadata?.estimated ? ' *est' : '';
    console.log(`       ${leg.mode.padEnd(13)} ${leg.from.name} → ${leg.to.name}${line}${timing}${est}`);
  }
}

async function runTest(label, origin, destination) {
  hr(label);
  console.log(`  Origin:      ${origin.name}  [${origin.lat}, ${origin.lng}]`);
  console.log(`  Destination: ${destination.name}  [${destination.lat}, ${destination.lng}]`);
  console.log(`  Departure:   now (${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST)\n`);

  try {
    const { journeys, warnings } = await findJourneys(origin, destination, new Date());
    if (warnings.length) console.log(`  Warnings: ${warnings.join('; ')}`);
    if (journeys.length === 0) {
      console.log('  (no journeys returned)');
      return;
    }
    console.log(`\n  ── Ranked results (${journeys.length} of max ${cfg.MAX_RESULTS}) ──`);
    journeys.forEach((j, i) => printJourney(j, i + 1));
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }
}

// ── Test cases ─────────────────────────────────────────────────────────────────

// 1. CR Main Line — Nahur → Ghatkopar
//    Local train should be viable; two Dadar CR/Sion alight options within 2km of GC
await runTest(
  'CR Line: Nahur area → Ghatkopar area',
  { lat: 19.1571, lng: 72.9548, name: 'Nahur area' },
  { lat: 19.0863, lng: 72.9090, name: 'Ghatkopar area' }
);

// 2. WR Line — Churchgate → Bandra
//    WR Local should surface; Google transit likely also has options
await runTest(
  'WR Line: Churchgate → Bandra',
  { lat: 18.9322, lng: 72.8264, name: 'Churchgate' },
  { lat: 19.0548, lng: 72.8393, name: 'Bandra' }
);

// 3. Very short trip — walk should beat multimodal
//    ~600m walk, no station pair should survive the prune
await runTest(
  'Short trip: Grant Road → Mumbai Central (600m)',
  { lat: 18.9645, lng: 72.8155, name: 'Grant Road area' },
  { lat: 18.9696, lng: 72.8185, name: 'Mumbai Central area' }
);

// 4. Cross-line — Andheri (WR) → Kurla (CR/HL)
//    No direct Local service; Google transit should provide Metro/bus options
await runTest(
  'Cross-line: Andheri (WR) → Kurla (CR)',
  { lat: 19.1120, lng: 72.8487, name: 'Andheri' },
  { lat: 19.0653, lng: 72.8799, name: 'Kurla' }
);

// 5. Harbour Line — Vashi → Mankhurd
//    HL Local should be viable
await runTest(
  'Harbour Line: Vashi → Mankhurd area',
  { lat: 19.0754, lng: 72.9989, name: 'Vashi area' },
  { lat: 19.0396, lng: 72.9259, name: 'Mankhurd area' }
);

console.log('\n' + '═'.repeat(72));
console.log('All tests complete');
console.log('═'.repeat(72));
