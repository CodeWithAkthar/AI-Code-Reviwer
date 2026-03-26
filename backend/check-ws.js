const WebSocket = require('ws');

// Connect to the backend
const ws = new WebSocket('ws://localhost:5000/ws');

ws.on('open', () => {
  console.log('Connected!');
  
  // We need a real JWT for this to work, but let's see why it fails
  // Since we don't know the user's secret, we will likely get a 1008
  ws.send(JSON.stringify({ type: 'auth', token: 'invalid_token' }));
});

ws.on('message', (msg) => {
  console.log('Message:', msg.toString());
});

ws.on('close', (code, reason) => {
  console.log('Closed:', code, reason.toString());
});

ws.on('error', (err) => {
  console.error('Error:', err.message);
});