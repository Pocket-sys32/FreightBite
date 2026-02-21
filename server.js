require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const express = require('express');
const http = require('http');
const { EventEmitter } = require('events');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./server/db');
const { segmentLoad } = require('./server/segmentLoad');
const { metersToMiles } = require('./server/geo');

// Route modules
const documentsRouter = require('./routes/documents');
const ratesRouter = require('./routes/rates');
const companiesRouter = require('./routes/companies');

// AI modules
const { generateMatchExplanation } = require('./lib/ai/match-explanation');
const { draftBrokerEmail } = require('./lib/ai/email-drafter');
const { getRecommendation } = require('./lib/ai/whats-next');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});
app.use(express.static('public'));

// API routes
app.use('/api/documents', documentsRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/companies', companiesRouter);

const signDriverToken = (driverId) => jwt.sign({ sub: driverId, role: 'DRIVER' }, JWT_SECRET, { expiresIn: '7d' });

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim();
};

async function getAuthenticatedDriver(req) {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.sub) {
      return null;
    }
    const driver = await db.getDriverById(payload.sub);
    return driver || null;
  } catch (error) {
    return null;
  }
}

// AI dispatcher endpoints
app.post('/api/auth/register-driver', async (req, res) => {
  const {
    name,
    email,
    password,
    currentLat,
    currentLng,
    homeLat,
    homeLng,
    hosRemainingHours
  } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  try {
    const existingAccount = await db.getAccountByEmail(email);
    if (existingAccount) {
      return res.status(409).json({ error: 'account already exists for this email' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const driver = await db.createDriver({
      name,
      email,
      current_lat: typeof currentLat === 'number' ? currentLat : null,
      current_lng: typeof currentLng === 'number' ? currentLng : null,
      hos_remaining_hours: typeof hosRemainingHours === 'number' ? hosRemainingHours : 8,
      home_lat: typeof homeLat === 'number' ? homeLat : null,
      home_lng: typeof homeLng === 'number' ? homeLng : null
    });

    await db.createAccount({
      driver_id: driver.id,
      email,
      password_hash: passwordHash
    });

    const token = signDriverToken(driver.id);
    return res.status(201).json({ token, driver });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'failed to create account' });
  }
});

app.post('/api/auth/login-driver', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const account = await db.getAccountByEmail(email);
    if (!account) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const ok = await bcrypt.compare(String(password), account.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const driver = await db.getDriverById(account.driver_id);
    if (!driver) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = signDriverToken(driver.id);
    return res.json({ token, driver });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'failed to login' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const driver = await getAuthenticatedDriver(req);
  if (!driver) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.json({ driver });
});

app.post('/api/auth/oauth-session', async (req, res) => {
  const { email, name, currentLat, currentLng, homeLat, homeLng } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  try {
    let driver = await db.getDriverByEmail(String(email));
    if (!driver) {
      driver = await db.createDriver({
        name: name || String(email).split('@')[0] || 'Driver',
        email,
        current_lat: typeof currentLat === 'number' ? currentLat : null,
        current_lng: typeof currentLng === 'number' ? currentLng : null,
        hos_remaining_hours: 8,
        home_lat: typeof homeLat === 'number' ? homeLat : null,
        home_lng: typeof homeLng === 'number' ? homeLng : null
      });
    }

    const token = signDriverToken(driver.id);
    return res.json({ token, driver });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'failed to create oauth session' });
  }
});

app.post('/api/ai/match-explanation', async (req, res) => {
  try {
    const { leg, driver } = req.body;
    if (!leg || !driver) return res.status(400).json({ error: 'leg and driver are required' });
    const explanation = await generateMatchExplanation({ leg, driver });
    res.json({ explanation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/draft-email', async (req, res) => {
  try {
    const { driver, broker } = req.body;
    if (!driver || !broker) return res.status(400).json({ error: 'driver and broker are required' });
    const email = await draftBrokerEmail({ driver, broker });
    res.json(email);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/whats-next', async (req, res) => {
  try {
    const { driver, nearbyLoads } = req.body;
    if (!driver) return res.status(400).json({ error: 'driver is required' });
    const recommendation = await getRecommendation({ driver, nearbyLoads: nearbyLoads || [] });
    res.json(recommendation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const legEvents = new EventEmitter();
const JWT_SECRET = process.env.JWT_SECRET || 'freightbite-dev-secret-change-me';

function emitLegUpdate(leg) {
  const payload = {
    legId: leg.id,
    loadId: leg.load_id || null,
    driverId: leg.driver_id || null,
    status: leg.status,
    updatedAt: new Date().toISOString()
  };

  legEvents.emit('leg.update', payload);
  io.emit('leg:update', payload);
  if (leg.status === 'COMPLETE') {
    io.emit('leg.completed', payload);
  }
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

/** POST /push-order — push a dummy order to all connected mobile clients */
app.post('/push-order', async (req, res) => {
  const dummyOrder = {
    id: `ORD-${Date.now()}`,
    status: 'pending',
    createdAt: new Date().toISOString(),
    items: [
      { sku: 'FB-001', name: 'Widget A', quantity: 2, unit: 'pallet' },
      { sku: 'FB-002', name: 'Widget B', quantity: 1, unit: 'case' }
    ],
    destination: { address: '123 Freight St', city: 'Logistics City', zip: '12345' },
    notes: 'Dummy order pushed from server'
  };

  const loadDestination = `${dummyOrder.destination.address}, ${dummyOrder.destination.city} ${dummyOrder.destination.zip}`;
  try {
    const load = await db.createLoad({
      origin: 'Warehouse A',
      destination: loadDestination,
      miles: 120,
      status: 'OPEN'
    });

    await db.createLegs([
      {
        load_id: load.id,
        sequence: 1,
        origin: 'Warehouse A',
        destination: loadDestination,
        miles: 120,
        handoff_point: 'Hub 1',
        rate_cents: 125000,
        status: 'OPEN'
      }
    ]);
  } catch (error) {
    console.error('Failed to persist dummy load:', error.message);
  }

  io.emit('order', dummyOrder);
  console.log('Pushed order to clients:', dummyOrder.id);

  res.json({ ok: true, orderId: dummyOrder.id });
});

// --- Relay Haul / FreightBite backend (from relay_haul_1day.md) ---

/** GET /api/loads — list loads (optional ?status=) */
app.get('/api/loads', async (req, res) => {
  try {
    const status = req.query.status ? normalizeStatus(req.query.status) : null;
    if (req.query.status && !status) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    const loads = await db.listLoads({ status, limit: req.query.limit });
    return res.json((loads || []).map(hydrateLoad));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list loads' });
  }
});

/** GET /api/loads/:id — load with legs */
app.get('/api/loads/:id', async (req, res) => {
  try {
    const load = await db.getLoadById(req.params.id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    const legs = await db.listLegsByLoad(load.id);
    return res.json({
      ...hydrateLoad(load),
      legs: (legs || []).map(hydrateLeg).sort((a, b) => a.sequence - b.sequence)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch load' });
  }
});

/** GET /api/legs — list legs (e.g. ?status=open for driver) */
app.get('/api/legs', async (req, res) => {
  try {
    const status = req.query.status ? normalizeStatus(req.query.status) : null;
    if (req.query.status && !status) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    const legs = await db.listLegs({
      status,
      loadId: req.query.loadId || req.query.load_id,
      driverId: req.query.driverId || req.query.driver_id,
      limit: req.query.limit
    });
    return res.json((legs || []).map(hydrateLeg));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list legs' });
  }
});

/** GET /api/drivers — list drivers */
app.get('/api/drivers', async (req, res) => {
  try {
    const drivers = await db.listDrivers({ limit: req.query.limit });
    return res.json(drivers || []);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list drivers' });
  }
});

/** GET /api/drivers/:id — get one driver */
app.get('/api/drivers/:id', async (req, res) => {
  try {
    const driver = await db.getDriverById(req.params.id);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    return res.json(driver);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch driver' });
  }
});

/** GET /api/drivers/:id/contacts — list contacts for driver */
app.get('/api/drivers/:id/contacts', async (req, res) => {
  try {
    const driver = await db.getDriverById(req.params.id);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const contacts = await db.listContactsByDriver(req.params.id);
    return res.json(contacts || []);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list contacts' });
  }
});

const isValidLocation = (location) =>
  location
  && typeof location.lat === 'number'
  && typeof location.lng === 'number';

const safeParseJson = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

const hydrateLoad = (load) => ({
  ...load,
  origin: safeParseJson(load.origin),
  destination: safeParseJson(load.destination)
});

const hydrateLeg = (leg) => ({
  ...leg,
  origin: safeParseJson(leg.origin),
  destination: safeParseJson(leg.destination),
  handoff_point: safeParseJson(leg.handoff_point)
});

const parseEventPayload = (event) => {
  if (!event) return event;
  const rawPayload = safeParseJson(event.payload);
  return {
    ...event,
    payload: rawPayload
  };
};

const toCoordinatePoint = (value, fallbackLabel = 'Unknown') => {
  const parsed = safeParseJson(value);
  if (parsed && typeof parsed === 'object' && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
    return {
      lat: parsed.lat,
      lng: parsed.lng,
      label: parsed.label || parsed.name || fallbackLabel
    };
  }
  return null;
};

const buildDirectionsUrl = (fromPoint, toPoint) =>
  `http://router.project-osrm.org/route/v1/driving/${fromPoint.lng},${fromPoint.lat};${toPoint.lng},${toPoint.lat}?overview=full&steps=true&geometries=geojson`;

async function fetchDirections(fromPoint, toPoint) {
  const response = await fetch(buildDirectionsUrl(fromPoint, toPoint));
  if (!response.ok) {
    throw new Error(`OSRM directions request failed (${response.status})`);
  }

  const payload = await response.json();
  const route = payload?.routes?.[0];
  if (!route) {
    throw new Error('OSRM returned no route for directions');
  }

  const legs = Array.isArray(route.legs) ? route.legs : [];
  const steps = [];
  for (const leg of legs) {
    for (const step of leg.steps || []) {
      steps.push({
        distanceMiles: Number(metersToMiles(step.distance || 0).toFixed(2)),
        durationMinutes: Number(((step.duration || 0) / 60).toFixed(1)),
        name: step.name || '',
        maneuver: step.maneuver?.type || 'turn',
        instruction: `${step.maneuver?.modifier || step.maneuver?.type || 'continue'} ${step.name || ''}`.trim(),
        location: step.maneuver?.location
          ? { lng: step.maneuver.location[0], lat: step.maneuver.location[1] }
          : null
      });
    }
  }

  return {
    distanceMiles: Number(metersToMiles(route.distance || 0).toFixed(2)),
    durationMinutes: Number(((route.duration || 0) / 60).toFixed(1)),
    geometry: route.geometry?.coordinates || [],
    steps
  };
}

async function buildLegWorkflow(leg) {
  const previousLeg = await db.getLegByLoadSequence(leg.load_id, leg.sequence - 1);
  const nextLeg = await db.getLegByLoadSequence(leg.load_id, leg.sequence + 1);
  const events = await db.listLegEventsByLeg(leg.id);
  const handoffs = await db.listHandoffsByLeg(leg.id);
  const latestEvent = events.length > 0 ? parseEventPayload(events[events.length - 1]) : null;

  let phase = 'UNASSIGNED';
  if (leg.status === 'OPEN') {
    phase = 'OPEN';
  } else if (latestEvent?.event_type) {
    phase = latestEvent.event_type;
  } else if (leg.status === 'IN_TRANSIT') {
    phase = 'ASSIGNED';
  } else if (leg.status === 'COMPLETE') {
    phase = 'HANDOFF_COMPLETE';
  }

  return {
    phase,
    latestEvent,
    events: events.map(parseEventPayload),
    previousLeg: previousLeg ? hydrateLeg(previousLeg) : null,
    nextLeg: nextLeg ? hydrateLeg(nextLeg) : null,
    handoffs: handoffs || []
  };
}

const VALID_STATUSES = new Set(['OPEN', 'IN_TRANSIT', 'COMPLETE']);
const normalizeStatus = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const upper = value.toUpperCase();
  if (upper === 'COMPLETED') {
    return 'COMPLETE';
  }

  return VALID_STATUSES.has(upper) ? upper : null;
};

/** POST /api/loads/submit — submit a load and segment into relay legs */
app.post('/api/loads/submit', async (req, res) => {
  const { origin, destination } = req.body || {};

  if (!isValidLocation(origin) || !isValidLocation(destination)) {
    return res.status(400).json({ error: 'origin and destination with lat/lng are required.' });
  }

  try {
    const { totalMiles, legs } = await segmentLoad(origin, destination);
    const loadRecord = await db.createLoad({
      origin: JSON.stringify(origin),
      destination: JSON.stringify(destination),
      miles: totalMiles,
      status: 'OPEN'
    });

    const legRecords = await db.createLegs(
      legs.map((leg) => ({
        load_id: loadRecord.id,
        sequence: leg.sequence,
        origin: JSON.stringify(leg.origin),
        destination: JSON.stringify(leg.destination),
        miles: leg.miles,
        handoff_point: JSON.stringify(leg.handoff_point),
        rate_cents: 0,
        status: leg.status,
        driver_id: null
      }))
    );

    const orderedLegs = (legRecords || []).sort((a, b) => a.sequence - b.sequence);

    return res.json({
      load: hydrateLoad(loadRecord),
      legs: orderedLegs.map(hydrateLeg)
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Failed to submit load.' });
  }
});

const resolveDriverId = async (req) => {
  if (req.body?.driverId || req.body?.driver_id) {
    return req.body?.driverId || req.body?.driver_id;
  }
  const authDriver = await getAuthenticatedDriver(req);
  return authDriver?.id || null;
};

/** GET /api/legs/:id/workflow — lifecycle + handoff linkage */
app.get('/api/legs/:id/workflow', async (req, res) => {
  try {
    const leg = await db.getLegById(req.params.id);
    if (!leg) {
      return res.status(404).json({ error: 'Leg not found' });
    }

    const workflow = await buildLegWorkflow(leg);
    return res.json({
      leg: hydrateLeg(leg),
      workflow
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch leg workflow', details: error.message });
  }
});

/** GET /api/legs/:id/directions — route from current driver location to leg destination */
app.get('/api/legs/:id/directions', async (req, res) => {
  try {
    const leg = await db.getLegById(req.params.id);
    if (!leg) {
      return res.status(404).json({ error: 'Leg not found' });
    }

    const driverId = req.query.driverId || req.query.driver_id || leg.driver_id;
    const driver = driverId ? await db.getDriverById(driverId) : null;
    const originPoint = toCoordinatePoint(leg.origin, 'Leg origin');
    const destinationPoint = toCoordinatePoint(leg.destination, 'Leg destination');
    if (!destinationPoint || !originPoint) {
      return res.status(400).json({ error: 'Leg does not contain route coordinates' });
    }

    const fromPoint = driver && typeof driver.current_lat === 'number' && typeof driver.current_lng === 'number'
      ? { lat: driver.current_lat, lng: driver.current_lng, label: driver.name || 'Current location' }
      : originPoint;

    const directions = await fetchDirections(fromPoint, destinationPoint);
    return res.json({
      legId: leg.id,
      from: fromPoint,
      to: destinationPoint,
      directions
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch directions', details: error.message });
  }
});

/** POST /api/legs/:id/accept — claim leg (handshake begins) */
app.post('/api/legs/:id/accept', async (req, res) => {
  const legId = req.params.id;
  const driverId = await resolveDriverId(req);

  if (!driverId) {
    return res.status(400).json({ error: 'Body must include driverId or use auth token' });
  }

  try {
    const leg = await db.getLegById(legId);
    if (!leg) {
      return res.status(404).json({ error: 'Leg not found' });
    }

    if (leg.status !== 'OPEN') {
      return res.status(409).json({ error: 'Leg is not open' });
    }

    const updatedLeg = await db.updateLegStatus(legId, 'IN_TRANSIT', driverId);
    await db.createLegEvent({
      leg_id: updatedLeg.id,
      load_id: updatedLeg.load_id,
      driver_id: driverId,
      event_type: 'ASSIGNED',
      payload: { note: 'Leg claimed by driver' }
    });

    const previousLeg = await db.getLegByLoadSequence(updatedLeg.load_id, updatedLeg.sequence - 1);
    if (previousLeg && previousLeg.driver_id) {
      const status = previousLeg.status === 'COMPLETE' ? 'READY' : 'PENDING';
      await db.upsertHandoff({
        load_id: updatedLeg.load_id,
        from_leg_id: previousLeg.id,
        to_leg_id: updatedLeg.id,
        from_driver_id: previousLeg.driver_id,
        to_driver_id: driverId,
        status
      });
    }

    emitLegUpdate(updatedLeg);
    const workflow = await buildLegWorkflow(updatedLeg);
    return res.json({ leg: hydrateLeg(updatedLeg), workflow });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to accept leg', details: error.message });
  }
});

/** POST /api/legs/:id/start-route — driver starts navigation */
app.post('/api/legs/:id/start-route', async (req, res) => {
  const legId = req.params.id;
  const driverId = await resolveDriverId(req);
  if (!driverId) {
    return res.status(400).json({ error: 'Body must include driverId or use auth token' });
  }

  try {
    const leg = await db.getLegById(legId);
    if (!leg) return res.status(404).json({ error: 'Leg not found' });
    if (leg.driver_id !== driverId) return res.status(403).json({ error: 'Driver does not own this leg' });
    if (leg.status !== 'IN_TRANSIT') return res.status(409).json({ error: 'Leg is not active' });

    const previousLeg = await db.getLegByLoadSequence(leg.load_id, leg.sequence - 1);
    if (previousLeg && previousLeg.status !== 'COMPLETE') {
      return res.status(409).json({ error: 'Cannot start route until previous handoff is complete' });
    }

    await db.createLegEvent({
      leg_id: leg.id,
      load_id: leg.load_id,
      driver_id: driverId,
      event_type: 'START_ROUTE',
      payload: { startedAt: new Date().toISOString() }
    });
    emitLegUpdate(leg);
    const workflow = await buildLegWorkflow(leg);
    return res.json({ leg: hydrateLeg(leg), workflow });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to start route', details: error.message });
  }
});

/** POST /api/legs/:id/arrive — driver arrived at destination/handoff */
app.post('/api/legs/:id/arrive', async (req, res) => {
  const legId = req.params.id;
  const driverId = await resolveDriverId(req);
  if (!driverId) {
    return res.status(400).json({ error: 'Body must include driverId or use auth token' });
  }

  try {
    const leg = await db.getLegById(legId);
    if (!leg) return res.status(404).json({ error: 'Leg not found' });
    if (leg.driver_id !== driverId) return res.status(403).json({ error: 'Driver does not own this leg' });
    if (leg.status !== 'IN_TRANSIT') return res.status(409).json({ error: 'Leg is not active' });

    await db.createLegEvent({
      leg_id: leg.id,
      load_id: leg.load_id,
      driver_id: driverId,
      event_type: 'ARRIVED',
      payload: { arrivedAt: new Date().toISOString() }
    });

    const nextLeg = await db.getLegByLoadSequence(leg.load_id, leg.sequence + 1);
    if (nextLeg && nextLeg.driver_id) {
      await db.upsertHandoff({
        load_id: leg.load_id,
        from_leg_id: leg.id,
        to_leg_id: nextLeg.id,
        from_driver_id: driverId,
        to_driver_id: nextLeg.driver_id,
        status: 'READY'
      });
      await db.createLegEvent({
        leg_id: nextLeg.id,
        load_id: nextLeg.load_id,
        driver_id: nextLeg.driver_id,
        event_type: 'HANDOFF_READY',
        payload: { fromLegId: leg.id, fromDriverId: driverId }
      });
      emitLegUpdate(nextLeg);
    }

    emitLegUpdate(leg);
    const workflow = await buildLegWorkflow(leg);
    return res.json({ leg: hydrateLeg(leg), workflow });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark arrival', details: error.message });
  }
});

async function finishHandoff(req, res) {
  const legId = req.params.id;
  const driverId = await resolveDriverId(req);
  if (!driverId) {
    return res.status(400).json({ error: 'Body must include driverId or use auth token' });
  }

  try {
    const leg = await db.getLegById(legId);
    if (!leg) return res.status(404).json({ error: 'Leg not found' });
    if (leg.driver_id !== driverId) return res.status(403).json({ error: 'Driver does not own this leg' });
    if (leg.status !== 'IN_TRANSIT') return res.status(409).json({ error: 'Leg is not active' });

    const completedLeg = await db.updateLegStatus(legId, 'COMPLETE');
    await db.createLegEvent({
      leg_id: completedLeg.id,
      load_id: completedLeg.load_id,
      driver_id: driverId,
      event_type: 'HANDOFF_COMPLETE',
      payload: { completedAt: new Date().toISOString() }
    });

    let autoStartedNextLeg = null;
    const nextLeg = await db.getLegByLoadSequence(completedLeg.load_id, completedLeg.sequence + 1);
    if (nextLeg && nextLeg.driver_id) {
      await db.upsertHandoff({
        load_id: completedLeg.load_id,
        from_leg_id: completedLeg.id,
        to_leg_id: nextLeg.id,
        from_driver_id: driverId,
        to_driver_id: nextLeg.driver_id,
        status: 'COMPLETE'
      });

      if (nextLeg.status === 'IN_TRANSIT') {
        await db.createLegEvent({
          leg_id: nextLeg.id,
          load_id: nextLeg.load_id,
          driver_id: nextLeg.driver_id,
          event_type: 'AUTO_START_ROUTE',
          payload: { triggeredByLegId: completedLeg.id }
        });
        autoStartedNextLeg = nextLeg;
      }
    }

    emitLegUpdate(completedLeg);
    if (autoStartedNextLeg) emitLegUpdate(autoStartedNextLeg);
    const workflow = await buildLegWorkflow(completedLeg);
    return res.json({
      leg: hydrateLeg(completedLeg),
      workflow,
      autoStartedNextLeg: autoStartedNextLeg ? hydrateLeg(autoStartedNextLeg) : null
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to finish handoff', details: error.message });
  }
}

/** POST /api/legs/:id/handoff — complete handoff and finish leg */
app.post('/api/legs/:id/handoff', finishHandoff);

/** POST /api/legs/:id/complete — backward-compatible alias */
app.post('/api/legs/:id/complete', finishHandoff);

legEvents.on('leg.update', (payload) => {
  console.log('Leg update event:', payload.legId, payload.status);
});

async function ensureDemoData() {
  try {
    const existingDriver = await db.getDriverById('drv_demo_1');
    const demoDriver = existingDriver || await db.createDriver({
      id: 'drv_demo_1',
      name: 'Alex Rivera',
      email: 'alex.rivera@example.com',
      current_lat: 41.8781,
      current_lng: -87.6298,
      hos_remaining_hours: 8.5,
      home_lat: 39.7392,
      home_lng: -104.9903
    });

    const existingAccount = await db.getAccountByEmail('alex.rivera@example.com');
    if (!existingAccount) {
      const passwordHash = await bcrypt.hash('demo12345', 10);
      await db.createAccount({
        driver_id: demoDriver.id,
        email: 'alex.rivera@example.com',
        password_hash: passwordHash
      });
    }

    const existingContacts = await db.listContactsByDriver(demoDriver.id);
    if (!existingContacts || existingContacts.length === 0) {
      await db.createContact({
        id: 'contact_demo_1',
        driver_id: demoDriver.id,
        broker_name: 'Midwest Freight Co',
        broker_email: 'dispatch@midwestfreight.example',
        last_worked_together: '2026-01-15'
      });
    }

    console.log('Seeded demo driver/contact/account for local development');
  } catch (error) {
    console.error('Failed to seed demo data:', error.message);
  }
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Socket.io ready for mobile clients');
  console.log(`Trigger push: POST http://localhost:${PORT}/push-order or run: npm run push-order`);
  void ensureDemoData();
});
