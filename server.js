require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const { segmentLoad } = require('./services/segmentLoad');

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
app.post('/push-order', (req, res) => {
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

/** POST /api/loads/submit — origin + destination, OSRM segment into legs, save to Supabase */
app.post('/api/loads/submit', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase not configured (set .env.local)' });
  }
  const { origin, destination } = req.body || {};
  if (!origin?.lat || origin?.lng === undefined || !destination?.lat || destination?.lng === undefined) {
    return res.status(400).json({ error: 'Body must include origin: { lat, lng } and destination: { lat, lng }' });
  }
  try {
    const { totalMiles, legs } = await segmentLoad(
      { lat: Number(origin.lat), lng: Number(origin.lng) },
      { lat: Number(destination.lat), lng: Number(destination.lng) }
    );
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    const { data: load, error: loadErr } = await supabase
      .from('loads')
      .insert({
        origin: firstLeg.origin,
        destination: lastLeg.destination,
        miles: totalMiles,
        status: 'pending'
      })
      .select('id')
      .single();
    if (loadErr) {
      return res.status(500).json({ error: 'Failed to create load', details: loadErr.message });
    }
    const legRows = legs.map((leg) => ({
      load_id: load.id,
      sequence: leg.sequence,
      origin: leg.origin,
      destination: leg.destination,
      miles: leg.miles,
      handoff_point: leg.handoff_point,
      rate_cents: Math.round(leg.miles * 200),
      status: 'open'
    }));
    const { error: legsErr } = await supabase.from('legs').insert(legRows);
    if (legsErr) {
      return res.status(500).json({ error: 'Failed to create legs', details: legsErr.message });
    }
    const { data: createdLegs } = await supabase
      .from('legs')
      .select('id, sequence, origin, destination, miles, handoff_point, status')
      .eq('load_id', load.id)
      .order('sequence');
    res.status(201).json({
      load: { id: load.id, origin: firstLeg.origin, destination: lastLeg.destination, miles: totalMiles, status: 'pending' },
      legs: createdLegs || legRows
    });
  } catch (err) {
    console.error('segmentLoad error', err);
    res.status(500).json({ error: err.message || 'Segmentation failed' });
  }
});

/** POST /api/legs/:id/accept — driver accepts leg, status = in_transit */
app.post('/api/legs/:id/accept', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  const legId = req.params.id;
  const driverId = req.body?.driver_id;
  if (!driverId) return res.status(400).json({ error: 'Body must include driver_id' });
  const { data, error } = await supabase
    .from('legs')
    .update({ status: 'in_transit', driver_id: driverId })
    .eq('id', legId)
    .eq('status', 'open')
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Leg not found or already assigned' });
  res.json(data);
});

/** POST /api/legs/:id/complete — handoff done */
app.post('/api/legs/:id/complete', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  const legId = req.params.id;
  const { data, error } = await supabase
    .from('legs')
    .update({ status: 'completed' })
    .eq('id', legId)
    .in('status', ['open', 'in_transit'])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Leg not found or already completed' });
  res.json(data);
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Socket.io ready for mobile clients');
  console.log(`Trigger push: POST http://localhost:${PORT}/push-order or run: npm run push-order`);
});
