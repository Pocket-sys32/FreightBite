require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

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

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Socket.io ready for mobile clients');
  console.log(`Trigger push: POST http://localhost:${PORT}/push-order or run: npm run push-order`);
});
