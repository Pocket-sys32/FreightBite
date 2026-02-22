const EARTH_RADIUS_METERS = 6371000;
const METERS_TO_MILES = 0.000621371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const haversineMeters = (pointA, pointB) => {
  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);
  const deltaLat = toRadians(pointB.lat - pointA.lat);
  const deltaLng = toRadians(pointB.lng - pointA.lng);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
};

const haversineMiles = (pointA, pointB) => haversineMeters(pointA, pointB) * METERS_TO_MILES;
const metersToMiles = (meters) => meters * METERS_TO_MILES;
const roundMiles = (miles) => Number(miles.toFixed(1));

let lastGeoTime = 0;

const reverseGeocode = async (lat, lng) => {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastGeoTime));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastGeoTime = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FreightBite/1.0' }
    });
    const data = await response.json();
    return data.display_name;
  } catch (error) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
};

module.exports = {
  haversineMeters,
  haversineMiles,
  metersToMiles,
  roundMiles,
  reverseGeocode
};
