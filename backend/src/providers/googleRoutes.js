import { request } from 'node:https';
import { config } from '../config.js';
import { Mode, Category, makeLeg, makeJourney } from '../models/journey.js';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

function parseSecs(d) {
  if (!d) return 0;
  const n = parseInt(d, 10);
  return isNaN(n) ? 0 : n;
}

function vehicleToMode(type) {
  if (!type) return Mode.BUS;
  switch (type.toUpperCase()) {
    case 'BUS': return Mode.BUS;
    case 'SUBWAY':
    case 'METRO_RAIL': return Mode.METRO;
    case 'TRAIN':
    case 'COMMUTER_TRAIN':
    case 'HEAVY_RAIL':
    case 'RAIL': return Mode.LOCAL_TRAIN;
    default: return Mode.BUS;
  }
}

function post(body, fieldMask) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      ROUTES_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-Goog-Api-Key': config.googleKey,
          'X-Goog-FieldMask': fieldMask,
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode !== 200) {
              reject(new Error(
                `Google Routes HTTP ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 400)}`
              ));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Google Routes parse error: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function latLng(point) {
  return {
    location: { latLng: { latitude: point.lat, longitude: point.lng } }
  };
}

// ── field masks ────────────────────────────────────────────────────────────────

const SIMPLE_FIELDS = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.polyline',
].join(',');

const TRANSIT_FIELDS = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.travelAdvisory.transitFare',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.polyline',
  'routes.legs.steps.transitDetails',
].join(',');

// ── normalisers ────────────────────────────────────────────────────────────────

function normalizeSimple(route, category, from, to, departureTime) {
  const modeMap = { CAR: Mode.CAR, BIKE: Mode.BIKE, WALK: Mode.WALK };
  const durationSecs = parseSecs(route.duration);
  const depDate = departureTime instanceof Date ? departureTime : (departureTime ? new Date(departureTime) : null);
  const arrDate = depDate ? new Date(depDate.getTime() + durationSecs * 1000) : null;

  const leg = makeLeg({
    mode: modeMap[category],
    provider: 'google',
    from: { name: from.name || 'Origin', lat: from.lat, lng: from.lng },
    to: { name: to.name || 'Destination', lat: to.lat, lng: to.lng },
    departure: depDate,
    arrival: arrDate,
    durationSecs,
    distanceMeters: route.distanceMeters || 0,
    polyline: route.polyline?.encodedPolyline || null,
  });
  return makeJourney({ category, legs: [leg] });
}

function mergeWalkLegs(legs) {
  const merged = [];
  for (const leg of legs) {
    const prev = merged[merged.length - 1];
    if (prev && prev.mode === Mode.WALK && leg.mode === Mode.WALK) {
      merged[merged.length - 1] = {
        ...prev,
        to: leg.to,
        durationSecs: prev.durationSecs + leg.durationSecs,
        distanceMeters: prev.distanceMeters + leg.distanceMeters,
      };
    } else {
      merged.push(leg);
    }
  }
  return merged.filter(l => l.mode !== Mode.WALK || l.durationSecs > 0 || l.distanceMeters > 10);
}

function fillWalkContext(legs, originName, destinationName) {
  for (let i = 0; i < legs.length; i++) {
    if (legs[i].mode !== Mode.WALK) continue;

    const prev = legs[i - 1];
    const next = legs[i + 1];

    const fromName = prev ? (prev.to?.name ?? 'Walk') : (originName ?? 'Origin');
    const toName = next ? (next.from?.name ?? 'Walk') : (destinationName ?? 'Destination');

    let { departure, arrival } = legs[i];

    if (!departure && prev?.arrival) {
      departure = new Date(prev.arrival.getTime());
    }
    if (!departure && next?.departure) {
      departure = new Date(next.departure.getTime() - legs[i].durationSecs * 1000);
    }
    if (departure && !arrival) {
      arrival = new Date(departure.getTime() + legs[i].durationSecs * 1000);
    }

    legs[i] = {
      ...legs[i],
      from: { ...legs[i].from, name: fromName },
      to: { ...legs[i].to, name: toName },
      departure: departure ?? legs[i].departure,
      arrival: arrival ?? legs[i].arrival,
    };
  }
}

function normalizeTransit(route, origin, destination) {
  const steps = route.legs?.[0]?.steps || [];
  const legs = [];

  for (const step of steps) {
    if (step.travelMode === 'WALK') {
      const start = step.startLocation?.latLng;
      const end = step.endLocation?.latLng;
      legs.push(makeLeg({
        mode: Mode.WALK,
        provider: 'google',
        from: { name: 'Walk', lat: start?.latitude, lng: start?.longitude },
        to: { name: 'Walk', lat: end?.latitude, lng: end?.longitude },
        durationSecs: parseSecs(step.staticDuration),
        distanceMeters: step.distanceMeters || 0,
        polyline: step.polyline?.encodedPolyline || null,
      }));
      continue;
    }

    if (step.travelMode !== 'TRANSIT' || !step.transitDetails) continue;

    const td = step.transitDetails;
    const line = td.transitLine || {};
    const vehicle = line.vehicle || {};
    const stops = td.stopDetails || {};
    const depStop = stops.departureStop;
    const arrStop = stops.arrivalStop;

    legs.push(makeLeg({
      mode: vehicleToMode(vehicle.type),
      provider: 'google',
      from: {
        name: depStop?.name || 'Stop',
        lat: depStop?.location?.latLng?.latitude,
        lng: depStop?.location?.latLng?.longitude,
      },
      to: {
        name: arrStop?.name || 'Stop',
        lat: arrStop?.location?.latLng?.latitude,
        lng: arrStop?.location?.latLng?.longitude,
      },
      departure: stops.departureTime ? new Date(stops.departureTime) : null,
      arrival: stops.arrivalTime ? new Date(stops.arrivalTime) : null,
      durationSecs: parseSecs(step.staticDuration),
      distanceMeters: step.distanceMeters || 0,
      line: line.nameShort || line.name || null,
      agency: line.agencies?.map(a => a.name).join(', ') || null,
      vehicle: vehicle.type || null,
      headsign: td.headsign || null,
      polyline: step.polyline?.encodedPolyline || null,
      metadata: { googleVehicleType: vehicle.type },
    }));
  }

  const clean = mergeWalkLegs(legs);
  if (clean.length === 0) return null;

  fillWalkContext(clean, origin?.name, destination?.name);

  const transitModes = clean.filter(l => l.mode !== Mode.WALK).map(l => l.mode);
  const transitModeSet = new Set(transitModes);
  let category = Category.MULTIMODAL;
  if (transitModes.length === 0) category = Category.WALK;
  else if (transitModeSet.size === 1 && transitModeSet.has(Mode.BUS)) category = Category.BUS;
  else if (transitModeSet.size === 1 && transitModeSet.has(Mode.METRO)) category = Category.METRO;
  else if (transitModeSet.size === 1 && transitModeSet.has(Mode.LOCAL_TRAIN)) category = Category.LOCAL_TRAIN;

  const transitFare = route.travelAdvisory?.transitFare;
  const fare = transitFare
    ? {
        amount: Number(transitFare.units || 0) + (transitFare.nanos || 0) / 1e9,
        currency: transitFare.currencyCode || 'INR',
      }
    : null;

  const journey = makeJourney({ category, legs: clean, fare });

  const firstDep = clean[0]?.departure;
  const lastArr = clean[clean.length - 1]?.arrival;
  if (firstDep && lastArr) {
    const elapsedSecs = Math.round((lastArr - firstDep) / 1000);
    const movementSecs = journey.totalDurationSecs;
    journey.totalDurationSecs = elapsedSecs;
    journey.waitSecs = Math.max(0, elapsedSecs - movementSecs);
  }

  return journey;
}

// ── provider ───────────────────────────────────────────────────────────────────

async function routeSimple(travelMode, category, from, to, departureTime) {
  const body = {
    origin: latLng(from),
    destination: latLng(to),
    travelMode,
    computeAlternativeRoutes: false,
  };
  if (travelMode === 'DRIVE') body.routingPreference = 'TRAFFIC_AWARE';

  const data = await post(body, SIMPLE_FIELDS);
  const route = data.routes?.[0];
  if (!route) return [];
  return [normalizeSimple(route, category, from, to, departureTime)];
}

export const googleRoutesProvider = {
  routeCar(from, to, opts = {}) {
    return routeSimple('DRIVE', Category.CAR, from, to, opts.departureTime);
  },

  routeBike(from, to, opts = {}) {
    return routeSimple('TWO_WHEELER', Category.BIKE, from, to, opts.departureTime);
  },

  routeWalk(from, to, opts = {}) {
    return routeSimple('WALK', Category.WALK, from, to, opts.departureTime);
  },

  async routeTransit(from, to, opts = {}) {
    const body = {
      origin: latLng(from),
      destination: latLng(to),
      travelMode: 'TRANSIT',
      transitPreferences: {
        allowedTravelModes: ['BUS', 'SUBWAY', 'TRAIN', 'LIGHT_RAIL', 'RAIL'],
        routingPreference: opts.routingPreference ?? 'FEWER_TRANSFERS',
      },
      computeAlternativeRoutes: true,
    };
    if (opts.departureTime) {
      body.departureTime = opts.departureTime instanceof Date
        ? opts.departureTime.toISOString()
        : opts.departureTime;
    }

    const data = await post(body, TRANSIT_FIELDS);
    return (data.routes || []).map(r => normalizeTransit(r, from, to)).filter(Boolean);
  },
};
