const config = require('../config');

async function searchPlaces(query) {
  if (!query || query.length < 2) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&addressdetails=1`;
  const response = await fetch(url, {
    headers: { 'User-Agent': config.nominatimUserAgent },
  });
  if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);
  const data = await response.json();
  return data
    .map((item) => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type || item.class || 'location',
      importance: item.importance || 0,
    }))
    .sort((a, b) => (b.importance || 0) - (a.importance || 0));
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
  const response = await fetch(url, {
    headers: { 'User-Agent': config.nominatimUserAgent },
  });
  if (!response.ok) throw new Error(`Reverse geocode failed: ${response.status}`);
  const data = await response.json();
  return {
    name: data.display_name || `${lat}, ${lon}`,
    lat: parseFloat(lat),
    lng: parseFloat(lon),
    address: data.address || {},
  };
}

module.exports = { searchPlaces, reverseGeocode };
