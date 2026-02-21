/**
 * OSRM-based load segmentation into HOS-legal relay legs.
 * Snaps handoff points to nearest truck stops.
 */

const METERS_TO_MILES = 0.000621371;
const MILES_PER_LEG_TARGET = 450; // ~11hr at 50mph

// Major truck stops (demo corridors: I-80, I-55, I-40, etc.)
const TRUCK_STOPS = [
  { name: 'Pilot - Joliet IL', lat: 41.52, lng: -88.08 },
  { name: 'Flying J - Iowa City IA', lat: 41.66, lng: -91.53 },
  { name: 'Love\'s - North Platte NE', lat: 41.12, lng: -100.76 },
  { name: 'Pilot - Green River WY', lat: 41.52, lng: -109.46 },
  { name: 'Flying J - Barstow CA', lat: 34.89, lng: -117.02 },
  { name: 'TA - Gary IN', lat: 41.6, lng: -87.34 },
  { name: 'Pilot - Council Bluffs IA', lat: 41.26, lng: -95.86 },
  { name: 'Love\'s - Cheyenne WY', lat: 41.14, lng: -104.82 },
  { name: 'Flying J - Salt Lake City UT', lat: 40.72, lng: -111.99 },
  { name: 'Pilot - San Bernardino CA', lat: 34.1, lng: -117.29 },
  { name: 'Love\'s - Amarillo TX', lat: 35.2, lng: -101.83 },
  { name: 'TA - Oklahoma City OK', lat: 35.47, lng: -97.52 },
  { name: 'Pilot - Little Rock AR', lat: 34.75, lng: -92.29 },
  { name: 'Flying J - Memphis TN', lat: 35.1, lng: -89.98 },
  { name: 'Love\'s - Nashville TN', lat: 36.16, lng: -86.78 },
  { name: 'Pilot - Atlanta GA', lat: 33.65, lng: -84.42 },
  { name: 'TA - Dallas TX', lat: 32.78, lng: -96.8 },
  { name: 'Flying J - Phoenix AZ', lat: 33.45, lng: -112.07 },
  { name: 'Love\'s - Albuquerque NM', lat: 35.08, lng: -106.65 },
  { name: 'Pilot - Denver CO', lat: 39.74, lng: -104.99 },
];

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3959; // earth radius miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function nearestTruckStop(lat, lng) {
  let best = TRUCK_STOPS[0];
  let bestDist = haversineMiles(lat, lng, best.lat, best.lng);
  for (const stop of TRUCK_STOPS) {
    const d = haversineMiles(lat, lng, stop.lat, stop.lng);
    if (d < bestDist) {
      bestDist = d;
      best = stop;
    }
  }
  return best;
}

function distanceAlongCoords(coords, startIdx, endIdx) {
  let miles = 0;
  for (let i = startIdx; i < endIdx && i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    miles += haversineMiles(lat1, lng1, lat2, lng2);
  }
  return miles;
}

/**
 * Fetch route from OSRM and segment into legs with truck-stop handoffs.
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {Promise<{ totalMiles: number, legs: Array<{ sequence: number, origin: string, destination: string, originLat: number, originLng: number, destinationLat: number, destinationLng: number, miles: number, handoff_point: string }> }>}
 */
async function segmentLoad(origin, destination) {
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `http://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM request failed: ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('OSRM no route found');

  const route = data.routes[0];
  const totalMeters = route.distance;
  const totalMiles = totalMeters * METERS_TO_MILES;
  const numLegs = Math.max(1, Math.ceil(totalMiles / MILES_PER_LEG_TARGET));
  const coordsList = route.geometry?.coordinates || [];
  if (coordsList.length < 2) throw new Error('OSRM route has no geometry');

  const n = coordsList.length;
  const legs = [];
  const milesPerLeg = totalMiles / numLegs;
  let accumulatedMiles = 0;
  let prevHandoff = { name: 'Origin', lat: origin.lat, lng: origin.lng };

  for (let i = 0; i < numLegs; i++) {
    const isLast = i === numLegs - 1;
    const startIdx = Math.floor((i / numLegs) * n);
    const endIdx = isLast ? n - 1 : Math.floor(((i + 1) / numLegs) * n);
    const segMiles = distanceAlongCoords(coordsList, startIdx, endIdx);
    accumulatedMiles += segMiles;

    const endCoord = coordsList[endIdx];
    const [endLng, endLat] = endCoord;
    const handoff = nearestTruckStop(endLat, endLng);

    legs.push({
      sequence: i + 1,
      origin: prevHandoff.name,
      destination: isLast ? 'Destination' : handoff.name,
      originLat: prevHandoff.lat,
      originLng: prevHandoff.lng,
      destinationLat: handoff.lat,
      destinationLng: handoff.lng,
      miles: Math.round(segMiles * 10) / 10,
      handoff_point: isLast ? null : handoff.name,
    });
    prevHandoff = handoff;
  }

  return { totalMiles: Math.round(totalMiles * 10) / 10, legs };
}

module.exports = { segmentLoad };
