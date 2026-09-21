import { fmtTime, fmtDuration, leavesIn, modeLabel } from './format.js';

const MODE_COLORS = {
  LOCAL_TRAIN: '#2563eb',
  METRO: '#7c3aed',
  BUS: '#ea580c',
  WALK: '#d1d5db',
  CAR: '#d1d5db',
  BIKE: '#059669',
  FERRY: '#0891b2',
  TAXI: '#d1d5db',
  AUTO: '#d1d5db',
};

function modeCssClass(mode) {
  const map = {
    LOCAL_TRAIN: 'train', METRO: 'metro', BUS: 'bus',
    WALK: 'walk', CAR: 'car', BIKE: 'bike',
    FERRY: 'walk', TAXI: 'car', AUTO: 'car',
  };
  return `mode-${map[mode] ?? 'walk'}`;
}

export default function JourneyCard({ journey, onClick }) {
  const departs = journey.departure;
  const arrives = journey.arrival;
  const eta = leavesIn(departs);
  const walkMins = Math.round((journey.totalWalkSecs ?? 0) / 60);

  const fareVal = journey.fare?.amount ?? journey.fare;

  return (
    <button className="journey-card" onClick={onClick} type="button" aria-label="View journey details">
      <div className="journey-card-top">
        <div className="journey-time-block">
          <span>{fmtTime(departs)}</span>
          <span className="journey-arrow">→</span>
          <span>{fmtTime(arrives)}</span>
        </div>
        <div className="journey-right">
          <span className="journey-duration">{fmtDuration(journey.durationSecs)}</span>
          {eta && <span className="journey-eta">{eta}</span>}
        </div>
      </div>

      {/* Proportional mode bar */}
      <div className="journey-mode-bar" aria-hidden="true">
        {journey.legs.map((leg, i) => (
          <div
            key={i}
            className="journey-mode-seg"
            style={{
              background: MODE_COLORS[leg.mode] ?? '#d1d5db',
              flex: leg.durationSecs ?? 1,
            }}
          />
        ))}
      </div>

      {/* Mode chips */}
      <div className="journey-modes">
        {journey.legs
          .filter(leg => leg.mode !== 'WALK' || journey.legs.length === 1)
          .map((leg, i) => {
            // For local trains, headsign (e.g. "CST FAST") is more useful than the numeric train number.
            // For buses and metro, route/line name is the key identifier.
            const chipLabel = leg.mode === 'LOCAL_TRAIN'
              ? (leg.headsign || leg.line || null)
              : (leg.line || null);
            return (
              <span key={i} className={`leg-chip ${modeCssClass(leg.mode)}`}>
                {modeLabel(leg.mode)}
                {chipLabel && <span className="leg-line"> {chipLabel}</span>}
              </span>
            );
          })}
      </div>

      <div className="journey-card-bot">
        {walkMins > 0 && <span>{walkMins} min walk</span>}
        {journey.transferCount > 0 && (
          <span>{journey.transferCount} change{journey.transferCount > 1 ? 's' : ''}</span>
        )}
        {fareVal != null && (
          <span className="journey-fare">₹{fareVal}</span>
        )}
      </div>
    </button>
  );
}
