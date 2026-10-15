/* ══════════════════════════════════════════════════════════════════════════
   A diner rates the rider who brought their order.

   What these pin down:

     · only the diner who placed it, only once it is DELIVERED, only when a
       Lampose app rider carried it, and only within the week after
     · once per order — a double tap, or ten at once, counts one rating
     · the rider's average is rebuilt from their orders, and their own
       `GET /me` carries it
     · the kitchen's view of the order never shows the diner's verdict

   Nothing here can reach a real phone: credentials are blanked before anything
   loads, and outbound requests are blocked.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TWILIO_DELIVERY_REQUEST_CONTENT_SID', 'DELIVERY_PARTNER_WHATSAPP',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL', 'EXPO_ACCESS_TOKEN',
]) process.env[key] = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a-long-secret-for-this-test-suite-only-0123456789abcdef';

const http = require('node:http');
const https = require('node:https');

const isLocal = (host) => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host || ''));
const hostOf = (target) => {
  if (typeof target === 'string') return new URL(target).hostname;
  if (target instanceof URL) return target.hostname;
  return (target && (target.hostname || target.host)) || '';
};
const refuse = () => { throw new Error('Blocked an outbound request in a test'); };
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if (!isLocal(hostOf(url))) refuse();
  return realFetch(input, init);
};
for (const mod of [http, https]) {
  for (const name of ['request', 'get']) {
    const real = mod[name];
    mod[name] = (target, ...rest) => {
      if (!isLocal(hostOf(target))) refuse();
      return real.call(mod, target, ...rest);
    };
  }
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase, race } = require('./helpers/db');
const createApp = require('../app');
const Customer = require('../src/modules/customers/customer.model');
const Driver = require('../src/modules/drivers/driver.model');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
const { signDriverToken } = require('../src/modules/drivers/driverAuth.middleware');
const dispatch = require('../src/modules/drivers/foodDispatch.service');
const { RATING_WINDOW_MS } = require('../src/modules/drivers/riderRating.service');

withDatabase();

let server;
let base;
const realStart = dispatch.startDispatch;

before(async () => {
  dispatch.startDispatch = async () => ({ started: false });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  dispatch.startDispatch = realStart;
  dispatch.stopAllDispatch();
  await new Promise((resolve) => server.close(resolve));
});

const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

/* ── Seed ─────────────────────────────────────────────────────────────── */

const RIDER = 'DR-RATE0001';

const kitchen = async () => {
  await FoodRestaurant.create({
    restaurantId: 'FP-RATE0001',
    restaurantName: 'Rating Kitchen',
    ownerName: 'Owner',
    ownerPhone: '+919000000071',
    ownerEmail: 'owner-rating@example.invalid',
    fssaiLicenseNumber: '12345678901234',
    cuisineTypes: ['Chinese'],
    verificationStatus: 'approved',
    isActive: true,
    openState: 'open',
    minOrderValue: 100,
    packagingCharge: 10,
    deliveryFee: { type: 'flat', amount: 20 },
    acceptsCod: true,
    address: { line1: 'Opposite the RTC complex' },
    location: { type: 'Point', coordinates: [78.4867, 17.385] },
  });
  await FoodProduct.create({
    productId: 'FPI-RATE0001',
    restaurantId: 'FP-RATE0001',
    productName: 'Veg Hakka Noodles',
    category: 'Noodles',
    price: 120,
    isVeg: 'veg',
    isAvailable: true,
  });
  const rider = await Driver.create({
    driverId: RIDER, phone: '+919222222271', name: 'Rated Rider', status: 'approved',
  });
  return { riderToken: signDriverToken(rider) };
};

let dinerSeq = 0;
const diner = async () => {
  dinerSeq += 1;
  const customer = await Customer.create({
    customerId: `cus_rate${dinerSeq}`,
    phone: `+91911111${String(1000 + dinerSeq).slice(-4)}`,
    name: `Diner ${dinerSeq}`,
    phoneVerifiedAt: new Date(),
  });
  return signCustomerToken(customer);
};

/** A placed order, then moved straight to the state a test needs. */
const order = async (token, set = {}) => {
  const placed = await call('POST', '/api/v2/food-partners/orders', {
    token,
    body: {
      restaurantId: 'FP-RATE0001',
      lines: [{ productId: 'FPI-RATE0001', quantity: 2 }],
      paymentMode: 'cod',
      fulfilment: 'delivery',
      deliveryAddress: '12 Test Lane, Testville',
      customerName: 'Test Diner',
    },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  const { orderNumber } = placed.body.data;
  await FoodOrder.updateOne({ orderNumber }, {
    $set: {
      status: 'delivered',
      'delivery.driverId': RIDER,
      'delivery.deliveredAt': new Date(),
      ...set,
    },
  });
  return orderNumber;
};

const rate = (orderNumber, token, body) => call(
  'POST', `/api/v2/food-partners/orders/${orderNumber}/rider-rating`, { token, body },
);

/* ══════════════════════════════════════════════════════════════════════════ */

describe('rating the rider', () => {
  it('records the stars on the order and the average on the rider', async () => {
    const { riderToken } = await kitchen();
    const first = await diner();
    const second = await diner();

    const a = await order(first);
    const res = await rate(a, first, { stars: 5, comment: '  Quick and polite  ' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.delivery.rating.stars, 5);
    assert.equal(res.body.data.delivery.rating.comment, 'Quick and polite');

    const b = await order(second);
    assert.equal((await rate(b, second, { stars: 4 })).status, 200);

    const rider = await Driver.findOne({ driverId: RIDER }).lean();
    assert.deepEqual(rider.rating, { avg: 4.5, count: 2 });

    const me = await call('GET', '/api/v2/drivers/me', { token: riderToken });
    assert.equal(me.status, 200);
    assert.deepEqual(me.body.data.rating, { avg: 4.5, count: 2 });
  });

  it('counts a rider with no ratings as none, not as zero stars', async () => {
    const { riderToken } = await kitchen();
    const me = await call('GET', '/api/v2/drivers/me', { token: riderToken });
    assert.deepEqual(me.body.data.rating, { avg: null, count: 0 });
  });

  it('takes whole stars from one to five only', async () => {
    await kitchen();
    const token = await diner();
    const number = await order(token);
    for (const stars of [0, 6, 3.5, 'five', null]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await rate(number, token, { stars });
      assert.equal(res.status, 400, `stars=${stars}`);
      assert.equal(res.body.code, 'BAD_RATING');
    }
  });

  it('counts one rating per order, however many arrive at once', async () => {
    await kitchen();
    const token = await diner();
    const number = await order(token);

    const results = await race(10, () => rate(number, token, { stars: 5 }));
    const won = results.filter((res) => res && res.status === 200).length;
    assert.equal(won, 1);
    assert.ok(results.every((res) => res && (res.status === 200 || res.body.code === 'ALREADY_RATED')));

    const again = await rate(number, token, { stars: 1 });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'ALREADY_RATED');
    assert.deepEqual((await Driver.findOne({ driverId: RIDER }).lean()).rating, { avg: 5, count: 1 });
  });

  it('is the ordering diner\'s alone', async () => {
    await kitchen();
    const owner = await diner();
    const stranger = await diner();
    const number = await order(owner);

    assert.equal((await rate(number, stranger, { stars: 1 })).status, 404);
    assert.equal((await rate(number, null, { stars: 1 })).status, 401);
  });

  it('waits until the order is delivered', async () => {
    await kitchen();
    const token = await diner();
    const number = await order(token, { status: 'picked_up', 'delivery.deliveredAt': null });

    const res = await rate(number, token, { stars: 5 });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'NOT_DELIVERED');
  });

  it('has nobody to rate when no Lampose rider carried it', async () => {
    await kitchen();
    const token = await diner();
    const number = await order(token, { 'delivery.driverId': '' });

    const res = await rate(number, token, { stars: 5 });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'NO_RIDER');
  });

  it('closes a week after delivery', async () => {
    await kitchen();
    const token = await diner();
    const number = await order(token, {
      'delivery.deliveredAt': new Date(Date.now() - RATING_WINDOW_MS - 60_000),
    });

    const res = await rate(number, token, { stars: 5 });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'RATING_CLOSED');
  });

  it('never shows the diner\'s verdict to the kitchen', async () => {
    await kitchen();
    const token = await diner();
    const number = await order(token);
    assert.equal((await rate(number, token, { stars: 2, comment: 'Late' })).status, 200);

    const stored = await FoodOrder.findOne({ orderNumber: number });
    const kitchenView = FoodOrder.partnerView(stored);
    assert.equal(kitchenView.delivery.rating, undefined);
    assert.ok(!JSON.stringify(kitchenView).includes('Late'));
  });
});
