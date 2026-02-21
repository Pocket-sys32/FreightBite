const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.json());
app.use(express.static('public'));

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
