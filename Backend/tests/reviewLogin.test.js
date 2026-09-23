/* ══════════════════════════════════════════════════════════════════════════
   The User App's store-review sign-in (`config.auth.reviewLogin`).

     · The review number gets NO SMS, and its fixed code signs in to a real
       account with a real token.
     · A wrong code on it is still wrong — the attempt counter applies.
     · Every other number is untouched: a real SMS, a random code.

   The environment is set before the app is required, because `config/env.js`
   reads it once at load.
   ══════════════════════════════════════════════════════════════════════════ */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-review-login';
process.env.REVIEW_LOGIN_PHONE = '9998887456';
process.env.REVIEW_LOGIN_OTP = '665544';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const sms = require('../src/infrastructure/sms/sms');

/* The controller destructures the gateway at load, so the stand-in has to be
   in place before it is required. */
const outbox = [];
sms.smsConfigProblem = () => null;
sms.sendOtpSms = async (phone, otp) => {
  outbox.push({ phone, otp });
  return { success: true, campId: 'CAMP-TEST' };
};

const createApp = require('../app');

withDatabase();

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const post = async (path, body) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

describe('the review number', () => {
  it('sends no SMS and signs in with the fixed code', async () => {
    const started = await post('/api/v2/customers/auth/start', { phone: '9998887456' });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal(outbox.length, 0, 'no SMS for the review number');

    const verified = await post('/api/v2/customers/auth/verify', { phone: '9998887456', otp: '665544' });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.ok(verified.body.data.token, 'a real session token');
  });

  it('can start again straight away, and a wrong code is still wrong', async () => {
    const again = await post('/api/v2/customers/auth/start', { phone: '9998887456' });
    assert.equal(again.status, 200, 'no cooldown for the review number');

    const wrong = await post('/api/v2/customers/auth/verify', { phone: '9998887456', otp: '123456' });
    assert.equal(wrong.status, 400);
  });

  it('leaves every other number on a real SMS', async () => {
    const started = await post('/api/v2/customers/auth/start', { phone: '9876501234' });
    assert.equal(started.status, 200);
    assert.equal(outbox.length, 1);
    assert.notEqual(outbox[0].otp, '665544');
  });
});
