/* ══════════════════════════════════════════════════════════════════════════
   Who brings the order — the restaurant's choice, and what follows from it.

   When a restaurant accepts a delivery order it picks how the food reaches the
   diner: "we will deliver it ourselves" or "send a Lampose driver". The second
   sends a WhatsApp to the delivery desk. In both cases the diner is told a
   driver has been assigned.

   These tests play that through the real app and the real database. The ONE
   thing replaced is the WhatsApp sender - and replaced with a recorder, so a
   test can say exactly what would have been sent, to whom, and make it fail on
   demand.

   ## This file must not be able to reach a real phone

   The backend's `.env` carries live Twilio credentials, and this flow sends a
   WhatsApp. Two independent layers, either one enough on its own (the same two
   `foodOrder.test.js` uses, for the same reason - an earlier version of that
   file sent real alerts to an invented number):

     1. the messaging credentials are blanked before anything is required, so
        the Twilio module sees an unconfigured provider;
     2. every outbound request that is not to this machine is blocked and
        counted, and the last test asserts the count is zero.

   The sender the flow calls is then replaced on top of both.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TWILIO_DELIVERY_REQUEST_CONTENT_SID', 'DELIVERY_PARTNER_WHATSAPP',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAYX_KEY_ID', 'RAZORPAYX_KEY_SECRET',
  'EXPO_ACCESS_TOKEN',
]) process.env[key] = '';

const http = require('node:http');
const https = require('node:https');

const blocked = [];
const isLocal = (host) => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host || ''));
const hostOf = (target) => {
  if (typeof target === 'string') return new URL(target).hostname;
  if (target instanceof URL) return target.hostname;
  return (target && (target.hostname || target.host)) || '';
};
const refuse = (target) => {
  const where = typeof target === 'string' ? target : hostOf(target);
  blocked.push(where);
  throw new Error(`Blocked an outbound request in a test: ${where}`);
};

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if (!isLocal(hostOf(url))) refuse(url);
  return realFetch(input, init);
};
for (const mod of [http, https]) {
  for (const name of ['request', 'get']) {
    const real = mod[name];
    mod[name] = (target, ...rest) => {
      if (!isLocal(hostOf(target))) refuse(target);
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
const config = require('../src/config/env');
const twilio = require('../src/infrastructure/twilio/twilio');
const Customer = require('../src/modules/customers/customer.model');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
const { availableFor } = require('../src/modules/foodpartners/foodPayout.service');
const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
const { signRestaurantAdminToken } = require('../src/modules/foodpartners/restaurantAdmin.middleware');
const dispatch = require('../src/modules/drivers/foodDispatch.service');

withDatabase();

let server;
let base;

/* What the stand-in for WhatsApp was asked to send, and what it answers. */
let sent = [];
let outcome = { success: true, messageSid: 'SMTEST0001' };
/* Every time the automatic rider search was asked to start. */
let searches = [];

const realSender = twilio.sendDeliveryRequest;
const realStart = dispatch.startDispatch;

before(async () => {
  twilio.sendDeliveryRequest = async (args) => { sent.push(args); return outcome; };
  /* Recorded and NOT run: the search is not what these tests are about, and a
     real one would go looking for riders in a database that has none. The one
     test that needs the real thing calls `realStart` itself. */
  dispatch.startDispatch = async (orderNumber) => { searches.push(orderNumber); return { started: false }; };

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  twilio.sendDeliveryRequest = realSender;
  dispatch.startDispatch = realStart;
  dispatch.stopAllDispatch();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  sent = [];
  searches = [];
  outcome = { success: true, messageSid: 'SMTEST0001' };
});

const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/* ── Seed ─────────────────────────────────────────────────────────────── */

const makeKitchen = (over = {}) => FoodRestaurant.create({
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
  ...over,
});

const makeDish = () => FoodProduct.create({
  productId: 'FPI-TEST0001',
  restaurantId: 'FP-TEST0001',
  productName: 'Veg Hakka Noodles',
  category: 'Noodles',
  price: 120,
  isVeg: 'veg',
  isAvailable: true,
});

const makeDiner = async () => {
  const customer = await Customer.create({
    customerId: 'cus_diner1', phone: '+919111111111', name: 'Test Diner', phoneVerifiedAt: new Date(),
  });
  return signCustomerToken(customer);
};

const adminFor = async (restaurantId = 'FP-TEST0001') => signRestaurantAdminToken(
  await FoodRestaurant.findOne({ restaurantId }),
);

const status = (orderNumber, token, body) => call(
  'PATCH', `/api/v1/restaurant-admin/orders/${orderNumber}/status`, { token, body },
);
const delivery = (orderNumber, token, body) => call(
  'PATCH', `/api/v1/restaurant-admin/orders/${orderNumber}/delivery`, { token, body },
);
const diner = (orderNumber, token) => call('GET', `/api/v2/food-web/orders/${orderNumber}`, { token });

/**
 * A placed cash-on-delivery order, its kitchen and its diner.
 * Codes are pinned, so the tests never depend on which four digits were drawn.
 */
const placeOrder = async (over = {}) => {
  await makeKitchen();
  await makeDish();
  const dinerToken = await makeDiner();
  const placed = await call('POST', '/api/v2/food-partners/orders', {
    token: dinerToken,
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
      ...over,
    },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  const row = await FoodOrder.findOne({}).lean();
  await FoodOrder.updateOne({ _id: row._id }, { deliveryOtp: '7391', pickupCode: '1234' });
  return { orderNumber: row.orderNumber, dinerToken, admin: await adminFor() };
};

const accept = (ctx, extra = {}) => status(ctx.orderNumber, ctx.admin, {
  status: 'accepted', promisedMinutes: 20, ...extra,
});

const stored = (orderNumber) => FoodOrder.findOne({ orderNumber }).lean();

/* ══════════════════════════════════════════════════════════════════════════ */

describe('this file is hermetic', () => {
  it('has no messaging credentials, and blocks anything that is not this machine', async () => {
    assert.equal(process.env.TWILIO_ACCOUNT_SID, '');
    await assert.rejects(async () => fetch('https://api.twilio.com/2010-04-01/Accounts'), /Blocked an outbound request/);
    blocked.length = 0; // on purpose
  });
});

describe('accepting an order and choosing "we will deliver it ourselves"', () => {
  it('records the choice, contacts nobody, and starts no rider search', async () => {
    const ctx = await placeOrder();
    const res = await accept(ctx, { deliveryBy: 'self' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'accepted');
    assert.deepEqual(res.body.delivery, {
      method: 'self', ok: true, sent: null, message: '',
    });
    assert.equal(sent.length, 0, 'nobody is messaged when the restaurant delivers itself');
    assert.deepEqual(searches, [], 'and the automatic rider search does not run');

    const row = await stored(ctx.orderNumber);
    assert.equal(row.delivery.method, 'self');
    assert.ok(row.delivery.methodChosenAt);
    assert.equal(row.dispatch.state, 'idle');
  });

  it('tells the diner a driver has been assigned', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'self' });

    const seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    const first = seen.riderTrack[0];
    assert.equal(first.label, 'Driver assigned');
    assert.equal(first.done, true);
    assert.equal(first.note, 'The restaurant\'s own delivery person');
    assert.equal(seen.dispatch.state, 'assigned');
    assert.equal(seen.rider.kind, 'restaurant');
    assert.deepEqual(seen.delivery, { by: 'self', assigned: true });
    assert.equal(seen.rider.name, 'Test Kitchen delivery');
    assert.equal(seen.deliveryOtp, '', 'no code on a website order - the diner confirms the delivery themselves');
    assert.ok(!seen.riderTrack.some((s) => /Looking for a rider|No rider found/.test(s.label)),
      'no rider was searched for, so none of that is shown');
  });
});

describe('accepting an order and choosing "send a Lampose driver"', () => {
  it('sends the delivery request to the desk on WhatsApp, once, with what a driver needs', async () => {
    const ctx = await placeOrder();
    const res = await accept(ctx, { deliveryBy: 'driver' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.delivery, {
      method: 'driver', ok: true, sent: true, message: '',
    });

    assert.equal(sent.length, 1, 'exactly one message');
    const [message] = sent;
    assert.equal(message.to, '+916302321942', 'to the delivery desk');
    assert.equal(message.kind, 'request');
    assert.equal(message.orderNumber, ctx.orderNumber);
    assert.equal(message.restaurantName, 'Test Kitchen');
    assert.match(message.pickup, /Opposite the RTC complex/);
    assert.match(message.pickup, /\+919000000009/, 'the restaurant\'s number, to call at the pass');
    assert.match(message.pickup, /google\.com\/maps\?q=17\.385,78\.4867/, 'a map link to the kitchen');
    assert.match(message.drop, /12 Test Lane, Testville/);
    assert.match(message.drop, /google\.com\/maps\?q=17\.39,78\.49/, 'and to the drop');
    assert.match(message.customer, /Test Diner/);
    assert.match(message.customer, /\+919111111111/);
    assert.match(message.collect, /Cash to collect: ₹\d+/, 'cash on delivery: the driver must collect it');
    assert.equal(searches.length, 0, 'the app\'s own rider search does not run beside it');
  });

  it('never puts the diner\'s delivery code in the message', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'driver' });
    assert.ok(!JSON.stringify(sent).includes('7391'), 'the code is the diner\'s to give, not ours to hand out');
  });

  it('records that it went, and tells the diner a driver has been assigned', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'driver' });

    const row = await stored(ctx.orderNumber);
    assert.equal(row.delivery.method, 'driver');
    assert.equal(row.delivery.request.ok, true);
    assert.equal(row.delivery.request.messageSid, 'SMTEST0001');
    assert.equal(row.delivery.request.to, '+916302321942');
    assert.equal(row.delivery.request.attempts, 1);
    assert.equal(row.dispatch.state, 'idle');

    const seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    assert.equal(seen.riderTrack[0].label, 'Driver assigned');
    assert.equal(seen.riderTrack[0].note, 'A Lampose delivery partner');
    assert.equal(seen.dispatch.state, 'assigned');
    assert.equal(seen.rider.kind, 'partner');
  });

  it('does not put the desk\'s number anywhere the diner can read it', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'driver' });
    const seen = await diner(ctx.orderNumber, ctx.dinerToken);
    assert.ok(!JSON.stringify(seen.body).includes('6302321942'));
  });

  it('shows the restaurant that the request went out', async () => {
    const ctx = await placeOrder();
    const res = await accept(ctx, { deliveryBy: 'driver' });
    assert.equal(res.body.data.deliveryChoice.method, 'driver');
    assert.equal(res.body.data.deliveryChoice.request.ok, true);
    assert.equal(res.body.data.deliveryChoice.request.to, '+916302321942');
  });

  it('asks whoever DELIVERY_PARTNER_WHATSAPP names, not a number baked into the code', async () => {
    const before = config.deliveryDesk.whatsapp;
    config.deliveryDesk.whatsapp = '+919999999999';
    try {
      const ctx = await placeOrder();
      await accept(ctx, { deliveryBy: 'driver' });
      assert.equal(sent[0].to, '+919999999999');
    } finally {
      config.deliveryDesk.whatsapp = before;
    }
  });

  it('says there is nothing to collect on an order that is already paid', async () => {
    const ctx = await placeOrder();
    await FoodOrder.updateOne({ orderNumber: ctx.orderNumber }, { paymentMode: 'online', paymentStatus: 'paid' });
    await accept(ctx, { deliveryBy: 'driver' });
    assert.match(sent[0].collect, /Already paid/);
  });
});

describe('when the WhatsApp does not go out', () => {
  it('still accepts the order, and tells the restaurant plainly that the request failed', async () => {
    outcome = { success: false, error: 'The delivery desk number is not reachable on WhatsApp.' };
    const ctx = await placeOrder();
    const res = await accept(ctx, { deliveryBy: 'driver' });

    assert.equal(res.status, 200, 'the accept was right whatever happened to the message');
    assert.equal(res.body.data.status, 'accepted');
    assert.equal(res.body.delivery.sent, false);
    assert.equal(res.body.delivery.message, 'The delivery desk number is not reachable on WhatsApp.');
    assert.equal(res.body.data.deliveryChoice.request.ok, false);
    assert.equal(res.body.data.deliveryChoice.request.error, 'The delivery desk number is not reachable on WhatsApp.');
  });

  it('does NOT tell the diner a driver is assigned - nobody was asked', async () => {
    outcome = { success: false, error: 'refused' };
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'driver' });

    const seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    assert.equal(seen.riderTrack[0].label, 'Arranging a driver');
    assert.equal(seen.riderTrack[0].current, true);
    assert.equal(seen.riderTrack[0].done, undefined);
    assert.equal(seen.rider, null, 'no driver card for a driver who has not been asked for');
    assert.deepEqual(seen.delivery, { by: 'driver', assigned: false });
    assert.notEqual(seen.dispatch.state, 'assigned');
  });

  it('lets the restaurant send it again, and the diner is told once it has gone', async () => {
    outcome = { success: false, error: 'refused' };
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'driver' });

    outcome = { success: true, messageSid: 'SMTEST0002' };
    const again = await delivery(ctx.orderNumber, ctx.admin, { deliveryBy: 'driver' });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.delivery.sent, true);
    assert.equal(sent.length, 2);

    const row = await stored(ctx.orderNumber);
    assert.equal(row.delivery.request.ok, true);
    assert.equal(row.delivery.request.attempts, 2);

    const seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    assert.equal(seen.riderTrack[0].label, 'Driver assigned');
  });

  it('reports a sender that throws as a failed request, not a crash', async () => {
    twilio.sendDeliveryRequest = async () => { throw new Error('socket hang up'); };
    try {
      const ctx = await placeOrder();
      const res = await accept(ctx, { deliveryBy: 'driver' });
      assert.equal(res.status, 200);
      assert.equal(res.body.delivery.sent, false);
      assert.match(res.body.delivery.message, /socket hang up/);
    } finally {
      twilio.sendDeliveryRequest = async (args) => { sent.push(args); return outcome; };
    }
  });

  it('does not message the desk twice for one tap that arrives twice', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'driver' });
    const again = await delivery(ctx.orderNumber, ctx.admin, { deliveryBy: 'driver' });
    assert.equal(again.status, 200);
    assert.equal(again.body.delivery.sent, true);
    assert.equal(sent.length, 1, 'the second was the same tap, not a second request');
  });
});

describe('choosing afterwards, and changing your mind', () => {
  it('lets a restaurant choose on an order it already accepted - which ends a search that found nobody', async () => {
    const ctx = await placeOrder();
    await accept(ctx); // an accept with no choice: the app's own rider search, as ever
    assert.deepEqual(searches, [ctx.orderNumber], 'without a choice the automatic search still starts');

    /* The state the real order LO591232 was left in: cooking, ready, and the
       dispatcher having found nobody, twice. */
    await status(ctx.orderNumber, ctx.admin, { status: 'preparing' });
    await status(ctx.orderNumber, ctx.admin, { status: 'ready' });
    await FoodOrder.updateOne({ orderNumber: ctx.orderNumber }, {
      'dispatch.state': 'unassigned',
      'dispatch.attempts': 2,
      'dispatch.failureReason': '7 rider(s) online, none free and nearby',
    });
    let seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    assert.ok(seen.riderTrack.some((s) => s.label === 'No rider found yet'), 'as it was');

    const res = await delivery(ctx.orderNumber, ctx.admin, { deliveryBy: 'driver' });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const row = await stored(ctx.orderNumber);
    assert.equal(row.dispatch.state, 'idle', 'the search is over');
    assert.equal(row.dispatch.failureReason, '', 'and its failure is not left on the order');
    seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    assert.ok(!seen.riderTrack.some((s) => s.label === 'No rider found yet'));
    assert.equal(seen.riderTrack[0].label, 'Driver assigned');
  });

  it('withdraws the request from the desk when the restaurant decides to deliver itself', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'driver' });

    const res = await delivery(ctx.orderNumber, ctx.admin, { deliveryBy: 'self' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    await sleep(20); // the withdrawal is not held up for the caller

    assert.equal(sent.length, 2);
    assert.equal(sent[1].kind, 'cancel');
    assert.equal(sent[1].to, '+916302321942');

    const row = await stored(ctx.orderNumber);
    assert.equal(row.delivery.method, 'self');
    assert.equal(row.delivery.request.ok, false, 'no stale "sent" left behind');
    assert.equal(row.delivery.request.attempts, 0);
  });

  it('withdraws the request from the desk when the restaurant then refuses the order', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'driver' });

    const res = await status(ctx.orderNumber, ctx.admin, { status: 'rejected', reason: 'Out of noodles' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    await sleep(20);

    assert.equal(sent.length, 2);
    assert.equal(sent[1].kind, 'cancel');
  });

  it('refuses to choose before the order is accepted', async () => {
    const ctx = await placeOrder();
    const res = await delivery(ctx.orderNumber, ctx.admin, { deliveryBy: 'self' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'WRONG_STATE');
    assert.equal((await stored(ctx.orderNumber)).delivery.method, '');
  });

  it('refuses once a rider from the app has already taken it', async () => {
    const ctx = await placeOrder();
    await accept(ctx);
    await FoodOrder.updateOne({ orderNumber: ctx.orderNumber }, {
      'delivery.driverId': 'DRV-1', 'delivery.driverName': 'Asha', 'dispatch.state': 'assigned',
    });
    const res = await delivery(ctx.orderNumber, ctx.admin, { deliveryBy: 'driver' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'RIDER_ALREADY_ASSIGNED');
    assert.equal(sent.length, 0, 'and nobody is messaged about a bag that already has a rider');
  });

  it('is not another restaurant\'s to choose', async () => {
    const ctx = await placeOrder();
    await accept(ctx);
    await makeKitchen({
      restaurantId: 'FP-TEST0002', restaurantName: 'Other Kitchen', ownerPhone: '+919000000002', ownerEmail: 'two@example.invalid',
    });
    const res = await delivery(ctx.orderNumber, await adminFor('FP-TEST0002'), { deliveryBy: 'self' });
    assert.equal(res.status, 404);
    assert.equal((await stored(ctx.orderNumber)).delivery.method, '');
  });

  it('needs a real session', async () => {
    const ctx = await placeOrder();
    await accept(ctx);
    assert.equal((await delivery(ctx.orderNumber, null, { deliveryBy: 'self' })).status, 401);
    assert.equal((await delivery(ctx.orderNumber, ctx.dinerToken, { deliveryBy: 'self' })).status, 401);
  });
});

describe('the answers that are not a choice', () => {
  it('refuses a value that is not one of the two, and leaves the order as it was', async () => {
    const ctx = await placeOrder();
    const res = await accept(ctx, { deliveryBy: 'bike' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'BAD_INPUT');
    assert.equal((await stored(ctx.orderNumber)).status, 'placed', 'a typo must not accept the order');
    assert.deepEqual(searches, []);

    await accept(ctx);
    assert.equal((await delivery(ctx.orderNumber, ctx.admin, { deliveryBy: 'bike' })).status, 400);
    assert.equal((await delivery(ctx.orderNumber, ctx.admin, {})).status, 400);
  });

  it('an accept with no choice at all is exactly what it always was', async () => {
    const ctx = await placeOrder();
    const res = await accept(ctx);
    assert.equal(res.status, 200);
    assert.equal(res.body.delivery, null);
    assert.equal(sent.length, 0);
    assert.deepEqual(searches, [ctx.orderNumber], 'the automatic search is still what an older app gets');
    assert.equal((await stored(ctx.orderNumber)).delivery.method, '');
  });

  it('has no delivery to arrange on a counter-pickup order', async () => {
    const ctx = await placeOrder({ fulfilment: 'pickup', deliveryAddress: undefined });
    const res = await accept(ctx, { deliveryBy: 'driver' });
    assert.equal(res.status, 200);
    assert.equal(sent.length, 0, 'nobody is asked to deliver a bag the diner is collecting');
    assert.equal((await stored(ctx.orderNumber)).delivery.method, '');

    const again = await delivery(ctx.orderNumber, ctx.admin, { deliveryBy: 'driver' });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'NOT_A_DELIVERY');
  });
});

describe('the automatic search stays out of it', () => {
  it('refuses to start for an order the restaurant is delivering', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'self' });
    const result = await realStart(ctx.orderNumber, { reason: 'food is ready' });
    assert.equal(result.started, false);
    assert.equal(result.reason, 'the restaurant is arranging the delivery');
  });

  it('is not restarted by the "food is ready" retry either', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'driver' });
    searches.length = 0;
    await status(ctx.orderNumber, ctx.admin, { status: 'preparing' });
    await status(ctx.orderNumber, ctx.admin, { status: 'ready' });
    assert.deepEqual(searches, []);
  });
});

describe('finishing a website order - the restaurant says "taken", the diner says "delivered"', () => {
  const upToReady = async (ctx) => {
    await status(ctx.orderNumber, ctx.admin, { status: 'preparing' });
    return status(ctx.orderNumber, ctx.admin, { status: 'ready' });
  };
  /* The diner's button on the tracking page. */
  const confirm = (ctx, token = ctx.dinerToken) => call(
    'PATCH', `/api/v2/food-partners/orders/${ctx.orderNumber}/delivered`, { token },
  );
  const onTheWay = async (deliveryBy = 'self', over = {}) => {
    const ctx = await placeOrder(over);
    await accept(ctx, { deliveryBy });
    await upToReady(ctx);
    const out = await status(ctx.orderNumber, ctx.admin, { status: 'picked_up' });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    return ctx;
  };

  it('offers "picked up" only on an order the restaurant arranged - an app rider makes that move on the rest', async () => {
    const plain = await placeOrder();
    await accept(plain);
    const plainReady = await upToReady(plain);
    assert.deepEqual(plainReady.body.data.moves, [], 'nothing more for the restaurant on an ordinary ready order');
    const refused = await status(plain.orderNumber, plain.admin, { status: 'picked_up' });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, 'INVALID_TRANSITION');
  });

  it('walks ready -> taken by the delivery boy -> delivered by the diner, and the diner sees each', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'driver' });
    const ready = await upToReady(ctx);
    assert.deepEqual(ready.body.data.moves, ['picked_up']);

    const out = await status(ctx.orderNumber, ctx.admin, { status: 'picked_up' });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.deepEqual(out.body.data.moves, [], 'the restaurant\'s part is done - "delivered" is not its word');
    let seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    assert.equal(seen.status, 'onTheWay');
    const taken = seen.riderTrack.find((s) => s.label === 'Picked up · on the way');
    assert.ok(taken.done);
    assert.equal(taken.note, 'The delivery boy has picked up your order', 'the diner is told');
    assert.equal(seen.live, true);
    const last = seen.riderTrack[seen.riderTrack.length - 1];
    assert.equal(last.label, 'Delivered');
    assert.equal(last.note, 'Confirm below when it arrives', 'and told where to say it arrived');

    const done = await confirm(ctx);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.data.status, 'delivered');
    seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    assert.equal(seen.status, 'delivered');
    assert.equal(seen.live, false);
    assert.ok(seen.riderTrack.some((s) => s.label === 'Delivered' && s.done));
  });

  it('does not let the restaurant mark its own order delivered - that is the diner\'s word', async () => {
    const ctx = await onTheWay();
    for (const body of [{ status: 'delivered' }, { status: 'delivered', code: '7391' }]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await status(ctx.orderNumber, ctx.admin, body);
      assert.equal(res.status, 409, JSON.stringify(body));
      assert.equal(res.body.code, 'INVALID_TRANSITION');
    }
    const row = await stored(ctx.orderNumber);
    assert.equal(row.status, 'picked_up');
    assert.equal(row.delivery.deliveredAt, null);
    assert.equal(row.paymentStatus, 'pending', 'and no cash is marked as collected');
  });

  it('marks cash collected, and says who said so, when the diner confirms', async () => {
    const ctx = await onTheWay();
    const res = await confirm(ctx);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const row = await stored(ctx.orderNumber);
    assert.equal(row.status, 'delivered');
    assert.ok(row.delivery.deliveredAt);
    assert.equal(row.paymentStatus, 'paid', 'cash taken at the door');
    const event = row.statusHistory.find((e) => e.status === 'delivered');
    assert.equal(event.by, 'customer');
  });

  it('is the same answer if the diner presses it twice - it IS delivered', async () => {
    const ctx = await onTheWay();
    assert.equal((await confirm(ctx)).status, 200);
    const again = await confirm(ctx);
    assert.equal(again.status, 200);
    assert.equal(again.body.data.status, 'delivered');
    const row = await stored(ctx.orderNumber);
    assert.equal(row.statusHistory.filter((e) => e.status === 'delivered').length, 1, 'one delivery, one record');
  });

  it('refuses until the delivery boy has taken it - "delivered" cannot be said about food still at the pass', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'self' });
    for (const stage of [null, 'preparing', 'ready']) {
      if (stage) {
        // eslint-disable-next-line no-await-in-loop
        await status(ctx.orderNumber, ctx.admin, { status: stage });
      }
      // eslint-disable-next-line no-await-in-loop
      const res = await confirm(ctx);
      assert.equal(res.status, 409, `at ${stage || 'accepted'}`);
      assert.equal(res.body.code, 'NOT_ON_THE_WAY');
    }
    assert.notEqual((await stored(ctx.orderNumber)).status, 'delivered');
  });

  it('refuses another diner, and a request with no session', async () => {
    const ctx = await onTheWay();
    const other = await Customer.create({
      customerId: 'cus_other', phone: '+919222222222', name: 'Somebody Else', phoneVerifiedAt: new Date(),
    });
    assert.equal((await confirm(ctx, signCustomerToken(other))).status, 404, 'not their order');
    assert.equal((await confirm(ctx, null)).status, 401);
    assert.equal((await confirm(ctx, ctx.admin)).status, 401, 'a restaurant\'s session is not a diner\'s');
    assert.equal((await stored(ctx.orderNumber)).status, 'picked_up');
  });

  it('is not on offer for an order an app rider is carrying - the rider closes that one', async () => {
    const ctx = await placeOrder({ channel: 'app' });
    await accept(ctx);
    await FoodOrder.updateOne({ orderNumber: ctx.orderNumber }, { status: 'picked_up' });
    const res = await confirm(ctx);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'NOT_CONFIRMABLE');
    assert.equal((await stored(ctx.orderNumber)).status, 'picked_up');
  });

  it('never shows the diner a delivery code on a website order - nobody is asked for one', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'self' });
    await upToReady(ctx);
    for (const move of [null, 'picked_up']) {
      if (move) {
        // eslint-disable-next-line no-await-in-loop
        await status(ctx.orderNumber, ctx.admin, { status: move });
      }
      // eslint-disable-next-line no-await-in-loop
      const res = await diner(ctx.orderNumber, ctx.dinerToken);
      const seen = res.body.data.order;
      assert.equal(seen.deliveryOtp, '');
      assert.ok(!JSON.stringify(res.body).includes('7391'), 'not anywhere in the reply');
      assert.ok(!seen.riderTrack.some((s) => /code/i.test(s.note || '')), 'and no step says it is needed');
    }
  });

  it('never sends the diner\'s code to the restaurant', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'self' });
    const ready = await upToReady(ctx);
    const list = await call('GET', '/api/v1/restaurant-admin/orders?status=ready', { token: ctx.admin });
    for (const body of [ready.body, list.body]) {
      assert.ok(!JSON.stringify(body).includes('7391'), 'the code is the diner\'s and stays theirs');
    }
  });

  it('cannot mark an order delivered that was never picked up', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'self' });
    await upToReady(ctx);
    const res = await status(ctx.orderNumber, ctx.admin, { status: 'delivered' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'INVALID_TRANSITION');
  });
});

describe('where an order was placed decides how it is delivered', () => {
  const confirmPath = (ref) => `/api/v2/food-partners/orders/${ref}/delivered`;

  it('records a website order as `web`, and anything else as `app`', async () => {
    const first = await placeOrder({ channel: 'web' });
    assert.equal((await stored(first.orderNumber)).channel, 'web');

    const body = (channel) => ({
      restaurantId: 'FP-TEST0001',
      lines: [{ productId: 'FPI-TEST0001', quantity: 2 }],
      paymentMode: 'cod',
      fulfilment: 'delivery',
      deliveryAddress: '12 Test Lane, Testville',
      customerName: 'Test Diner',
      ...(channel === undefined ? {} : { channel }),
    });
    /* What the app sends (nothing), and what nobody should be sending. Only the
       exact word "web" is the website; the rest is the app's flow. */
    for (const sentValue of [undefined, 'app', 'mobile', 'WEB', 'Web', '']) {
      // eslint-disable-next-line no-await-in-loop
      const placed = await call('POST', '/api/v2/food-partners/orders', { token: first.dinerToken, body: body(sentValue) });
      assert.equal(placed.status, 201, JSON.stringify(placed.body));
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await stored(placed.body.data.orderNumber)).channel, 'app', `sent ${JSON.stringify(sentValue)}`);
    }
  });

  it('asks the restaurant who delivers a WEBSITE order - and searches for no rider', async () => {
    const ctx = await placeOrder({ channel: 'web' });
    const res = await accept(ctx, { deliveryBy: 'self' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.channel, 'web');
    assert.equal((await stored(ctx.orderNumber)).delivery.method, 'self');
    assert.deepEqual(searches, []);
  });

  it('leaves an APP order exactly as it was: no choice, no WhatsApp, and the real driver search starts', async () => {
    const ctx = await placeOrder({ channel: 'app' });
    const res = await accept(ctx, { deliveryBy: 'driver' }); // an older console sends it for every order
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.delivery, null, 'the choice was not acted on');
    assert.equal(sent.length, 0, 'the delivery desk is never messaged about an app order');
    assert.deepEqual(searches, [ctx.orderNumber], 'the dispatcher looks for a real driver');
    assert.equal((await stored(ctx.orderNumber)).delivery.method, '');
    assert.equal(res.body.data.deliveryChoice.method, '');
  });

  it('gives an app order no "who delivers" to change afterwards either', async () => {
    const ctx = await placeOrder({ channel: 'app' });
    await accept(ctx);
    const res = await delivery(ctx.orderNumber, ctx.admin, { deliveryBy: 'self' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'NOT_A_WEBSITE_ORDER');
    assert.equal(sent.length, 0);
  });

  it('gives an app order no restaurant move past "ready" - the driver\'s own app does the rest', async () => {
    const ctx = await placeOrder({ channel: 'app' });
    await accept(ctx);
    await status(ctx.orderNumber, ctx.admin, { status: 'preparing' });
    const ready = await status(ctx.orderNumber, ctx.admin, { status: 'ready' });
    assert.deepEqual(ready.body.data.moves, []);
    assert.equal((await status(ctx.orderNumber, ctx.admin, { status: 'picked_up' })).status, 409);
  });

  it('keeps an app order\'s real rider card and code for the diner', async () => {
    const ctx = await placeOrder({ channel: 'app' });
    await accept(ctx);
    await FoodOrder.updateOne({ orderNumber: ctx.orderNumber }, {
      'delivery.driverId': 'DRV-1', 'delivery.driverName': 'Asha Rao', 'delivery.assignedAt': new Date(), 'dispatch.state': 'assigned',
    });
    const seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    assert.equal(seen.rider.name, 'Asha Rao');
    assert.equal(seen.deliveryOtp, '7391', 'a real rider still asks for it at the door');
    assert.ok(seen.riderTrack.some((s) => s.label === 'Handed over' && /Needs code 7391/.test(s.note)));
  });

  it('treats a website order accepted from the partner app - which sends no choice - as the app\'s: a real driver is searched for', async () => {
    const ctx = await placeOrder({ channel: 'web' });
    const res = await accept(ctx); // no deliveryBy: what the partner app sends
    assert.equal(res.status, 200);
    assert.deepEqual(searches, [ctx.orderNumber]);
    assert.equal((await stored(ctx.orderNumber)).delivery.method, '');
    assert.ok(confirmPath(ctx.orderNumber));
  });
});

describe('who holds the cash', () => {
  const deliverCod = async (deliveryBy) => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy });
    await status(ctx.orderNumber, ctx.admin, { status: 'preparing' });
    await status(ctx.orderNumber, ctx.admin, { status: 'ready' });
    await status(ctx.orderNumber, ctx.admin, { status: 'picked_up' });
    const res = await call('PATCH', `/api/v2/food-partners/orders/${ctx.orderNumber}/delivered`, { token: ctx.dinerToken });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return ctx;
  };

  it('does not pay a kitchen again for cash its own person took at the door', async () => {
    await deliverCod('self');
    const balance = await availableFor('FP-TEST0001');
    assert.equal(balance.available, 0, 'the money is already in the restaurant\'s till');
    assert.equal(balance.collectedByYouOrders, 1);
    assert.ok(balance.collectedByYou > 0);
  });

  it('does pay for cash the desk\'s driver collects - that comes back to Lampose', async () => {
    await deliverCod('driver');
    const balance = await availableFor('FP-TEST0001');
    assert.equal(balance.availableOrders, 1);
    assert.ok(balance.available > 0);
    assert.equal(balance.collectedByYouOrders, 0);
  });
});

describe('the tracking page tells the truth about the kitchen and the search', () => {
  it('draws "Ready" as finished, not as still in progress', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'self' });
    await status(ctx.orderNumber, ctx.admin, { status: 'preparing' });

    let seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    const cooking = seen.kitchenTrack.find((s) => s.label === 'Cooking');
    assert.equal(cooking.current, true, 'cooking IS what is happening');

    await status(ctx.orderNumber, ctx.admin, { status: 'ready' });
    seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    const ready = seen.kitchenTrack.find((s) => s.label === 'Ready');
    assert.equal(ready.done, true);
    assert.equal(ready.current, false, 'the kitchen has finished; it is the ring that made it look otherwise');
    assert.ok(!seen.kitchenTrack.some((s) => s.current), 'nothing on the kitchen\'s track is in progress');
  });

  it('says when the search FIRST began, and how many times it has been tried since', async () => {
    const ctx = await placeOrder();
    await accept(ctx);
    await status(ctx.orderNumber, ctx.admin, { status: 'preparing' });

    /* The real dispatcher, twice, in a database with no riders in it. */
    await realStart(ctx.orderNumber, { reason: 'accepted' });
    const first = (await stored(ctx.orderNumber)).dispatch;
    assert.equal(first.attempts, 1);
    assert.ok(first.startedAt);

    await sleep(25);
    await realStart(ctx.orderNumber, { reason: 'food is ready' });
    const second = (await stored(ctx.orderNumber)).dispatch;
    assert.equal(second.attempts, 2);
    assert.equal(
      new Date(second.startedAt).getTime(), new Date(first.startedAt).getTime(),
      'a retry does not move the start time forward',
    );

    const seen = (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
    const looking = seen.riderTrack.find((s) => s.label === 'Looking for a rider');
    assert.match(looking.note, /tried 2 times/);
  });
});

describe('the tracking page reads an order\'s progress accurately', () => {
  /* What a diner sees on each step: ticked, in progress (a ring), or still coming (grey). */
  const mark = (s) => (s.current ? 'ring' : s.done ? 'tick' : 'grey');
  const kitchen = (order) => order.kitchenTrack.map((s) => `${s.label}:${mark(s)}`);
  const rider = (order) => order.riderTrack.map((s) => `${s.label}:${mark(s)}`);
  const look = async (ctx) => (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;

  it('shows only what has happened while the kitchen has not answered', async () => {
    const ctx = await placeOrder();
    assert.deepEqual(kitchen(await look(ctx)), ['Order placed:tick'],
      'no "Accepted" waiting in grey - the kitchen may yet say no');
  });

  it('TICKS "Accepted" the moment the kitchen accepts - it is not a ring - and shows cooking as what comes next', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'self' });
    const seen = await look(ctx);

    assert.deepEqual(kitchen(seen), ['Order placed:tick', 'Accepted:tick', 'Cooking:grey']);
    assert.ok(!seen.kitchenTrack.some((s) => s.current), 'nothing is "in progress" - the kitchen has only accepted');
    const coming = seen.kitchenTrack[2];
    assert.equal(coming.at, undefined, 'a step that has not happened carries no time');
    assert.ok(seen.kitchenTrack[1].at, 'and one that has, does');
  });

  it('rings cooking while it is happening, and shows ready as what comes next', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'self' });
    await status(ctx.orderNumber, ctx.admin, { status: 'preparing' });

    assert.deepEqual(kitchen(await look(ctx)),
      ['Order placed:tick', 'Accepted:tick', 'Cooking:ring', 'Ready:grey']);
  });

  it('ticks everything once the food is ready, with nothing coming and nothing in progress', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'self' });
    await status(ctx.orderNumber, ctx.admin, { status: 'preparing' });
    await status(ctx.orderNumber, ctx.admin, { status: 'ready' });

    assert.deepEqual(kitchen(await look(ctx)),
      ['Order placed:tick', 'Accepted:tick', 'Cooking:tick', 'Ready:tick']);
  });

  it('shows no step coming on an order the kitchen refused', async () => {
    const ctx = await placeOrder();
    await status(ctx.orderNumber, ctx.admin, { status: 'rejected', reason: 'Out of naan' });
    const seen = await look(ctx);

    assert.deepEqual(kitchen(seen), ['Order placed:tick', 'Refused by the kitchen:tick']);
    assert.ok(!rider(seen).some((s) => /Picked up|Handed over/.test(s)), 'and nobody is coming to collect it');
  });

  it('shows the whole journey on the rider\'s side - including the part where somebody carries it', async () => {
    const ctx = await placeOrder();
    await accept(ctx, { deliveryBy: 'self' });
    let seen = await look(ctx);
    assert.deepEqual(rider(seen), ['Driver assigned:tick', 'Picked up · on the way:grey', 'Delivered:grey']);
    assert.equal(seen.riderTrack[1].at, undefined);

    await status(ctx.orderNumber, ctx.admin, { status: 'preparing' });
    await status(ctx.orderNumber, ctx.admin, { status: 'ready' });
    await status(ctx.orderNumber, ctx.admin, { status: 'picked_up' });
    seen = await look(ctx);
    assert.deepEqual(rider(seen), ['Driver assigned:tick', 'Picked up · on the way:ring', 'Delivered:grey']);

    await call('PATCH', `/api/v2/food-partners/orders/${ctx.orderNumber}/delivered`, { token: ctx.dinerToken });
    seen = await look(ctx);
    assert.deepEqual(rider(seen), ['Driver assigned:tick', 'Picked up · on the way:tick', 'Delivered:tick']);
  });

  it('keeps the search\'s own steps when the app is finding the rider', async () => {
    const ctx = await placeOrder({ channel: 'app' });
    await accept(ctx); // an app order: the app's own rider search
    await FoodOrder.updateOne({ orderNumber: ctx.orderNumber }, {
      'dispatch.state': 'unassigned', 'dispatch.attempts': 1, 'dispatch.startedAt': new Date(),
      'dispatch.failureReason': 'no rider is online right now',
    });
    const seen = await look(ctx);
    assert.deepEqual(rider(seen),
      ['Looking for a rider:tick', 'No rider found yet:ring', 'Picked up · on the way:grey', 'Handed over:grey']);
  });
});

describe('the door code on the website', () => {
  const look = async (ctx) => (await diner(ctx.orderNumber, ctx.dinerToken)).body.data.order;
  const codeNote = (seen) => (seen.riderTrack[seen.riderTrack.length - 1] || {}).note || '';

  it('is never shown for a website order, from the moment it is placed', async () => {
    const ctx = await placeOrder({ channel: 'web' });
    const seen = await look(ctx);

    assert.equal(seen.deliveryOtp, '', 'no code for the diner to read out');
    assert.doesNotMatch(codeNote(seen), /code/i);
    assert.equal(seen.riderTrack[seen.riderTrack.length - 1].label, 'Delivered',
      'and the last step already says Delivered, so the word does not change when the restaurant chooses');
  });

  it('stays hidden once the restaurant arranged the delivery', async () => {
    const ctx = await placeOrder({ channel: 'web' });
    await accept(ctx, { deliveryBy: 'self' });
    const seen = await look(ctx);

    assert.equal(seen.deliveryOtp, '');
    assert.doesNotMatch(codeNote(seen), /code/i);
  });

  it('appears on a website order only if a real rider of ours has taken it', async () => {
    const ctx = await placeOrder({ channel: 'web' });
    await accept(ctx); // no choice: the app's own search
    let seen = await look(ctx);
    assert.equal(seen.deliveryOtp, '', 'searching is not a rider to read a code to');

    await FoodOrder.updateOne({ orderNumber: ctx.orderNumber }, {
      'delivery.driverId': 'DRV-TEST0001', 'delivery.driverName': 'Real Rider', 'delivery.assignedAt': new Date(),
      'dispatch.state': 'assigned',
    });
    seen = await look(ctx);
    assert.equal(seen.deliveryOtp, '7391', 'a real rider will ask for it');
    assert.match(codeNote(seen), /Needs code 7391/);
  });

  it('is unchanged on an app order: always carried, before and after a rider', async () => {
    const ctx = await placeOrder({ channel: 'app' });
    const seen = await look(ctx);

    assert.equal(seen.deliveryOtp, '7391');
    assert.match(codeNote(seen), /Needs code 7391/);
    assert.equal(seen.riderTrack[seen.riderTrack.length - 1].label, 'Handed over');
  });
});

describe('and it stayed that way', () => {
  it('made no attempt to reach a real provider', () => {
    assert.deepEqual(blocked, [], 'something tried to send a request out of this machine: ' + blocked.join(', '));
  });
});
