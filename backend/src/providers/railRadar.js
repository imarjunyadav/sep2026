import { get } from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from '../config.js';
import { Mode, makeLeg } from '../models/journey.js';
import { STATION_BY_CODE } from '../data/mumbaiLocalStations.js';

const BASE = 'https://api.railradar.in';

// Use proxy when running in the managed cloud environment; skip on Cloud Run.
const proxyAgent = process.env.HTTPS_PROXY
  ? new HttpsProxyAgent(process.env.HTTPS_PROXY)
  : undefined;

// In-process cache for trainsBetween results.
// Train schedules are fixed during the day; caching for 30 min avoids burning
// the 50 req/day free-tier quota when the same station pair is queried
// multiple times (repeated searches, multiple users, concurrent requests).
// Train schedules are fixed for the day; caching for 22 h means each station
// pair is fetched at most once per instance per day, keeping well within the
// 50 req/day free-tier limit even under moderate multi-user load.
const TRAIN_CACHE_TTL_MS = 22 * 60 * 60 * 1000; // 22 hours
const trainCache = new Map(); // key: 'FROM:TO', value: { legs, ts }

function apiGet(path) {
  if (!config.railRadarKey) {
    return Promise.reject(new Error('RailRadar API key not configured (RAILRADAR_API_KEY missing)'));
  }
  return new Promise((resolve, reject) => {
    const req = get(
      `${BASE}${path}`,
      {
        agent: proxyAgent,
        headers: {
          Authorization: `Bearer ${config.railRadarKey}`,
          'User-Agent': 'CityOne/1.0',
          Accept: 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const body = JSON.parse(data);
            if (res.statusCode !== 200) {
              // Classify error for actionable logging
              const category =
                res.statusCode === 401 ? 'AUTH_INVALID_KEY' :
                res.statusCode === 403 ? 'AUTH_FORBIDDEN' :
                res.statusCode === 429 ? 'QUOTA_EXCEEDED' :
                res.statusCode >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR';
              reject(new Error(
                `RailRadar ${category} (${res.statusCode}): ${JSON.stringify(body).slice(0, 200)}`
              ));
            } else {
              resolve(body);
            }
          } catch {
            reject(new Error(`RailRadar parse error: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', (err) => reject(new Error(`RailRadar network error: ${err.message}`)));
  });
}

// ── response parsers ───────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function todayISTComponents() {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  return { y: nowIST.getUTCFullYear(), mo: nowIST.getUTCMonth(), d: nowIST.getUTCDate() };
}

// Parse HH:MM string in IST to a UTC Date for today.
function parseTime(str) {
  if (!str) return null;
  const [h, m] = str.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const { y, mo, d } = todayISTComponents();
  return new Date(Date.UTC(y, mo, d, h, m, 0) - IST_OFFSET_MS);
}

function stationPoint(code, fallbackName) {
  const s = STATION_BY_CODE[code];
  return {
    name: s?.name ?? fallbackName ?? code,
    lat: s?.lat ?? null,
    lng: s?.lng ?? null,
  };
}

// Normalise one train entry from /v1/trains/between into a LOCAL_TRAIN Leg.
// Real API shape: entry.from.departure (HH:MM), entry.to.arrival (HH:MM),
// entry.duration (minutes), entry.distance (km), entry.train.number/name.
function normalizeTrainEntry(entry, fromCode, toCode) {
  const train = entry.train ?? entry;
  const number = String(train.number ?? train.trainNumber ?? train.train_number ?? '');
  const name   = train.name ?? train.trainName ?? null;

  const depTime = parseTime(entry.from?.departure ?? null);
  const arrTime = parseTime(entry.to?.arrival ?? null);

  let durationSecs;
  if (entry.duration) {
    durationSecs = entry.duration * 60;
  } else if (depTime && arrTime) {
    let diff = (arrTime - depTime) / 1000;
    if (diff < 0) diff += 86400; // overnight train
    durationSecs = diff;
  } else {
    durationSecs = 0;
  }

  const distanceMeters = entry.distance ? Math.round(entry.distance * 1000) : 0;

  return makeLeg({
    mode: Mode.LOCAL_TRAIN,
    provider: 'railradar',
    from: stationPoint(fromCode, entry.from?.name),
    to:   stationPoint(toCode,   entry.to?.name),
    departure: depTime,
    arrival:   arrTime,
    durationSecs,
    distanceMeters,
    line: number || null,
    agency: 'Central Railway / Western Railway',
    vehicle: 'LOCAL_TRAIN',
    headsign: name ?? null,
    metadata: { trainNumber: number, trainName: name },
  });
}

// ── provider ───────────────────────────────────────────────────────────────

export const railRadarProvider = {
  /**
   * Fetch scheduled trains between two station codes.
   * Returns an array of LOCAL_TRAIN Legs (one per train).
   * Results are cached per station pair for 30 minutes to stay within the
   * 50 req/day free-tier limit — train schedules are fixed throughout the day.
   */
  async trainsBetween(fromCode, toCode) {
    const cacheKey = `${fromCode}:${toCode}`;
    const cached = trainCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < TRAIN_CACHE_TTL_MS) {
      console.log(`[railradar] cache hit ${fromCode}→${toCode} (${cached.legs.length} trains)`);
      return cached.legs;
    }

    const body = await apiGet(`/v1/trains/between/${fromCode}/${toCode}`);
    const trains = body?.data?.trains ?? body?.trains ?? [];
    if (!Array.isArray(trains)) return [];
    const legs = [];
    for (const t of trains) {
      const leg = normalizeTrainEntry(t, fromCode, toCode);
      if (leg.from.lat === null || leg.to.lat === null) {
        const missing = [
          leg.from.lat === null ? fromCode : null,
          leg.to.lat === null ? toCode : null,
        ].filter(Boolean).join(', ');
        console.warn(`[railradar] Dropping leg — station code(s) not in catalog: ${missing}`);
        continue;
      }
      legs.push(leg);
    }

    trainCache.set(cacheKey, { legs, ts: Date.now() });
    return legs;
  },

  /**
   * Fetch the live station board.
   * Returns { departures: Leg[], arrivals: Leg[] }.
   * Real API shape: body.data.trains[] with entry.train, entry.stop, entry.live.
   * entry.stop.departure / entry.stop.arrival → scheduled HH:MM strings (IST).
   * entry.live.expectedDepartureTime / expectedArrivalTime → ISO strings.
   */
  async stationBoard(stationCode) {
    const body = await apiGet(`/v1/stations/${stationCode}/live`);
    const trains = body?.data?.trains ?? [];
    if (!Array.isArray(trains)) return { departures: [], arrivals: [] };

    const departures = trains.map(entry => {
      const train  = entry.train ?? entry;
      const number = String(train.number ?? train.trainNumber ?? '');
      const name   = train.name ?? null;
      const destCode = train.destination ?? train.to?.code ?? null;

      // Prefer live expected time; fall back to scheduled stop time.
      const depTime = entry.live?.expectedDepartureTime
        ? new Date(entry.live.expectedDepartureTime)
        : parseTime(entry.stop?.departure ?? null);
      const arrTime = entry.live?.expectedArrivalTime
        ? new Date(entry.live.expectedArrivalTime)
        : parseTime(entry.stop?.arrival ?? null);

      return makeLeg({
        mode: Mode.LOCAL_TRAIN,
        provider: 'railradar',
        from: stationPoint(stationCode, null),
        to:   stationPoint(destCode, train.destinationName ?? null),
        departure: depTime,
        arrival:   arrTime,
        durationSecs: 0,
        distanceMeters: 0,
        line: number || null,
        agency: 'Central Railway / Western Railway',
        vehicle: 'LOCAL_TRAIN',
        headsign: name ?? null,
        metadata: { trainNumber: number, trainName: name },
      });
    });

    return { departures, arrivals: [] };
  },

  /**
   * Fetch live running status for a single train.
   * Returns raw body; callers use this for live delay / current station info.
   */
  async trainLive(trainNumber) {
    return apiGet(`/v1/trains/${trainNumber}/live`);
  },
};
