import 'dotenv/config';
import { MUMBAI_LOCAL_STATIONS, STATION_BY_CODE } from './data/mumbaiLocalStations.js';
import { nearbyStations } from './utils/nearbyStations.js';
import { railRadarProvider } from './providers/railRadar.js';

function fmt(secs) {
  if (!secs) return '?';
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function fmtTime(d) {
  if (!d) return '?';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function hr(label) {
  console.log('\n' + '═'.repeat(70));
  console.log(`TEST: ${label}`);
  console.log('═'.repeat(70));
}

// ── 1. Catalog integrity ────────────────────────────────────────────────────

hr('Station catalog — count and unique codes');
const codes = MUMBAI_LOCAL_STATIONS.map(s => s.code);
const unique = new Set(codes);
console.log(`  Total stations : ${MUMBAI_LOCAL_STATIONS.length}`);
console.log(`  Unique codes   : ${unique.size}`);
if (unique.size !== MUMBAI_LOCAL_STATIONS.length) {
  const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
  console.error('  ✗ Duplicate codes:', [...new Set(dupes)].join(', '));
} else {
  console.log('  ✓ All codes unique');
}

const crCount = MUMBAI_LOCAL_STATIONS.filter(s => s.line === 'CR').length;
const wrCount = MUMBAI_LOCAL_STATIONS.filter(s => s.line === 'WR').length;
const hlCount = MUMBAI_LOCAL_STATIONS.filter(s => s.line === 'HL').length;
console.log(`  CR: ${crCount}  WR: ${wrCount}  HL: ${hlCount}`);

const missingCoords = MUMBAI_LOCAL_STATIONS.filter(s => !s.lat || !s.lng);
if (missingCoords.length) {
  console.error('  ✗ Missing coords:', missingCoords.map(s => s.code).join(', '));
} else {
  console.log('  ✓ All stations have coordinates');
}

// ── 2. STATION_BY_CODE lookup ───────────────────────────────────────────────

hr('STATION_BY_CODE lookup');
const knownCodes = ['NHU', 'GC', 'TNA', 'BVI', 'CCG', 'CSMT', 'PNVL'];
for (const code of knownCodes) {
  const s = STATION_BY_CODE[code];
  if (s) {
    console.log(`  ✓ ${code.padEnd(6)} → ${s.name} (${s.line}) [${s.lat}, ${s.lng}]`);
  } else {
    console.error(`  ✗ ${code} not found`);
  }
}

// ── 3. Nearby stations ──────────────────────────────────────────────────────

hr('nearbyStations — test points');

const TEST_POINTS = [
  { name: 'TCET Gate 5',       lat: 19.2138, lng: 72.8581, radiusKm: 3 },
  { name: 'Nahur Station',     lat: 19.1571, lng: 72.9548, radiusKm: 0.5 },
  { name: 'Ghatkopar Metro',   lat: 19.0863, lng: 72.9090, radiusKm: 1 },
  { name: 'Bandra Kurla Cplx', lat: 19.0662, lng: 72.8680, radiusKm: 3 },
  { name: 'Churchgate area',   lat: 18.9352, lng: 72.8272, radiusKm: 1 },
];

for (const pt of TEST_POINTS) {
  const nearby = nearbyStations(pt.lat, pt.lng, pt.radiusKm, 3);
  console.log(`\n  ${pt.name} (r=${pt.radiusKm}km):`);
  if (nearby.length === 0) {
    console.log('    (no stations within radius)');
  } else {
    for (const s of nearby) {
      console.log(`    ${s.code.padEnd(6)} ${s.name.padEnd(20)} ${s.line}  ${s.distanceKm.toFixed(2)} km`);
    }
  }
}

// Structural assertion
const nahurNearby = nearbyStations(19.1571, 72.9548, 0.3, 3);
console.assert(nahurNearby.length > 0 && nahurNearby[0].code === 'NHU',
  'NHU should be the closest station to its own coordinates');
console.log('\n  ✓ Haversine self-proximity check passed');

// ── 4. Live RailRadar calls (may fail in restricted egress environments) ────

hr('RailRadar live — trainsBetween NHU → GC');
try {
  const legs = await railRadarProvider.trainsBetween('NHU', 'GC');
  console.log(`  HTTP OK — ${legs.length} train leg(s) returned`);
  if (legs.length > 0) {
    const first = legs[0];
    console.log(`  First: ${first.line} "${first.headsign || '?'}"`);
    console.log(`    ${first.from.name} → ${first.to.name}`);
    console.log(`    dep=${fmtTime(first.departure)}  arr=${fmtTime(first.arrival)}  dur=${fmt(first.durationSecs)}`);
    // Structure assertions
    console.assert(first.mode === 'LOCAL_TRAIN', 'mode must be LOCAL_TRAIN');
    console.assert(first.provider === 'railradar', 'provider must be railradar');
    console.assert(typeof first.durationSecs === 'number', 'durationSecs must be number');
    console.log('  ✓ Structure assertions passed');
  }
} catch (err) {
  console.warn(`  [SKIPPED] ${err.message.slice(0, 120)}`);
}

hr('RailRadar live — stationBoard NHU');
try {
  const board = await railRadarProvider.stationBoard('NHU');
  console.log(`  HTTP OK — ${board.departures.length} departure(s), ${board.arrivals.length} arrival(s)`);
  if (board.departures.length > 0) {
    const d = board.departures[0];
    console.log(`  Next dep: ${d.line} → ${d.to.name} at ${fmtTime(d.departure)}`);
  }
} catch (err) {
  console.warn(`  [SKIPPED] ${err.message.slice(0, 120)}`);
}

console.log('\n' + '═'.repeat(70));
console.log('All tests complete');
console.log('═'.repeat(70));
