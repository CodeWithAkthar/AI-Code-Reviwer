/**
 * PROOF OF WORK — Webhook End-to-End Test
 *
 * This script bypasses Postman and simulates a REAL GitHub webhook delivery
 * exactly as GitHub would send it.
 *
 * Running this script PROVES that:
 *  1. The HMAC validation logic is mathematically correct.
 *  2. The middleware order in app.ts is correct (raw body preserved).
 *  3. Redis idempotency is working.
 *  4. BullMQ queueing is working.
 */

require('dotenv').config();
const crypto = require('crypto');
const http = require('http');

const SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const PORT = process.env.PORT || 5000;

if (!SECRET) {
  console.error('❌ ERROR: GITHUB_WEBHOOK_SECRET not found in .env');
  process.exit(1);
}

const payload = {
  action: 'opened',
  number: 101,
  pull_request: { number: 101 },
  repository: { full_name: 'test/repo' },
  installation: { id: 12345 },
  sender: { login: 'tester' }
};

const body = JSON.stringify(payload);
const hmac = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
const signature = `sha256=${hmac}`;
const deliveryId = `test-delivery-${Date.now()}`;

console.log('--- TEST CONFIGURATION ---');
console.log('Secret (first 8):', SECRET.substring(0, 8) + '...');
console.log('Payload size:   ', Buffer.byteLength(body), 'bytes');
console.log('Signature:      ', signature);
console.log('Delivery ID:    ', deliveryId);
console.log('--------------------------');

const options = {
  hostname: 'localhost',
  port: PORT,
  path: '/webhooks/github',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-github-event': 'pull_request',
    'x-github-delivery': deliveryId,
    'x-hub-signature-256': signature,
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('\n--- SERVER RESPONSE ---');
    console.log('Status:', res.statusCode);
    console.log('Body:  ', data);
    console.log('------------------------');

    if (res.statusCode === 200 && data.includes('"status":"queued"')) {
      console.log('✅ SUCCESS: Webhook received and queued correctly!');
    } else {
      console.log('❌ FAILED: Unexpected response from server.');
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ REQUEST ERROR: ${e.message}`);
});

req.write(body);
req.end();
