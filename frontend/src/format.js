const IST = { timeZone: 'Asia/Kolkata' };

export function fmtTime(isoString) {
  if (!isoString) return '--:--';
  return new Date(isoString).toLocaleTimeString('en-IN', { ...IST, hour: '2-digit', minute: '2-digit', hour12: false });
}

export function fmtDuration(secs) {
  if (!secs && secs !== 0) return '--';
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}

export function fmtDistance(meters) {
  if (!meters && meters !== 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function leavesIn(isoString) {
  if (!isoString) return null;
  const diff = Math.round((new Date(isoString) - Date.now()) / 60000);
  if (diff < 0) return null;
  if (diff === 0) return 'Now';
  return `in ${diff} min`;
}

export function modeLabel(mode) {
  const map = {
    WALK:        'Walk',
    LOCAL_TRAIN: 'Local Train',
    METRO:       'Metro',
    BUS:         'Bus',
    CAR:         'Drive',
    BIKE:        'Cycle',
    FERRY:       'Ferry',
    TAXI:        'Taxi',
    AUTO:        'Auto',
  };
  return map[mode] ?? mode;
}
