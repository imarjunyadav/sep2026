export async function searchPlaces(q, { lat, lng } = {}, signal) {
  const params = new URLSearchParams({ q });
  if (lat != null && lng != null) {
    params.set('lat', String(lat));
    params.set('lng', String(lng));
  }
  const res = await fetch(`/api/places/autocomplete?${params}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Places error ${res.status}`);
  }
  return res.json(); // { predictions: [{ placeId, description, mainText, secondaryText }] }
}

export async function getPlaceDetails(placeId, signal) {
  const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Details error ${res.status}`);
  }
  return res.json(); // { placeId, name, address, lat, lng }
}

export async function findRoutes(origin, destination, departureTime, signal) {
  const res = await fetch('/api/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      origin:      { lat: origin.lat,      lng: origin.lng,      name: origin.name },
      destination: { lat: destination.lat, lng: destination.lng, name: destination.name },
      departureTime: departureTime || new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Routes error ${res.status}`);
  }
  return res.json(); // { journeys, warnings, requestedAt }
}
