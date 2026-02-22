const { TRUCK_STOPS } = require('./truckStops');
const { haversineMeters, metersToMiles, roundMiles, reverseGeocode } = require('./geo');
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const buildOsrmUrl = (origin, destination) => {
  const originPart = `${origin.lng},${origin.lat}`;
  const destinationPart = `${destination.lng},${destination.lat}`;
  return `http://router.project-osrm.org/route/v1/driving/${originPart};${destinationPart}?overview=full&steps=true&geometries=geojson`;
};

const decodePolyline = (encoded) => {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dLng;

    points.push([lng / 1e5, lat / 1e5]); // [lng, lat]
  }

  return points;
};

async function fetchRouteGeometry(origin, destination) {
  if (GOOGLE_MAPS_API_KEY) {
    const params = new URLSearchParams({
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      mode: 'driving',
      alternatives: 'false',
      key: GOOGLE_MAPS_API_KEY
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
    if (!response.ok) {
      const error = new Error(`Google Directions request failed with status ${response.status}.`);
      error.statusCode = response.status >= 500 ? 502 : 400;
      throw error;
    }
    const payload = await response.json();
    const route = payload?.routes?.[0];
    if (payload?.status !== 'OK' || !route) {
      const error = new Error(payload?.error_message || payload?.status || 'Google Directions returned no route.');
      error.statusCode = 502;
      throw error;
    }
    const meters = (route.legs || []).reduce((sum, leg) => sum + Number(leg?.distance?.value || 0), 0);
    const encoded = route?.overview_polyline?.points || '';
    const coordinates = decodePolyline(encoded);
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      const error = new Error('Google Directions route geometry was invalid.');
      error.statusCode = 502;
      throw error;
    }

    return {
      totalMiles: metersToMiles(meters),
      coordinates
    };
  }

  const response = await fetch(buildOsrmUrl(origin, destination));
  if (!response.ok) {
    const error = new Error(`OSRM request failed with status ${response.status}.`);
    error.statusCode = response.status >= 500 ? 502 : 400;
    throw error;
  }

  const data = await response.json();
  if (!data.routes || !data.routes[0] || !data.routes[0].geometry) {
    const error = new Error('OSRM returned no route geometry.');
    error.statusCode = 502;
    throw error;
  }

  const route = data.routes[0];
  const coordinates = route.geometry.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    const error = new Error('OSRM route geometry was invalid.');
    error.statusCode = 502;
    throw error;
  }

  return {
    totalMiles: metersToMiles(route.distance),
    coordinates
  };
}

const normalizeLabel = (label, point) => {
  if (label && typeof label === 'string') {
    return label;
  }

  if (!point) {
    return 'Unknown';
  }

  return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
};

const interpolatePoint = (start, end, ratio) => ({
  lat: start.lat + (end.lat - start.lat) * ratio,
  lng: start.lng + (end.lng - start.lng) * ratio
});

const buildCumulativeDistances = (coordinates) => {
  const distances = [0];

  for (let index = 1; index < coordinates.length; index += 1) {
    const prev = coordinates[index - 1];
    const current = coordinates[index];
    const segmentDistance = haversineMeters(
      { lat: prev[1], lng: prev[0] },
      { lat: current[1], lng: current[0] }
    );
    distances.push(distances[index - 1] + segmentDistance);
  }

  return distances;
};

const findPointAtDistance = (coordinates, cumulativeDistances, targetDistance) => {
  let index = cumulativeDistances.findIndex((distance) => distance >= targetDistance);
  if (index === -1) {
    index = cumulativeDistances.length - 1;
  }

  if (index === 0) {
    const first = coordinates[0];
    return { lat: first[1], lng: first[0] };
  }

  const previousDistance = cumulativeDistances[index - 1];
  const nextDistance = cumulativeDistances[index];
  const ratio = nextDistance === previousDistance
    ? 0
    : (targetDistance - previousDistance) / (nextDistance - previousDistance);

  const start = { lat: coordinates[index - 1][1], lng: coordinates[index - 1][0] };
  const end = { lat: coordinates[index][1], lng: coordinates[index][0] };

  return interpolatePoint(start, end, ratio);
};

const snapToTruckStop = (point) => {
  let nearest = TRUCK_STOPS[0];
  let nearestDistance = Infinity;

  for (const stop of TRUCK_STOPS) {
    const distance = haversineMeters(point, { lat: stop.lat, lng: stop.lng });
    if (distance < nearestDistance) {
      nearest = stop;
      nearestDistance = distance;
    }
  }

  return nearest;
};

const segmentRouteGeometry = (coordinates, legCount) => {
  const cumulativeDistances = buildCumulativeDistances(coordinates);
  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];
  const legDistance = totalDistance / legCount;

  const boundaries = [{ distance: 0, point: { lat: coordinates[0][1], lng: coordinates[0][0] } }];

  for (let index = 1; index < legCount; index += 1) {
    const targetDistance = legDistance * index;
    const point = findPointAtDistance(coordinates, cumulativeDistances, targetDistance);
    boundaries.push({ distance: targetDistance, point });
  }

  const last = coordinates[coordinates.length - 1];
  boundaries.push({
    distance: totalDistance,
    point: { lat: last[1], lng: last[0] }
  });

  return { boundaries, totalDistance };
};

const segmentLoad = async (origin, destination) => {
  if (typeof fetch !== 'function') {
    const error = new Error('Fetch API is not available in this runtime.');
    error.statusCode = 500;
    throw error;
  }

  const routeData = await fetchRouteGeometry(origin, destination);
  const totalMiles = routeData.totalMiles;
  const legCount = Math.max(1, Math.ceil(totalMiles / 450));
  const coordinates = routeData.coordinates;

  const { boundaries, totalDistance } = segmentRouteGeometry(coordinates, legCount);
  const computedTotalMiles = metersToMiles(totalDistance);
  const distanceScale = computedTotalMiles > 0 ? totalMiles / computedTotalMiles : 1;
  const legs = [];

  for (let index = 0; index < legCount; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const legMiles = metersToMiles(end.distance - start.distance) * distanceScale;
    const handoffStop = snapToTruckStop(end.point);

    const originLabel = index === 0
      ? normalizeLabel(origin.label, start.point)
      : legs[index - 1].destination.label;
    const destinationLabel = index === legCount - 1
      ? normalizeLabel(destination.label, end.point)
      : handoffStop.name;

    legs.push({
      sequence: index + 1,
      origin: { ...start.point, label: originLabel },
      destination: { ...end.point, label: destinationLabel },
      miles: roundMiles(legMiles),
      handoff_point: {
        name: handoffStop.name,
        lat: handoffStop.lat,
        lng: handoffStop.lng
      },
      status: 'OPEN'
    });
  }

  for (const leg of legs) {
    const originPoint = typeof leg.origin === 'string' ? JSON.parse(leg.origin) : leg.origin;
    const destPoint = typeof leg.destination === 'string' ? JSON.parse(leg.destination) : leg.destination;
    leg.origin_address = await reverseGeocode(originPoint.lat, originPoint.lng);
    leg.destination_address = await reverseGeocode(destPoint.lat, destPoint.lng);
  }

  return {
    totalMiles: roundMiles(totalMiles),
    legCount,
    legs
  };
};

module.exports = { segmentLoad };
