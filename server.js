require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const express = require('express');
const http = require('http');
const { EventEmitter } = require('events');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const db = require('./server/db');
const { segmentLoad } = require('./server/segmentLoad');

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
app.use(express.static('public'));

// API routes
app.use('/api/documents', documentsRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/companies', companiesRouter);

// AI dispatcher endpoints
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

function emitLegCompleted(leg) {
  const payload = {
    legId: leg.id,
    driverId: leg.driver_id || null,
    status: leg.status
  };

  legEvents.emit('leg.completed', payload);
  io.emit('leg.completed', payload);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

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
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  let q = supabase.from('loads').select('*').order('created_at', { ascending: false });
  if (req.query.status) q = q.eq('status', req.query.status);
  const { data, error } = await q.limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

/** GET /api/loads/:id — load with legs */
app.get('/api/loads/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  const { data: load, error: loadErr } = await supabase.from('loads').select('*').eq('id', req.params.id).single();
  if (loadErr || !load) return res.status(404).json({ error: 'Load not found' });
  const { data: legs } = await supabase.from('legs').select('*').eq('load_id', load.id).order('sequence');
  res.json({ ...load, legs: legs || [] });
});

/** GET /api/legs — list legs (e.g. ?status=open for driver) */
app.get('/api/legs', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  let q = supabase.from('legs').select('*, loads(origin, destination, miles)').order('sequence');
  if (req.query.status) q = q.eq('status', req.query.status);
  const { data, error } = await q.limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
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

    return res.json({
      load: hydrateLoad(loadRecord),
      legs: legRecords.map(hydrateLeg)
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Failed to submit load.' });
  }
});

/** POST /api/legs/:id/accept — driver accepts leg, status = IN_TRANSIT */
app.post('/api/legs/:id/accept', async (req, res) => {
  const legId = req.params.id;
  const driverId = req.body?.driverId || req.body?.driver_id;

  if (!driverId) {
    return res.status(400).json({ error: 'Body must include driverId' });
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
    return res.json(updatedLeg);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to accept leg', details: error.message });
  }
});

/** POST /api/legs/:id/complete — driver completes leg */
app.post('/api/legs/:id/complete', async (req, res) => {
  const legId = req.params.id;
  const driverId = req.body?.driverId || req.body?.driver_id;

  if (!driverId) {
    return res.status(400).json({ error: 'Body must include driverId' });
  }

  try {
    const leg = await db.getLegById(legId);
    if (!leg) {
      return res.status(404).json({ error: 'Leg not found' });
    }

    if (leg.driver_id !== driverId) {
      return res.status(403).json({ error: 'Driver does not own this leg' });
    }

    if (leg.status !== 'IN_TRANSIT') {
      return res.status(409).json({ error: 'Leg is not in transit' });
    }

    const updatedLeg = await db.updateLegStatus(legId, 'COMPLETE');
    emitLegCompleted(updatedLeg);
    return res.json(updatedLeg);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to complete leg', details: error.message });
  }
});

legEvents.on('leg.completed', (payload) => {
  console.log('Leg completed event:', payload.legId);
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Socket.io ready for mobile clients');
  console.log(`Trigger push: POST http://localhost:${PORT}/push-order or run: npm run push-order`);
});
