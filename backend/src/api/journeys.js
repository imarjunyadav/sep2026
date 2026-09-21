import { Router } from 'express';
import { findJourneys } from '../services/journeyService.js';

export const journeysRouter = Router();

// ── Validation ─────────────────────────────────────────────────────────────────

function validatePoint(val, field) {
  if (!val || typeof val !== 'object') return `${field} is required`;
  const lat = Number(val.lat);
  const lng = Number(val.lng);
  if (!isFinite(lat))      return `${field}.lat must be a finite number`;
  if (lat < -90 || lat > 90)   return `${field}.lat must be between -90 and 90`;
  if (!isFinite(lng))      return `${field}.lng must be a finite number`;
  if (lng < -180 || lng > 180) return `${field}.lng must be between -180 and 180`;
  return null;
}

function coercePoint(val) {
  return {
    lat:  Number(val.lat),
    lng:  Number(val.lng),
    name: typeof val.name === 'string' ? val.name.trim().slice(0, 200) : undefined,
  };
}

// ── Serialization ───────────────────────────────────────────────────────────────

function isoOrNull(d) {
  return d instanceof Date ? d.toISOString() : (d ?? null);
}

function serializeLeg(leg) {
  return {
    mode:           leg.mode,
    from:           leg.from,
    to:             leg.to,
    departure:      isoOrNull(leg.departure),
    arrival:        isoOrNull(leg.arrival),
    durationSecs:   leg.durationSecs   ?? 0,
    distanceMeters: leg.distanceMeters ?? 0,
    isEstimated:    leg.metadata?.estimated === true,
    line:           leg.line     ?? null,
    headsign:       leg.headsign ?? null,
    agency:         leg.agency   ?? null,
    polyline:       leg.polyline ?? null,
  };
}

export function serializeJourney(j, requestedAt) {
  let durationSecs = j.totalDurationSecs;
  if (requestedAt && j.arrival) {
    const arrMs = j.arrival instanceof Date ? j.arrival.getTime() : new Date(j.arrival).getTime();
    const userCentric = Math.round((arrMs - requestedAt.getTime()) / 1000);
    if (userCentric > 0) durationSecs = Math.max(durationSecs, userCentric);
  }

  return {
    id:            j.id,
    category:      j.category,
    departure:     isoOrNull(j.departure),
    arrival:       isoOrNull(j.arrival),
    durationSecs,
    totalWalkSecs: j.totalWalkSecs,
    waitSecs:      j.waitSecs ?? 0,
    transferCount: j.transferCount,
    fare:          j.fare ?? null,
    legs:          j.legs.map(serializeLeg),
  };
}

// ── Route handler ───────────────────────────────────────────────────────────────

const MAX_PAST_MS   = 2  * 3600 * 1000;   // 2 h
const MAX_FUTURE_MS = 24 * 3600 * 1000;   // 24 h

journeysRouter.post('/routes', async (req, res, next) => {
  try {
    const { origin, destination, departureTime } = req.body ?? {};

    const errO = validatePoint(origin, 'origin');
    if (errO) return res.status(400).json({ error: 'INVALID_REQUEST', detail: errO });

    const errD = validatePoint(destination, 'destination');
    if (errD) return res.status(400).json({ error: 'INVALID_REQUEST', detail: errD });

    let depDate;
    if (departureTime != null) {
      depDate = new Date(departureTime);
      if (isNaN(depDate.getTime())) {
        return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'departureTime must be a valid ISO date string' });
      }
      const now = Date.now();
      if (depDate.getTime() < now - MAX_PAST_MS) {
        return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'departureTime is too far in the past (max 2 hours ago)' });
      }
      if (depDate.getTime() > now + MAX_FUTURE_MS) {
        return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'departureTime is too far in the future (max 24 hours ahead)' });
      }
    } else {
      depDate = new Date();
    }

    const { journeys, warnings } = await findJourneys(
      coercePoint(origin),
      coercePoint(destination),
      depDate,
    );

    res.json({
      journeys: journeys.map(j => serializeJourney(j, depDate)),
      warnings,
      requestedAt: depDate.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
