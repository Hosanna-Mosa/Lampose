/* ══════════════════════════════════════════════════════════════════════════
   A rider paying their outstanding by UPI — riderRepayment.service.js.

   Razorpay's payment links are replaced with an in-memory stand-in, so a test
   can say "the rider paid" and see what the webhook, the app's status check
   and the sweep each make of it. Hermetic like doorstepCollection.test.js.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TWILIO_DELIVERY_REQUEST_CONTENT_SID', 'DELIVERY_PARTNER_WHATSAPP',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAYX_KEY_ID', 'RAZORPAYX_KEY_SECRET',
  'RAZORPAYX_WEBHOOK_SECRET', 'EXPO_ACCESS_TOKEN',
]) process.env[key] = '';
process.env.RAZORPAY_WEBHOOK_SECRET = 'repayment_test_secret';

const crypto = require('node:crypto');
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

const { withDatabase, race } = require('./helpers/db');
const createApp = require('../app');
const razorpay = require('../src/infrastructure/razorpay/razorpay');
const Driver = require('../src/modules/drivers/driver.model');
const RiderLedgerEntry = require('../src/modules/drivers/riderLedgerEntry.model');
const RiderLedgerSettings = require('../src/modules/drivers/riderLedgerSettings.model');
const RiderRepayment = require('../src/modules/drivers/riderRepayment.model');
const { signDriverToken } = require('../src/modules/drivers/driverAuth.middleware');
const ledger = require('../src/modules/drivers/riderLedger.service');
const repayments = require('../src/modules/drivers/riderRepayment.service');

withDatabase();

/* ── Razorpay payment links, in memory ────────────────────────────────── */

let links; // id -> { id, amount, notes, status, payments: [] }
let linkSeq;

const real = {
  isConfigured: razorpay.isConfigured,
  createPaymentLink: razorpay.createPaymentLink,
  fetchPaymentLink: razorpay.fetchPaymentLink,
  cancelPaymentLink: razorpay.cancelPaymentLink,
};

const fake = {
  isConfigured: () => true,
  createPaymentLink: async ({ amountPaise, notes }) => {
    linkSeq += 1;
    const id = `plink_TEST${linkSeq}`;
    links.set(id, {
      id, amount: amountPaise, notes, status: 'created', payments: [],
    });
    return { id, short_url: `https://rzp.io/l/${id}`, status: 'created' };
  },
  fetchPaymentLink: async (id) => {
    const link = links.get(id);
    return {
      id,
      status: link.status,
      amount_paid: link.payments.reduce((sum, p) => sum + p.amount, 0),
      payments: link.payments.map((p) => ({ payment_id: p.id, amount: p.amount, status: 'captured' })),
    };
  },
  cancelPaymentLink: async (id) => {
    const link = links.get(id);
    if (link.status !== 'created') return { id, status: 'not_cancellable' };
    link.status = 'cancelled';
    return { id, status: 'cancelled' };
  },
};

/** The rider pays in their UPI app. Refused, like the real thing, on a cancelled link. */
const riderPays = (linkId) => {
  const link = links.get(linkId);
  if (link.status !== 'created') return null;
  const payment = { id: `pay_TEST${linkId}`, amount: link.amount };
  link.payments.push(payment);
  link.status = 'paid';
  return payment;
};

let server;
let base;

before(async () => {
  Object.assign(razorpay, fake);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  Object.assign(razorpay, real);
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  links = new Map();
  linkSeq = 0;
});

const call = async (method, path, { token, body, headers = {} } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: typeof body === 'string' ? body : (body ? JSON.stringify(body) : undefined),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

const webhook = (event, payload) => {
  const raw = JSON.stringify({ event, payload });
  const signature = crypto.createHmac('sha256', 'repayment_test_secret').update(raw).digest('hex');
  return call('POST', '/api/v2/payments/razorpay/webhook', {
    body: raw, headers: { 'X-Razorpay-Signature': signature },
  });
};

/** Razorpay's `payment_link.paid` for one of our links. */
const linkPaidWebhook = (linkId) => {
  const link = links.get(linkId);
  const payment = link.payments[0];
  return webhook('payment_link.paid', {
    payment_link: { entity: { id: linkId, amount_paid: payment.amount, notes: link.notes } },
    payment: { entity: { id: payment.id, amount: payment.amount, notes: link.notes } },
  });
};

/* ── A rider who owes ₹470 ────────────────────────────────────────────── */

const RIDER = 'DRV-REPAY001';

const owing = async (outstandingPaise = 47000, { driverId = RIDER, phone = '+919333333301' } = {}) => {
  await RiderLedgerSettings.updateOne(
    { _id: 'rider_ledger' },
    { $set: { startedAt: new Date('2026-01-01T00:00:00Z') } },
    { upsert: true },
  );
  const rider = await Driver.create({
    driverId, phone, name: 'Repay Rider', status: 'approved',
  });
  await ledger.post(driverId, () => ({
    kind: 'opening', outstandingPaise, walletPaise: 0, key: `opening:${driverId}`,
  }));
  return signDriverToken(rider);
};

const pay = (token, body = {}) => call('POST', '/api/v2/drivers/me/repayments', { token, body });
const check = (token, id) => call('GET', `/api/v2/drivers/me/repayments/${id}`, { token });
const balance = (driverId = RIDER) => ledger.balanceFor(driverId);

/* ══════════════════════════════════════════════════════════════════════════ */

describe('starting a repayment', () => {
  it('makes a payment link for everything outstanding', async () => {
    const token = await owing(47000);
    const out = await pay(token);
    assert.equal(out.status, 201, JSON.stringify(out.body));
    assert.equal(out.body.data.amountPaise, 47000);
    assert.equal(out.body.data.status, 'created');
    assert.match(out.body.data.linkUrl, /^https:\/\/rzp\.io\/l\//);

    const link = [...links.values()][0];
    assert.equal(link.amount, 47000);
    assert.equal(link.notes.purpose, 'rider_repayment');
    assert.equal(link.notes.riderRepaymentId, out.body.data.repaymentId);
  });

  it('can pay part of it', async () => {
    const token = await owing(47000);
    const out = await pay(token, { amount: 200 });
    assert.equal(out.status, 201, JSON.stringify(out.body));
    assert.equal(out.body.data.amountPaise, 20000);
  });

  it('refuses more than is owed, and refuses when nothing is', async () => {
    const token = await owing(47000);
    const tooMuch = await pay(token, { amount: 500 });
    assert.equal(tooMuch.status, 409);
    assert.equal(tooMuch.body.code, 'MORE_THAN_OUTSTANDING');

    const clean = await owing(0, { driverId: 'DRV-REPAY002', phone: '+919333333302' });
    const nothing = await pay(clean);
    assert.equal(nothing.status, 409);
    assert.equal(nothing.body.code, 'NOTHING_OUTSTANDING');
  });

  it('refuses while the ledger is not open', async () => {
    const rider = await Driver.create({
      driverId: RIDER, phone: '+919333333301', name: 'Repay Rider', status: 'approved',
    });
    const out = await pay(signDriverToken(rider));
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'LEDGER_NOT_OPEN');
  });

  it('hands back the open link for the same amount, and cancels it for a different one', async () => {
    const token = await owing(47000);
    const first = (await pay(token)).body.data;
    const again = (await pay(token)).body.data;
    assert.equal(again.repaymentId, first.repaymentId, 'the same link, not a second one');
    assert.equal(links.size, 1);

    const smaller = (await pay(token, { amount: 100 })).body.data;
    assert.notEqual(smaller.repaymentId, first.repaymentId);
    assert.equal(links.get('plink_TEST1').status, 'cancelled');
    assert.equal((await RiderRepayment.findOne({ repaymentId: first.repaymentId })).status, 'superseded');
  });
});

describe('getting paid', () => {
  it('the webhook clears the outstanding, once, however often it is delivered', async () => {
    const token = await owing(47000);
    const started = (await pay(token)).body.data;
    riderPays('plink_TEST1');

    const hook = await linkPaidWebhook('plink_TEST1');
    assert.equal(hook.status, 200);
    assert.deepEqual(
      { w: (await balance()).walletPaise, o: (await balance()).outstandingPaise },
      { w: 0, o: 0 },
    );

    await linkPaidWebhook('plink_TEST1');
    await race(3, () => repayments.settleRepayment(started.repaymentId, { paymentId: 'pay_TESTplink_TEST1', amountPaise: 47000 }));
    assert.equal(await RiderLedgerEntry.countDocuments({ kind: 'repayment' }), 1);

    const row = await RiderRepayment.findOne({ repaymentId: started.repaymentId }).lean();
    assert.equal(row.status, 'paid');
    assert.equal(row.paidPaise, 47000);
    assert.ok(row.ledgerPostedAt);
  });

  it('the app\'s status check settles it when the webhook never comes', async () => {
    const token = await owing(47000);
    const started = (await pay(token)).body.data;
    riderPays('plink_TEST1');

    const out = await check(token, started.repaymentId);
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.equal(out.body.data.repayment.status, 'paid');
    assert.equal(out.body.data.wallet.outstandingPaise, 0);
  });

  it('puts anything paid beyond what is still owed into the wallet', async () => {
    const token = await owing(47000);
    const started = (await pay(token)).body.data;
    /* A delivery's auto-adjust brought the outstanding down to ₹400 meanwhile. */
    await ledger.post(RIDER, () => ({ kind: 'correction', outstandingPaise: -7000, note: 'test' }));
    riderPays('plink_TEST1');
    await repayments.settleRepayment(started.repaymentId, { paymentId: 'pay_x', amountPaise: 47000 });

    assert.deepEqual(
      { w: (await balance()).walletPaise, o: (await balance()).outstandingPaise },
      { w: 7000, o: 0 },
    );
  });

  it('another rider cannot read it', async () => {
    const token = await owing(47000);
    const started = (await pay(token)).body.data;
    const other = await owing(100, { driverId: 'DRV-REPAY003', phone: '+919333333303' });
    const out = await check(other, started.repaymentId);
    assert.equal(out.status, 404);
  });
});

describe('the sweep', () => {
  it('posts a paid repayment the ledger missed, and closes out an expired link', async () => {
    const token = await owing(47000);
    const started = (await pay(token)).body.data;
    await RiderRepayment.updateOne(
      { repaymentId: started.repaymentId },
      { $set: { status: 'paid', paidPaise: 47000, paidAt: new Date() } },
    );

    const other = await owing(30000, { driverId: 'DRV-REPAY004', phone: '+919333333304' });
    const lapsed = (await pay(other)).body.data;
    await RiderRepayment.updateOne({ repaymentId: lapsed.repaymentId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const out = await repayments.sweepRepayments();
    assert.equal(out.posted, 1);
    assert.equal(out.expired, 1);
    assert.equal((await balance()).outstandingPaise, 0);
    assert.equal((await RiderRepayment.findOne({ repaymentId: lapsed.repaymentId })).status, 'expired');
    assert.equal((await balance('DRV-REPAY004')).outstandingPaise, 30000, 'an unpaid link moves nothing');
  });

  it('settles an expired link that was paid with the webhook lost', async () => {
    const token = await owing(47000);
    const started = (await pay(token)).body.data;
    riderPays('plink_TEST1');
    await RiderRepayment.updateOne({ repaymentId: started.repaymentId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const out = await repayments.sweepRepayments();
    assert.equal(out.settled, 1);
    assert.equal((await balance()).outstandingPaise, 0);
  });
});
