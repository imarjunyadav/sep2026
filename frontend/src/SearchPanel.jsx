import { useState, useEffect } from 'react';
import PlaceInput from './PlaceInput.jsx';

const RECENT_KEY = 'cityone_recent_v1';
const MAX_RECENT = 5;

// Always display and interpret times in IST (Asia/Kolkata, UTC+5:30).
function toISTDatetimeStr(date) {
  return date.toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T').slice(0, 16);
}

function parseISTDatetime(str) {
  // str is "YYYY-MM-DDTHH:MM" interpreted as IST
  return new Date(`${str}:00+05:30`);
}

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); }
  catch { return []; }
}

function saveRecent(origin, destination) {
  const entry = { origin, destination };
  const prev = loadRecent().filter(
    r => !(r.origin?.name === origin.name && r.destination?.name === destination.name)
  );
  localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...prev].slice(0, MAX_RECENT)));
}

export default function SearchPanel({ onSearch, initialOrigin, initialDestination }) {
  const [origin, setOrigin] = useState(initialOrigin ?? null);
  const [destination, setDestination] = useState(initialDestination ?? null);
  const [swapCount, setSwapCount] = useState(0);
  const [gpsError, setGpsError] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [isNow, setIsNow] = useState(true);
  const [depTime, setDepTime] = useState(() => toISTDatetimeStr(new Date()));
  const [recent, setRecent] = useState(loadRecent);

  useEffect(() => {
    if (!isNow) return;
    const id = setInterval(() => setDepTime(toISTDatetimeStr(new Date())), 30000);
    return () => clearInterval(id);
  }, [isNow]);

  function swap() {
    setOrigin(destination);
    setDestination(origin);
    setSwapCount((c) => c + 1);
  }

  function handleGps() {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        setOrigin({ name: 'Current location', address: '', lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(err.code === 1 ? 'Location access denied' : 'Could not get your location');
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!origin || !destination) return;
    const departureTime = isNow ? new Date().toISOString() : parseISTDatetime(depTime).toISOString();
    saveRecent(origin, destination);
    setRecent(loadRecent());
    onSearch(origin, destination, departureTime);
  }

  function applyRecent(r) {
    setOrigin(r.origin);
    setDestination(r.destination);
    setSwapCount((c) => c + 1);
  }

  const biasCoords = origin ? { lat: origin.lat, lng: origin.lng } : undefined;

  return (
    <form className="search-panel" onSubmit={handleSubmit} noValidate>
      {/* From / To card */}
      <div className="search-fields-card">
        <div className="search-field-row">
          <span className="search-dot search-dot--from" aria-hidden="true" />
          <div className="search-field-input">
            <PlaceInput
              key={`origin-${swapCount}`}
              label="From"
              value={origin}
              onSelect={setOrigin}
            />
          </div>
          <button
            type="button"
            className={`gps-btn${gpsLoading ? ' gps-btn--loading' : ''}`}
            aria-label="Use my location"
            onClick={handleGps}
            disabled={gpsLoading}
          >
            {gpsLoading ? '…' : '⊙'}
          </button>
        </div>

        <div className="search-connector-row">
          <span className="search-connector-line" aria-hidden="true" />
          <button type="button" className="swap-btn" aria-label="Swap origin and destination" onClick={swap}>
            ⇅
          </button>
        </div>

        <div className="search-field-row">
          <span className="search-dot search-dot--to" aria-hidden="true" />
          <div className="search-field-input">
            <PlaceInput
              key={`dest-${swapCount}`}
              label="To"
              value={destination}
              onSelect={setDestination}
              biasCoords={biasCoords}
            />
          </div>
        </div>
      </div>

      {gpsError && <p className="error gps-error">{gpsError}</p>}

      {/* Time picker */}
      <div className="search-time-card">
        <button
          type="button"
          className={`time-pill${isNow ? ' time-pill--active' : ''}`}
          onClick={() => { setIsNow(true); setDepTime(toISTDatetimeStr(new Date())); }}
        >
          Now
        </button>
        <input
          type="datetime-local"
          className={`time-input${isNow ? ' time-input--hidden' : ''}`}
          value={depTime}
          onChange={(e) => { setIsNow(false); setDepTime(e.target.value); }}
          aria-label="Departure time"
        />
        {!isNow && (
          <button
            type="button"
            className="time-pill"
            onClick={() => { setIsNow(true); setDepTime(toISTDatetimeStr(new Date())); }}
            aria-label="Reset to now"
          >
            ✕
          </button>
        )}
      </div>

      <button type="submit" className="search-btn" disabled={!origin || !destination}>
        Search routes
      </button>

      {/* Recent searches */}
      {recent.length > 0 && (
        <div className="recent-section">
          <p className="recent-heading">Recent</p>
          <ul className="recent-list">
            {recent.map((r, i) => (
              <li key={i}>
                <button type="button" className="recent-item" onClick={() => applyRecent(r)}>
                  <span className="recent-text">{r.origin?.name} → {r.destination?.name}</span>
                  <span className="recent-arrow">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
