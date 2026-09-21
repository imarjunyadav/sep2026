export const Mode = Object.freeze({
  WALK: 'WALK',
  BUS: 'BUS',
  METRO: 'METRO',
  LOCAL_TRAIN: 'LOCAL_TRAIN',
  CAR: 'CAR',
  BIKE: 'BIKE',
});

export const Category = Object.freeze({
  CAR: 'CAR',
  BIKE: 'BIKE',
  WALK: 'WALK',
  BUS: 'BUS',
  METRO: 'METRO',
  LOCAL_TRAIN: 'LOCAL_TRAIN',
  MULTIMODAL: 'MULTIMODAL',
});

export function makeLeg(fields) {
  return {
    mode: fields.mode,
    provider: fields.provider,
    from: fields.from,           // { name, lat, lng }
    to: fields.to,               // { name, lat, lng }
    departure: fields.departure ?? null,
    arrival: fields.arrival ?? null,
    durationSecs: fields.durationSecs ?? 0,
    distanceMeters: fields.distanceMeters ?? 0,
    line: fields.line ?? null,
    agency: fields.agency ?? null,
    vehicle: fields.vehicle ?? null,
    headsign: fields.headsign ?? null,
    stops: fields.stops ?? null,
    polyline: fields.polyline ?? null,
    fare: fields.fare ?? null,
    metadata: fields.metadata ?? {},
  };
}

export function makeJourney({ category, legs, fare = null }) {
  const totalDurationSecs = legs.reduce((s, l) => s + (l.durationSecs || 0), 0);
  const totalDistanceMeters = legs.reduce((s, l) => s + (l.distanceMeters || 0), 0);
  const totalWalkSecs = legs
    .filter(l => l.mode === Mode.WALK)
    .reduce((s, l) => s + (l.durationSecs || 0), 0);
  const nonWalkLegs = legs.filter(l => l.mode !== Mode.WALK);
  const transferCount = Math.max(0, nonWalkLegs.length - 1);

  const departure = legs[0]?.departure ?? null;
  const arrival = legs[legs.length - 1]?.arrival ?? null;

  const depTs = legs[0]?.departure?.getTime() ?? 0;
  const sig = `${depTs}|` + legs
    .map(l => `${l.mode}:${l.from?.name ?? ''}:${l.to?.name ?? ''}`)
    .join('|');
  const id = Buffer.from(sig).toString('base64url').slice(0, 24);

  return {
    id,
    category,
    legs,
    totalDurationSecs,
    totalDistanceMeters,
    totalWalkSecs,
    transferCount,
    fare,
    departure,
    arrival,
  };
}
