/**
 * Tunable constants for the Journey Service.
 * Adjust after testing real Mumbai journeys — these are calibrated heuristics,
 * not measured data. Keep all thresholds and multipliers here so they can be
 * changed in one place without touching business logic.
 */
export const JOURNEY_CONFIG = Object.freeze({

  // ── Station search ──────────────────────────────────────────────────────────
  NEARBY_RADIUS_KM:    2,   // search radius for board/alight stations
  NEARBY_MAX_STATIONS: 3,   // max stations per end; up to 3×3=9 pairs, all RailRadar-cached

  // ── Walk estimation ─────────────────────────────────────────────────────────
  WALK_SPEED_MPS: 1.3,   // average pedestrian speed in m/s
  STREET_FACTOR:  1.4,   // Haversine → street distance multiplier

  // ── Effective-cost multipliers ──────────────────────────────────────────────
  // One minute of walking or waiting counts more than one minute on a train.
  // Multiplied against durationSecs before summing into a comparable score.
  WALK_MULTIPLIER:    1.8,   // walking effort premium (Mumbai heat, footpaths)
  WAIT_MULTIPLIER:    1.5,   // platform wait premium (exposure, anxiety)
  TRANSIT_MULTIPLIER: 1.0,   // in-vehicle baseline; also used for driving

  // ── Hard filters ────────────────────────────────────────────────────────────
  MAX_WALK_ONLY_SECS:     3600,  // 60 min — drop standalone walk-only routes above this
  MAX_COMBINED_WALK_SECS: 2400,  // 40 min — max (walk-to + walk-from) in a Local journey
  MAX_WAIT_HARD_SECS:     2700,  // 45 min — hard-drop Local if wait ≥ this AND better exists

  // ── Train selection per station pair ────────────────────────────────────────
  TRAINS_PER_PAIR:     3,   // catchable trains fetched per pair (candidates)
  MAX_OUTPUT_PER_PAIR: 2,   // Local journeys kept per board/alight pair in final output

  // ── Outlier removal ─────────────────────────────────────────────────────────
  // Drop any journey whose effectiveCost exceeds best × this multiplier,
  // unless it is the only representative of its mode category.
  OUTLIER_MULTIPLIER: 2.5,

  // ── Near-duplicate suppression (same board/alight pair) ─────────────────────
  // Suppress a Local journey if another already-kept journey on the same pair
  // has BOTH a close departure AND close effective cost.
  NEAR_DUP_DEPARTURE_DIFF_SECS:      8 * 60,   // 8 min departure proximity
  NEAR_DUP_EFFECTIVE_COST_DIFF_SECS: 3 * 60,   // 3 min effective-cost proximity

  // ── Output ──────────────────────────────────────────────────────────────────
  MAX_RESULTS: 8,

});
