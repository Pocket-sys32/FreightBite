const { TRUCK_STOPS } = require('./truckStops');
const { haversineMeters, metersToMiles, roundMiles } = require('./geo');

const buildOsrmUrl = (origin, destination) => {
  const originPart = `${origin.lng},${origin.lat}`;
  const destinationPart = `${destination.lng},${destination.lat}`;
  return `http://router.project-osrm.org/route/v1/driving/${originPart};${destinationPart}?overview=full&steps=true&geometries=geojson`;
};

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
  const totalMiles = metersToMiles(route.distance);
  const legCount = Math.max(1, Math.ceil(totalMiles / 450));
  const coordinates = route.geometry.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    const error = new Error('OSRM route geometry was invalid.');
    error.statusCode = 502;
    throw error;
  }

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

  return {
    totalMiles: roundMiles(totalMiles),
    legCount,
    legs
  };
};

module.exports = { segmentLoad };
