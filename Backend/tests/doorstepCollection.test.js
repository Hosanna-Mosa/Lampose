/* ══════════════════════════════════════════════════════════════════════════
   Collecting a cash-on-delivery order at the door — cash, or UPI on a QR.

   Played through the real app and the real database. Razorpay is replaced
   with an in-memory stand-in that keeps QR codes and the payments made on
   them, so a test can say "the diner scanned and paid" and see what every
   path — the rider's poll, the delivered check, the webhook — makes of it.

   Hermetic the same two ways `foodDelivery.test.js` is: credentials blanked
   before anything is required, and every outbound request that is not to
   this machine blocked. The webhook secret is set to a test value so the
   webhook tests can sign their own bodies.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TWILIO_DELIVERY_REQUEST_CONTENT_SID', 'DELIVERY_PARTNER_WHATSAPP',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAYX_KEY_ID', 'RAZORPAYX_KEY_SECRET',
  'RAZORPAYX_WEBHOOK_SECRET', 'EXPO_ACCESS_TOKEN',
]) process.env[key] = '';
process.env.RAZORPAY_WEBHOOK_SECRET = 'doorstep_test_secret';

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

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const razorpay = require('../src/infrastructure/razorpay/razorpay');
const config = require('../src/config/env');
const Admin = require('../src/modules/admins/admin.model');
const { signAdminToken } = require('../src/modules/admins/adminToken');
const Customer = require('../src/modules/customers/customer.model');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
const Driver = require('../src/modules/drivers/driver.model');
const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
const { signDriverToken } = require('../src/modules/drivers/driverAuth.middleware');
const dispatch = require('../src/modules/drivers/foodDispatch.service');

withDatabase();

let server;
let base;

/* ── Razorpay, in memory ──────────────────────────────────────────────── */

let qrs;        // id -> { id, amount, notes, closed, payments: [] }
let qrSeq;
let razorpayDown;

const real = {
  isConfigured: razorpay.isConfigured,
  createQrCode: razorpay.createQrCode,
  closeQrCode: razorpay.closeQrCode,
  fetchQrPayments: razorpay.fetchQrPayments,
};

const unreachable = () => {
  const error = new Error('connect ETIMEDOUT');
  error.code = 'ETIMEDOUT';
  return error;
};

const fake = {
  isConfigured: () => true,
  createQrCode: async ({ amountPaise, closeBy, notes }) => {
    if (razorpayDown) throw unreachable();
    qrSeq += 1;
    const id = `qr_TEST${qrSeq}`;
    qrs.set(id, { id, amount: amountPaise, notes, closed: false, payments: [] });
    return {
      id, image_url: `https://rzp.io/i/${id}`, close_by: Math.floor(closeBy), status: 'active',
    };
  },
  closeQrCode: async (id) => {
    if (razorpayDown) throw unreachable();
    const qr = qrs.get(id);
    if (qr) qr.closed = true;
    return { id, status: 'closed' };
  },
  fetchQrPayments: async (id) => {
    if (razorpayDown) throw unreachable();
    return (qrs.get(id)?.payments || []).slice().reverse();
  },
};

/** The diner scans and pays. Refused, like the real thing, on a closed QR. */
const dinerPays = (qrId, amountPaise) => {
  const qr = qrs.get(qrId);
  assert.ok(qr, `no such QR ${qrId}`);
  if (qr.closed) return null;
  const payment = { id: `pay_TEST${qr.payments.length + 1}${qrId}`, amount: amountPaise ?? qr.amount, status: 'captured' };
  qr.payments.push(payment);
  qr.closed = true;
  return payment;
};

before(async () => {
  Object.assign(razorpay, fake);
  /* Not what these tests are about, and a real one would look for riders. */
  dispatch.startDispatch = async () => ({ started: false });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  Object.assign(razorpay, real);
  dispatch.stopAllDispatch();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  qrs = new Map();
  qrSeq = 0;
  razorpayDown = false;
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

/* ── Seed: a COD order, picked up and at the door ────────────────────── */

const RIDER = 'DRV-DOOR0001';

const atTheDoor = async ({ paymentMode = 'cod' } = {}) => {
  await FoodRestaurant.create({
    restaurantId: 'FP-TEST0001',
    restaurantName: 'Test Kitchen',
    ownerName: 'Owner',
    ownerPhone: '+919000000001',
    ownerEmail: 'owner1@example.invalid',
    contactNumber: '+919000000009',
    fssaiLicenseNumber: '12345678901234',
    cuisineTypes: ['Chinese'],
    verificationStatus: 'approved',
    isActive: true,
    openState: 'open',
    minOrderValue: 100,
    packagingCharge: 10,
    deliveryFee: { type: 'flat', amount: 20 },
    acceptsCod: true,
    acceptsOnlinePayment: true,
    address: { line1: 'Opposite the RTC complex' },
    location: { type: 'Point', coordinates: [78.4867, 17.385] },
  });
  await FoodProduct.create({
    productId: 'FPI-TEST0001',
    restaurantId: 'FP-TEST0001',
    productName: 'Veg Hakka Noodles',
    category: 'Noodles',
    price: 120,
    isVeg: 'veg',
    isAvailable: true,
  });
  const customer = await Customer.create({
    customerId: 'cus_door1', phone: '+919111111111', name: 'Test Diner', phoneVerifiedAt: new Date(),
  });
  const placed = await call('POST', '/api/v2/food-partners/orders', {
    token: signCustomerToken(customer),
    body: {
      restaurantId: 'FP-TEST0001',
      lines: [{ productId: 'FPI-TEST0001', quantity: 2 }],
      paymentMode: 'cod',
      fulfilment: 'delivery',
      channel: 'web',
      deliveryAddress: '12 Test Lane, Testville',
      dropLat: 17.39,
      dropLng: 78.49,
      customerName: 'Test Diner',
    },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));

  const rider = await Driver.create({
    driverId: RIDER, phone: '+919222222222', name: 'Test Rider', status: 'approved',
  });

  const row = await FoodOrder.findOne({}).lean();
  await FoodOrder.updateOne({ _id: row._id }, {
    $set: {
      status: 'picked_up',
      paymentMode,
      paymentStatus: paymentMode === 'online' ? 'paid' : 'pending',
      deliveryOtp: '7391',
      pickupCode: '1234',
      'delivery.driverId': RIDER,
      'delivery.pickedUpAt': new Date(),
    },
  });
  const order = await FoodOrder.findById(row._id).lean();
  return {
    orderNumber: order.orderNumber,
    paise: Math.round(order.grandTotal * 100),
    token: signDriverToken(rider),
  };
};

const openQr = (ctx) => call('POST', `/api/v2/drivers/orders/${ctx.orderNumber}/collect/upi`, { token: ctx.token });
const poll = (ctx) => call('GET', `/api/v2/drivers/orders/${ctx.orderNumber}/collect`, { token: ctx.token });
const deliver = (ctx, extra = {}) => call('PATCH', `/api/v2/drivers/orders/${ctx.orderNumber}/status`, {
  token: ctx.token, body: { status: 'delivered', code: '7391', ...extra },
});
const stored = (orderNumber) => FoodOrder.findOne({ orderNumber }).lean();

const webhook = (event, payload) => {
  const raw = JSON.stringify({ event, payload });
  const signature = crypto.createHmac('sha256', 'doorstep_test_secret').update(raw).digest('hex');
  return call('POST', '/api/v2/payments/razorpay/webhook', {
    body: raw, headers: { 'X-Razorpay-Signature': signature },
  });
};

/* ══════════════════════════════════════════════════════════════════════════ */

describe('cash at the door', () => {
  it('delivers, marks the order paid, and records cash and the rider', async () => {
    const ctx = await atTheDoor();
    const out = await deliver(ctx, { collection: 'cash' });
    assert.equal(out.status, 200, JSON.stringify(out.body));

    const row = await stored(ctx.orderNumber);
    assert.equal(row.status, 'delivered');
    assert.equal(row.paymentStatus, 'paid');
    assert.equal(row.collection.method, 'cash');
    assert.equal(row.collection.amountPaise, ctx.paise);
    assert.equal(row.collection.collectedBy, RIDER);
    assert.ok(row.collection.collectedAt);
  });

  it('refuses a delivery that does not say how it was paid', async () => {
    const ctx = await atTheDoor();
    const out = await deliver(ctx);
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'COLLECTION_REQUIRED');
    const row = await stored(ctx.orderNumber);
    assert.equal(row.status, 'picked_up');
    assert.equal(row.paymentStatus, 'pending');
  });

  it('records it as cash instead while DOORSTEP_COLLECTION_OPTIONAL is on, for riders on the old app', async () => {
    const ctx = await atTheDoor();
    config.doorstep.collectionOptional = true;
    try {
      const out = await deliver(ctx);
      assert.equal(out.status, 200, JSON.stringify(out.body));
      assert.equal((await stored(ctx.orderNumber)).collection.method, 'cash');
    } finally {
      config.doorstep.collectionOptional = false;
    }
  });

  it('does not need a word on a prepaid order', async () => {
    const ctx = await atTheDoor({ paymentMode: 'online' });
    const out = await deliver(ctx);
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.equal((await stored(ctx.orderNumber)).collection.method, '');
  });

  it('refuses a word that is neither, and leaves the order as it was', async () => {
    const ctx = await atTheDoor();
    const out = await deliver(ctx, { collection: 'card' });
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'COLLECTION_INVALID');
    const row = await stored(ctx.orderNumber);
    assert.equal(row.status, 'picked_up');
    assert.equal(row.paymentStatus, 'pending');
  });

  it('closes an open QR before taking cash, so the diner cannot also pay on it', async () => {
    const ctx = await atTheDoor();
    const qr = (await openQr(ctx)).body.data.collection.qr;
    const out = await deliver(ctx, { collection: 'cash' });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.equal(qrs.get(qr.id).closed, true);
    assert.equal(dinerPays(qr.id), null, 'a closed QR takes no money');
  });

  it('refuses cash when the diner had already paid on the QR', async () => {
    const ctx = await atTheDoor();
    const qr = (await openQr(ctx)).body.data.collection.qr;
    dinerPays(qr.id);

    const out = await deliver(ctx, { collection: 'cash' });
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'ALREADY_PAID_BY_UPI');

    const row = await stored(ctx.orderNumber);
    assert.equal(row.status, 'picked_up', 'not delivered on a refused hand-over');
    assert.equal(row.paymentStatus, 'paid', 'but the UPI payment it found is recorded');
    assert.equal(row.collection.method, 'upi_qr');
  });

  it('refuses cash, plainly, when Razorpay cannot be reached to close an open QR', async () => {
    const ctx = await atTheDoor();
    await openQr(ctx);
    razorpayDown = true;
    const out = await deliver(ctx, { collection: 'cash' });
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'PAYMENT_CHECK_FAILED');
    assert.equal((await stored(ctx.orderNumber)).status, 'picked_up');
  });
});

describe('UPI on the rider\'s QR', () => {
  it('mints one single-use QR for the order total, carrying the order number', async () => {
    const ctx = await atTheDoor();
    const out = await openQr(ctx);
    assert.equal(out.status, 200, JSON.stringify(out.body));
    const { qr } = out.body.data.collection;
    assert.ok(qr.imageUrl);
    assert.equal(qr.amountPaise, ctx.paise);
    assert.deepEqual(qrs.get(qr.id).notes, { foodOrderNumber: ctx.orderNumber, purpose: 'doorstep_collection' });
  });

  it('hands back the same QR while it is open, rather than a second one', async () => {
    const ctx = await atTheDoor();
    const first = (await openQr(ctx)).body.data.collection.qr;
    const second = (await openQr(ctx)).body.data.collection.qr;
    assert.equal(second.id, first.id);
    assert.equal(qrs.size, 1);
  });

  it('closes an expired QR before minting the next', async () => {
    const ctx = await atTheDoor();
    const first = (await openQr(ctx)).body.data.collection.qr;
    await FoodOrder.updateOne({ orderNumber: ctx.orderNumber }, { 'collection.qr.expiresAt': new Date(Date.now() - 1000) });
    const second = (await openQr(ctx)).body.data.collection.qr;
    assert.notEqual(second.id, first.id);
    assert.equal(qrs.get(first.id).closed, true);
  });

  it('sees the payment on the poll, and then delivers as UPI', async () => {
    const ctx = await atTheDoor();
    const qr = (await openQr(ctx)).body.data.collection.qr;
    dinerPays(qr.id);

    const seen = await poll(ctx);
    assert.equal(seen.body.data.paymentStatus, 'paid');
    assert.equal(seen.body.data.collectAmount, 0);
    assert.equal(seen.body.data.collection.method, 'upi_qr');

    const out = await deliver(ctx, { collection: 'upi' });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    const row = await stored(ctx.orderNumber);
    assert.equal(row.status, 'delivered');
    assert.equal(row.collection.method, 'upi_qr');
    assert.ok(row.razorpay.paymentId.startsWith('pay_TEST'));
  });

  it('refuses UPI before the money has arrived', async () => {
    const ctx = await atTheDoor();
    await openQr(ctx);
    const out = await deliver(ctx, { collection: 'upi' });
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'PAYMENT_PENDING');
    const row = await stored(ctx.orderNumber);
    assert.equal(row.status, 'picked_up');
    assert.equal(row.paymentStatus, 'pending');
  });

  it('delivers as UPI even when the webhook got there first and nothing is left to check', async () => {
    const ctx = await atTheDoor();
    const qr = (await openQr(ctx)).body.data.collection.qr;
    const payment = dinerPays(qr.id);
    await webhook('qr_code.credited', {
      qr_code: { entity: { id: qr.id, notes: qrs.get(qr.id).notes, payment_amount: ctx.paise } },
      payment: { entity: { id: payment.id, amount: payment.amount, notes: {} } },
    });
    razorpayDown = true;
    const out = await deliver(ctx, { collection: 'upi' });
    assert.equal(out.status, 200, JSON.stringify(out.body));
  });

  it('is not offered before the food is picked up', async () => {
    const ctx = await atTheDoor();
    await FoodOrder.updateOne({ orderNumber: ctx.orderNumber }, { status: 'ready' });
    const out = await openQr(ctx);
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'NOT_AT_DOOR');
  });

  it('mints nothing for an order that is already paid', async () => {
    const ctx = await atTheDoor({ paymentMode: 'online' });
    const out = await openQr(ctx);
    assert.equal(out.status, 200);
    assert.equal(out.body.data.collectAmount, 0);
    assert.equal(out.body.data.collection.qr, null);
    assert.equal(qrs.size, 0);
  });

  it('is another rider\'s order to nobody else', async () => {
    const ctx = await atTheDoor();
    const other = await Driver.create({
      driverId: 'DRV-DOOR0002', phone: '+919333333333', name: 'Other Rider', status: 'approved',
    });
    const out = await call('POST', `/api/v2/drivers/orders/${ctx.orderNumber}/collect/upi`, {
      token: signDriverToken(other),
    });
    assert.equal(out.status, 404);
    assert.equal(qrs.size, 0);
  });
});

describe('the webhook', () => {
  it('settles the order from qr_code.credited, without telling the kitchen about a new order', async () => {
    const ctx = await atTheDoor();
    const qr = (await openQr(ctx)).body.data.collection.qr;
    const payment = dinerPays(qr.id);

    const out = await webhook('qr_code.credited', {
      qr_code: { entity: { id: qr.id, notes: qrs.get(qr.id).notes, payment_amount: ctx.paise } },
      payment: { entity: { id: payment.id, amount: payment.amount, notes: {} } },
    });
    assert.equal(out.status, 200, JSON.stringify(out.body));

    const row = await stored(ctx.orderNumber);
    assert.equal(row.paymentStatus, 'paid');
    assert.equal(row.collection.method, 'upi_qr');
    assert.equal(row.razorpay.paymentId, payment.id);
    assert.equal(row.statusHistory.filter((e) => e.note === 'Payment received').length, 0,
      'the online-order confirm (which rings the kitchen) did not run');
    assert.equal(row.statusHistory.filter((e) => e.note === 'Paid by UPI at the door').length, 1);
  });

  it('is the same answer when Razorpay delivers it twice', async () => {
    const ctx = await atTheDoor();
    const qr = (await openQr(ctx)).body.data.collection.qr;
    const payment = dinerPays(qr.id);
    const payload = {
      qr_code: { entity: { id: qr.id, notes: qrs.get(qr.id).notes } },
      payment: { entity: { id: payment.id, amount: payment.amount, notes: {} } },
    };
    await webhook('qr_code.credited', payload);
    await webhook('qr_code.credited', payload);
    const row = await stored(ctx.orderNumber);
    assert.equal(row.statusHistory.filter((e) => e.note === 'Paid by UPI at the door').length, 1);
  });

  it('does not mark an underpayment paid', async () => {
    const ctx = await atTheDoor();
    const qr = (await openQr(ctx)).body.data.collection.qr;
    await webhook('qr_code.credited', {
      qr_code: { entity: { id: qr.id, notes: qrs.get(qr.id).notes } },
      payment: { entity: { id: 'pay_SHORT', amount: ctx.paise - 100, notes: {} } },
    });
    assert.equal((await stored(ctx.orderNumber)).paymentStatus, 'pending');
  });

  it('never confirms a cash-on-delivery order through the online-order path', async () => {
    const ctx = await atTheDoor();
    await webhook('payment.captured', {
      payment: { entity: { id: 'pay_STRAY', amount: ctx.paise, notes: { foodOrderNumber: ctx.orderNumber } } },
    });
    const row = await stored(ctx.orderNumber);
    assert.equal(row.paymentStatus, 'pending');
    assert.equal(row.statusHistory.filter((e) => e.note === 'Payment received').length, 0);
  });

  it('refuses a body that is not signed with our secret', async () => {
    const ctx = await atTheDoor();
    const out = await call('POST', '/api/v2/payments/razorpay/webhook', {
      body: JSON.stringify({
        event: 'qr_code.credited',
        payload: { qr_code: { entity: { notes: { foodOrderNumber: ctx.orderNumber, purpose: 'doorstep_collection' } } } },
      }),
      headers: { 'X-Razorpay-Signature': 'forged' },
    });
    assert.equal(out.status, 400);
    assert.equal((await stored(ctx.orderNumber)).paymentStatus, 'pending');
  });
});

/* ── The cash a rider is holding, and handing it back ─────────────────── */

const staffToken = async (role) => {
  const admin = await Admin.create({
    name: `${role} Person`,
    email: `${role.toLowerCase().replace(/\s/g, '.')}@lampose.test`,
    password: 'a-good-password-1',
    role,
  });
  return signAdminToken(admin);
};

const myCash = (ctx) => call('GET', '/api/v2/drivers/me/cash', { token: ctx.token });
const handOver = (token, body, driverId = RIDER) => call(
  'POST', `/api/v1/admin/drivers/${driverId}/cash-deposits`, { token, body },
);

describe('cash in hand', () => {
  it('is what the rider took in cash at doors, and nothing taken by UPI', async () => {
    const ctx = await atTheDoor();
    assert.equal((await myCash(ctx)).body.data.inHandPaise, 0);

    await deliver(ctx, { collection: 'cash' });
    const after = (await myCash(ctx)).body.data;
    assert.equal(after.inHandPaise, ctx.paise);
    assert.equal(after.collectedPaise, ctx.paise);
    assert.equal(after.cashOrders, 1);
    assert.deepEqual(after.collections.map((c) => c.orderNumber), [ctx.orderNumber]);
  });

  it('does not count a UPI payment as cash the rider holds', async () => {
    const ctx = await atTheDoor();
    const qr = (await openQr(ctx)).body.data.collection.qr;
    dinerPays(qr.id);
    await deliver(ctx, { collection: 'upi' });
    assert.equal((await myCash(ctx)).body.data.inHandPaise, 0);
  });

  it('goes down by what an administrator records as handed over, and says who took it', async () => {
    const ctx = await atTheDoor();
    await deliver(ctx, { collection: 'cash' });
    const admin = await staffToken('Food Admin');

    const out = await handOver(admin, { amount: 100, method: 'cash', reference: 'RCPT-1' });
    assert.equal(out.status, 201, JSON.stringify(out.body));
    assert.equal(out.body.data.inHandPaise, ctx.paise - 10000);
    assert.equal(out.body.data.deposits[0].recordedBy, 'Food Admin Person');
    assert.equal(out.body.data.deposits[0].reference, 'RCPT-1');

    assert.equal((await myCash(ctx)).body.data.inHandPaise, ctx.paise - 10000, 'the rider sees the same number');
  });

  it('refuses a hand-over bigger than what the rider holds', async () => {
    const ctx = await atTheDoor();
    await deliver(ctx, { collection: 'cash' });
    const admin = await staffToken('Admin');
    const out = await handOver(admin, { amount: ctx.paise / 100 + 1 });
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'MORE_THAN_IN_HAND');
  });

  it('refuses an amount that is not a positive number of rupees', async () => {
    const ctx = await atTheDoor();
    await deliver(ctx, { collection: 'cash' });
    const admin = await staffToken('Admin');
    for (const amount of [0, -5, 'abc', 12.345]) {
      const out = await handOver(admin, { amount });
      assert.equal(out.status, 400, `amount ${amount}`);
    }
  });

  it('is not a Viewer\'s to record', async () => {
    const ctx = await atTheDoor();
    await deliver(ctx, { collection: 'cash' });
    const viewer = await staffToken('Viewer');
    const out = await handOver(viewer, { amount: 10 });
    assert.equal(out.status, 403);
  });

  it('shows on the console\'s rider list and rider page', async () => {
    const ctx = await atTheDoor();
    await deliver(ctx, { collection: 'cash' });
    const viewer = await staffToken('Viewer');

    const list = await call('GET', '/api/v1/admin/drivers', { token: viewer });
    const row = list.body.data.find((r) => r.driverId === RIDER);
    assert.equal(row.cashInHandPaise, ctx.paise);

    const one = await call('GET', `/api/v1/admin/drivers/${RIDER}`, { token: viewer });
    assert.equal(one.body.data.cash.inHandPaise, ctx.paise);
    assert.equal(one.body.data.recentDeliveries[0].collectionMethod, 'cash');
  });
});

describe('the console\'s food orders', () => {
  it('says how the door was paid, on the row and on the order', async () => {
    const ctx = await atTheDoor();
    const qr = (await openQr(ctx)).body.data.collection.qr;
    const payment = dinerPays(qr.id);
    await deliver(ctx, { collection: 'upi' });
    const viewer = await staffToken('Viewer');

    const list = await call('GET', '/api/v1/admin/food-orders', { token: viewer });
    const row = list.body.data.find((r) => r.orderNumber === ctx.orderNumber);
    assert.equal(row.collectionMethod, 'upi_qr');

    const one = await call('GET', `/api/v1/admin/food-orders/${ctx.orderNumber}`, { token: viewer });
    assert.equal(one.body.data.payment.collection.method, 'upi_qr');
    assert.equal(one.body.data.payment.collection.collectedBy, RIDER);
    assert.equal(one.body.data.payment.razorpayPaymentId, payment.id);
  });
});
