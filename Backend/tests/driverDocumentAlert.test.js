/* ══════════════════════════════════════════════════════════════════════════
   An administrator sends a rider's document back — and the rider is told.

   Played through the real app and the real database. The WhatsApp sender is
   replaced with a recorder, so a test can say exactly what the rider would
   have been sent, and make it fail on demand.

   Hermetic the same two ways as the other food and rider files: credentials
   blanked before anything is required, and every outbound request that is not
   to this machine blocked.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_DRIVER_DOCUMENT_CONTENT_SID',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL', 'EXPO_ACCESS_TOKEN',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
]) process.env[key] = '';

const http = require('node:http');
const https = require('node:https');

const isLocal = (host) => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host || ''));
const hostOf = (target) => {
  if (typeof target === 'string') return new URL(target).hostname;
  if (target instanceof URL) return target.hostname;
  return (target && (target.hostname || target.host)) || '';
};
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if (!isLocal(hostOf(url))) throw new Error(`Blocked an outbound request in a test: ${url}`);
  return realFetch(input, init);
};
for (const mod of [http, https]) {
  for (const name of ['request', 'get']) {
    const real = mod[name];
    mod[name] = (target, ...rest) => {
      if (!isLocal(hostOf(target))) throw new Error(`Blocked an outbound request in a test: ${hostOf(target)}`);
      return real.call(mod, target, ...rest);
    };
  }
}

const {
  describe, it, before, after, beforeEach,
} = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const twilio = require('../src/infrastructure/twilio/twilio');
const template = require('../src/infrastructure/twilio/driverDocumentTemplate');
const Admin = require('../src/modules/admins/admin.model');
const { signAdminToken } = require('../src/modules/admins/adminToken');
const Driver = require('../src/modules/drivers/driver.model');

withDatabase();

let server;
let base;
let sent;
let outcome;
const realSender = twilio.sendDriverDocumentRejected;

before(async () => {
  twilio.sendDriverDocumentRejected = async (args) => {
    sent.push(args);
    if (outcome === 'throw') throw new Error('Twilio exploded');
    return outcome;
  };
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  twilio.sendDriverDocumentRejected = realSender;
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  sent = [];
  outcome = { success: true, messageSid: 'SMTEST0001' };
});

const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

/* The notifier is fired and not awaited by the handler — give it a moment. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 50); });

const approver = async () => signAdminToken(await Admin.create({
  name: 'Food Admin Person', email: 'food.admin@lampose.test', password: 'a-good-password-1', role: 'Food Admin',
}));

const applicant = () => Driver.create({
  driverId: 'DRV-DOCS0001',
  phone: '+919444444444',
  name: 'Ravi Kumar',
  status: 'pending',
  documents: [{
    kind: 'licence', number: 'AP0120230001234', frontUrl: 'https://example.invalid/licence-front.jpg', status: 'pending',
  }],
});

const decide = (token, body) => call('PATCH', '/api/v1/admin/drivers/DRV-DOCS0001/documents/licence', { token, body });

describe('sending a document back', () => {
  it('messages the rider on WhatsApp with the document and the approver\'s own reason', async () => {
    await applicant();
    const out = await decide(await approver(), { status: 'rejected', reason: 'Photo is blurry — the text cannot be read' });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    await settle();

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], {
      riderPhone: '+919444444444',
      riderName: 'Ravi Kumar',
      documentLabel: 'Driving licence',
      reason: 'Photo is blurry — the text cannot be read',
    });
  });

  it('leaves the account pending and the document refused, with the reason the app shows', async () => {
    await applicant();
    await decide(await approver(), { status: 'rejected', reason: 'Edges are cut off' });
    const row = await Driver.findOne({ driverId: 'DRV-DOCS0001' }).lean();
    assert.equal(row.status, 'pending');
    assert.equal(row.documents[0].status, 'rejected');
    assert.equal(row.documents[0].reason, 'Edges are cut off');
  });

  it('sends nothing when the document is verified', async () => {
    await applicant();
    const out = await decide(await approver(), { status: 'verified' });
    assert.equal(out.status, 200);
    await settle();
    assert.equal(sent.length, 0);
  });

  it('sends nothing, and changes nothing, on a refusal with no reason', async () => {
    await applicant();
    const out = await decide(await approver(), { status: 'rejected', reason: '  ' });
    assert.equal(out.status, 400);
    assert.equal(out.body.code, 'REASON_REQUIRED');
    await settle();
    assert.equal(sent.length, 0);
    assert.equal((await Driver.findOne({ driverId: 'DRV-DOCS0001' }).lean()).documents[0].status, 'pending');
  });

  it('still saves the decision when WhatsApp fails', async () => {
    await applicant();
    outcome = 'throw';
    const out = await decide(await approver(), { status: 'rejected', reason: 'Glare or reflection' });
    assert.equal(out.status, 200);
    await settle();
    assert.equal((await Driver.findOne({ driverId: 'DRV-DOCS0001' }).lean()).documents[0].status, 'rejected');
  });
});

describe('the WhatsApp template', () => {
  it('has three variables, none first, last or adjacent — Meta\'s rules', () => {
    assert.deepEqual(template.variableKeys(), ['1', '2', '3']);
    assert.ok(!/^\s*\{\{/.test(template.BODY), 'no variable first');
    assert.ok(!/\}\}\W*$/.test(template.BODY), 'no variable last');
    assert.ok(!/\}\}\s*\{\{/.test(template.BODY), 'no two variables adjacent');
  });

  it('says nothing about signing in, which Meta reads as authentication', () => {
    assert.ok(!/sign.?in|password|log.?in|details/i.test(template.BODY));
  });
});
