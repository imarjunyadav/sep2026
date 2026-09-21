import { request } from 'node:https';
import { Router } from 'express';
import { config } from '../config.js';

export const placesRouter = Router();

const PLACES_BASE = 'https://places.googleapis.com/v1';

// ── Internal HTTP helpers ──────────────────────────────────────────────────────

function placesPost(path, body, fieldMask) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(`${PLACES_BASE}${path}`, {
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
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(`Places API HTTP ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 300)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Places API parse error: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function placesGet(path, fieldMask) {
  return new Promise((resolve, reject) => {
    const req = request(`${PLACES_BASE}${path}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key':  config.googleKey,
        'X-Goog-FieldMask': fieldMask,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(`Places API HTTP ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 300)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Places API parse error: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── GET /api/places/autocomplete?q=...&lat=...&lng=... ─────────────────────────

placesRouter.get('/places/autocomplete', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'q must be at least 2 characters' });
    }

    const body = {
      input: q,
      includedRegionCodes: ['in'],
    };

    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isFinite(lat) && isFinite(lng)) {
      body.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 50000.0,   // 50 km bias around current location
        },
      };
    }

    const data = await placesPost(
      '/places:autocomplete',
      body,
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
    );

    const predictions = (data.suggestions ?? []).map(s => {
      const p = s.placePrediction ?? {};
      return {
        placeId: p.placeId ?? null,
        name:    p.structuredFormat?.mainText?.text    ?? p.text?.text ?? '',
        address: p.structuredFormat?.secondaryText?.text ?? '',
      };
    });

    res.json({ predictions });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/places/details?placeId=... ───────────────────────────────────────

placesRouter.get('/places/details', async (req, res, next) => {
  try {
    const placeId = String(req.query.placeId ?? '').trim();
    if (!placeId) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'placeId is required' });
    }

    const data = await placesGet(
      `/places/${encodeURIComponent(placeId)}`,
      'id,displayName,formattedAddress,location',
    );

    const loc = data.location;
    if (!loc?.latitude || !loc?.longitude) {
      return res.status(404).json({ error: 'NOT_FOUND', detail: 'Place not found or has no location' });
    }

    res.json({
      placeId:  data.id ?? placeId,
      name:     data.displayName?.text ?? '',
      address:  data.formattedAddress  ?? '',
      lat:      loc.latitude,
      lng:      loc.longitude,
    });
  } catch (err) {
    next(err);
  }
});
