import { useState } from 'react';
import { fmtTime, fmtDuration, fmtDistance, modeLabel } from './format.js';
import JourneyMap from './JourneyMap.jsx';


function modeCssClass(mode) {
  const map = {
    LOCAL_TRAIN: 'train', METRO: 'metro', BUS: 'bus',
    WALK: 'walk', CAR: 'car', BIKE: 'bike',
    FERRY: 'walk', TAXI: 'car', AUTO: 'car',
  };
  return `mode-${map[mode] ?? 'walk'}`;
}

function WaitIndicator({ minutes }) {
  return (
    <div className="leg-wait">
      <div className="leg-wait-col">
        <span className="leg-connector leg-connector--wait" aria-hidden="true" />
      </div>
      <div className="leg-wait-body">
        <span className="leg-wait-text">Wait {minutes} min</span>
      </div>
    </div>
  );
}

function LegRow({ leg }) {
  const cls = modeCssClass(leg.mode);
  const stopCount = leg.intermediateStops?.length ?? leg.numStops ?? null;

  return (
    <div className={`leg-row leg-row--${cls}`}>
      <div className="leg-timestamp">{fmtTime(leg.departure)}</div>
      <div className="leg-icon-col">
        <span className={`leg-mode-dot ${cls}`} aria-hidden="true" />
        <span className="leg-connector" aria-hidden="true" />
      </div>
      <div className="leg-body">
        <span className="leg-place">{leg.from?.name ?? leg.from}</span>
        <div className="leg-info">
          <span className={`leg-chip ${cls}`}>
            {modeLabel(leg.mode)}
            {leg.line ? ` · ${leg.line}` : ''}
            {leg.headsign ? ` → ${leg.headsign}` : ''}
          </span>
          {stopCount != null && stopCount > 0 && (
            <span className="leg-stops">{stopCount} stop{stopCount > 1 ? 's' : ''}</span>
          )}
          <span className="leg-meta">
            {fmtDuration(leg.durationSecs)}
            {leg.distanceMeters ? ` · ${fmtDistance(leg.distanceMeters)}` : ''}
            {leg.isEstimated ? ' · est.' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function JourneyDetail({ journey, requestedAt, onBack }) {
  const [tab, setTab] = useState('timeline');

  const totalSecs = journey.durationSecs ?? 0;
  const walkMins = Math.round((journey.totalWalkSecs ?? 0) / 60);
  const waitMins = Math.round((journey.waitSecs ?? 0) / 60);

  const firstDep = journey.departure ? new Date(journey.departure) : null;
  const reqAt = requestedAt ? new Date(requestedAt) : null;
  const preDepartureWaitMins = (firstDep && reqAt && firstDep > reqAt)
    ? Math.round((firstDep - reqAt) / 60000)
    : 0;

  const fareVal = journey.fare?.amount ?? journey.fare;
  const lastLeg = journey.legs[journey.legs.length - 1];

  return (
    <div className="detail-panel">
      <div className="results-header">
        <button className="back-btn" onClick={onBack} type="button" aria-label="Back to results">
          ← Results
        </button>
        <h2 className="results-title">Journey detail</h2>
      </div>

      {/* Summary chips */}
      <div className="detail-summary-chips">
        <div className="detail-chip">
          <span className="detail-chip-value">{fmtDuration(totalSecs)}</span>
          <span className="detail-chip-label">Total</span>
        </div>
        {walkMins > 0 && (
          <div className="detail-chip">
            <span className="detail-chip-value">{walkMins}m</span>
            <span className="detail-chip-label">Walk</span>
          </div>
        )}
        {waitMins > 0 && (
          <div className={`detail-chip${preDepartureWaitMins >= 5 ? ' detail-chip--warn' : ''}`}>
            <span className="detail-chip-value">{waitMins}m</span>
            <span className="detail-chip-label">Wait</span>
          </div>
        )}
        {journey.transferCount > 0 && (
          <div className="detail-chip">
            <span className="detail-chip-value">{journey.transferCount}</span>
            <span className="detail-chip-label">Change{journey.transferCount > 1 ? 's' : ''}</span>
          </div>
        )}
        {fareVal != null && (
          <div className="detail-chip detail-chip--fare">
            <span className="detail-chip-value">₹{fareVal}</span>
            <span className="detail-chip-label">Fare</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="detail-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'timeline'}
          className={`detail-tab${tab === 'timeline' ? ' detail-tab--active' : ''}`}
          onClick={() => setTab('timeline')}
          type="button"
        >
          Timeline
        </button>
        <button
          role="tab"
          aria-selected={tab === 'map'}
          className={`detail-tab${tab === 'map' ? ' detail-tab--active' : ''}`}
          onClick={() => setTab('map')}
          type="button"
        >
          Map
        </button>
      </div>

      {/* Timeline tab */}
      {tab === 'timeline' && (
        <div className="leg-timeline" role="tabpanel">
          {journey.legs.map((leg, i) => {
            const prev = journey.legs[i - 1];
            let waitBetween = 0;
            if (prev?.arrival && leg.departure) {
              waitBetween = Math.round((new Date(leg.departure) - new Date(prev.arrival)) / 60000);
            }
            return (
              <div key={i}>
                {waitBetween >= 2 && <WaitIndicator minutes={waitBetween} />}
                <LegRow leg={leg} />
              </div>
            );
          })}

          {/* Arrival terminus */}
          <div className="leg-terminus">
            <div className="leg-terminus-stamp">{fmtTime(lastLeg?.arrival)}</div>
            <div className="leg-icon-col">
              <span className="leg-terminus-dot" aria-hidden="true" />
            </div>
            <div className="leg-body" style={{ paddingBottom: 8 }}>
              <span className="leg-place">{lastLeg?.to?.name ?? lastLeg?.to}</span>
            </div>
          </div>
        </div>
      )}

      {/* Map tab */}
      {tab === 'map' && <JourneyMap journey={journey} />}
    </div>
  );
}
