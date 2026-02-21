#!/usr/bin/env node
/**
 * Pushes a dummy order to all connected Socket.io clients.
 * Run with: npm run push-order
 * (Server must be running: npm start)
 */

const http = require('http');

const PORT = process.env.PORT || 3000;

const req = http.request(
  {
    hostname: 'localhost',
    port: PORT,
    path: '/push-order',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  },
  (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      if (res.statusCode === 200) {
        const data = JSON.parse(body);
        console.log('Pushed dummy order:', data.orderId);
      } else {
        console.error('Push failed:', res.statusCode, body);
      }
    });
  }
);

req.on('error', (err) => {
  console.error('Error:', err.message);
  console.error('Is the server running? Try: npm start');
  process.exit(1);
});

req.end();
