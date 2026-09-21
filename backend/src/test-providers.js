import 'dotenv/config';
import { googleRoutesProvider } from './providers/googleRoutes.js';

// ── Mumbai test locations ──────────────────────────────────────────────────────

const NAHUR         = { lat: 19.1842, lng: 72.9575, name: 'Nahur Station'     };
const TCET          = { lat: 19.2138, lng: 72.8581, name: 'TCET Gate 5'       };
const GHATKOPAR     = { lat: 19.0863, lng: 72.9090, name: 'Ghatkopar Metro'   };
const POISAR        = { lat: 19.2084, lng: 72.8443, name: 'Poisar'            };
const GUNDAVALI     = { lat: 19.1145, lng: 72.8552, name: 'Gundavali Metro'   };

// ── output helpers ─────────────────────────────────────────────────────────────

function fmt(secs) {
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

function fmtKm(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function fmtTime(d) {
  if (!d) return 'N/A';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function printJourney(j, index) {
  const label = index != null ? `Route ${index + 1}` : 'Route';
  console.log(
    `\n  ${label}: ${j.category} | ${j.legs.length} legs | ` +
    `${fmt(j.totalDurationSecs)} | ${fmtKm(j.totalDistanceMeters)} | ` +
    `${j.transferCount} transfer(s)` +
    (j.fare ? ` | ₹${j.fare.amount}` : '')
  );
  for (const leg of j.legs) {
    const time = (leg.departure || leg.arrival)
      ? ` [${fmtTime(leg.departure)} → ${fmtTime(leg.arrival)}]`
      : '';
    const transit = leg.line ? ` (${leg.line}${leg.agency ? ', ' + leg.agency : ''})` : '';
    const poly = leg.polyline ? ' ✓poly' : '';
    console.log(
      `    ${leg.mode.padEnd(12)} ${(leg.from.name || '?').slice(0, 24).padEnd(24)}` +
      ` → ${(leg.to.name || '?').slice(0, 24)}` +
      ` [${fmt(leg.durationSecs)}, ${fmtKm(leg.distanceMeters)}]` +
      `${time}${transit}${poly}`
    );
  }
}

async function test(name, fn) {
  console.log('\n' + '═'.repeat(70));
  console.log(`TEST: ${name}`);
  console.log('═'.repeat(70));
  try {
    const journeys = await fn();
    if (!journeys.length) {
      console.log('  No journeys returned');
      return;
    }
    journeys.forEach((j, i) => printJourney(j, journeys.length > 1 ? i : null));
    console.log(`\n  ✓ ${journeys.length} journey(s) returned`);

    // Structural assertions
    for (const j of journeys) {
      console.assert(j.id, 'Journey must have an id');
      console.assert(j.category, 'Journey must have a category');
      console.assert(Array.isArray(j.legs) && j.legs.length > 0, 'Journey must have legs');
      console.assert(typeof j.totalDurationSecs === 'number', 'totalDurationSecs must be number');
      console.assert(typeof j.totalDistanceMeters === 'number', 'totalDistanceMeters must be number');
      for (const leg of j.legs) {
        console.assert(leg.mode, 'Leg must have mode');
        console.assert(leg.provider, 'Leg must have provider');
        console.assert(leg.from && leg.to, 'Leg must have from/to');
        console.assert(typeof leg.durationSecs === 'number', 'Leg durationSecs must be number');
      }
    }
    console.log('  ✓ All structure assertions passed');
  } catch (err) {
    console.error(`  ✗ FAILED: ${err.message}`);
  }
}

// ── run tests ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('Google Routes Provider — Mumbai validation');
  console.log(`Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  await test('CAR: Nahur → TCET', () =>
    googleRoutesProvider.routeCar(NAHUR, TCET)
  );

  await test('BIKE: Nahur → TCET', () =>
    googleRoutesProvider.routeBike(NAHUR, TCET)
  );

  await test('WALK: Gundavali → Poisar (short, Metro area)', () =>
    googleRoutesProvider.routeWalk(GUNDAVALI, POISAR)
  );

  await test('TRANSIT: Ghatkopar → Poisar (Metro expected)', () =>
    googleRoutesProvider.routeTransit(GHATKOPAR, POISAR)
  );

  await test('TRANSIT: Nahur → TCET (Bus/multimodal)', () =>
    googleRoutesProvider.routeTransit(NAHUR, TCET)
  );

  console.log('\n' + '═'.repeat(70));
  console.log('All tests complete');
  console.log('═'.repeat(70));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
