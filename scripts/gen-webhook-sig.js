/**
 * Webhook Signature Generator — Development helper
 *
 * Generates the correct x-hub-signature-256 header value for any body,
 * using the GITHUB_WEBHOOK_SECRET from your .env file.
 *
 * Usage:
 *   node scripts/gen-webhook-sig.js
 *
 * Copy the output signature into Postman's x-hub-signature-256 header.
 */

require('dotenv').config();
const crypto = require('crypto');

const secret = process.env.GITHUB_WEBHOOK_SECRET;
if (!secret) {
  console.error('ERROR: GITHUB_WEBHOOK_SECRET not set in .env');
  process.exit(1);
}

// Test payloads — edit these to match your Postman body
const payloads = {
  'PR Opened (request 01)': {
    action: 'opened',
    number: 42,
    pull_request: { number: 42 },
    repository: { full_name: 'testuser/my-repo' },
    installation: { id: 99999 },
    sender: { login: 'testuser' },
  },
  'PR Synchronize (request 02)': {
    action: 'synchronize',
    number: 7,
    pull_request: { number: 7 },
    repository: { full_name: 'testuser/my-repo' },
    installation: { id: 99999 },
    sender: { login: 'testuser' },
  },
  'Push event (request 04)': {
    ref: 'refs/heads/main',
    repository: { full_name: 'testuser/my-repo' },
    sender: { login: 'testuser' },
  },
  'PR Closed (request 05)': {
    action: 'closed',
    number: 5,
    pull_request: { number: 5 },
    repository: { full_name: 'testuser/my-repo' },
    installation: { id: 99999 },
    sender: { login: 'testuser' },
  },
};

console.log('='.repeat(70));
console.log('WEBHOOK SIGNATURE GENERATOR');
console.log('Copy the signature for your Postman request');
console.log('='.repeat(70));
console.log();

for (const [name, payload] of Object.entries(payloads)) {
  // JSON.stringify with NO spaces — minified, matches the Postman body
  const body = JSON.stringify(payload);
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

  console.log(`[ ${name} ]`);
  console.log(`Body (paste into Postman Body tab > Raw):`);
  console.log(body);
  console.log();
  console.log(`x-hub-signature-256:`);
  console.log(sig);
  console.log('-'.repeat(70));
  console.log();
}
