import { MUMBAI_LOCAL_STATIONS } from '../data/mumbaiLocalStations.js';

const R_KM = 6371;

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns up to `maxResults` stations within `radiusKm` of the given point,
 * sorted nearest-first. Each result has all station fields plus `distanceKm`.
 */
export function nearbyStations(lat, lng, radiusKm = 2, maxResults = 3) {
  return MUMBAI_LOCAL_STATIONS
    .map(s => ({ ...s, distanceKm: haversineKm(lat, lng, s.lat, s.lng) }))
    .filter(s => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, maxResults);
}
