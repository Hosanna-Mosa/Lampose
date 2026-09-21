/* ══════════════════════════════════════════════════════════════════════════
   The link in "you have a new order" — one order, no sign-in.

   An owner taps a link in WhatsApp and must be able to accept the order, with no
   password, in a browser that remembers nothing. That is a door with no lock on
   it in the ordinary sense, so what these tests pin down is the lock it DOES
   have: the code in the link opens ONE order and nothing else.

     · the right code opens its order, and the console's own handlers run - the
       same cooking time, the same choice of who delivers, the same WhatsApp to
       the desk (and "delivered" is still the diner's, not the restaurant's)
     · a wrong code, another order's code, another restaurant's code, no code,
       and an order that does not exist all get the SAME refusal
     · a link cannot reach the queue, the menu, or any other order
     · it expires, and it dies when the signing secret changes
     · it fails with 403 or 410, never 401 - a 401 signs a person out of the
       console they may be using in another tab

   Nothing here can reach a real phone: credentials are blanked before anything
   loads, outbound requests are blocked, and the WhatsApp sender is replaced.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TWILIO_DELIVERY_REQUEST_CONTENT_SID', 'TWILIO_FOOD_ORDER_CONTENT_SID', 'TWILIO_FOOD_ORDER_BUTTON_SID',
  'DELIVERY_PARTNER_WHATSAPP', 'ORDER_LINK_TTL_HOURS',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL', 'EXPO_ACCESS_TOKEN',
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
  blocked.push(typeof target === 'string' ? target : hostOf(target));
  throw new Error('Blocked an outbound request in a test');
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
  describe, it, before, after, beforeEach, afterEach,
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
const { codeFor, linkSuffix, sameCode } = require('../src/modules/foodpartners/orderLink.service');
const { redact } = require('../src/shared/middleware/requestLogger');
const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
const dispatch = require('../src/modules/drivers/foodDispatch.service');

withDatabase();

let server;
let base;
let sent = [];
const realSender = twilio.sendDeliveryRequest;
const realStart = dispatch.startDispatch;

before(async () => {
  twilio.sendDeliveryRequest = async (args) => { sent.push(args); return { success: true, messageSid: 'SMTEST0001' }; };
  dispatch.startDispatch = async () => ({ started: false });
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

beforeEach(() => { sent = []; });

afterEach(() => { process.env.ORDER_LINK_TTL_HOURS = ''; });

const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

/* ── Seed ─────────────────────────────────────────────────────────────── */

const makeKitchen = (over = {}) => FoodRestaurant.create({
  restaurantId: 'FP-TEST0001',
  restaurantName: 'Test Kitchen',
  ownerName: 'Owner',
  ownerPhone: '+919000000001',
  ownerEmail: 'owner1@example.invalid',
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
  ...over,
});

const makeDish = (over = {}) => FoodProduct.create({
  productId: 'FPI-TEST0001',
  restaurantId: 'FP-TEST0001',
  productName: 'Veg Hakka Noodles',
  category: 'Noodles',
  price: 120,
  isVeg: 'veg',
  isAvailable: true,
  ...over,
});

const dinerToken = async () => {
  const customer = await Customer.create({
    customerId: 'cus_diner1', phone: '+919111111111', name: 'Test Diner', phoneVerifiedAt: new Date(),
  });
  return signCustomerToken(customer);
};

/** A placed cash order at FP-TEST0001, with its codes pinned so nothing depends on a random draw. */
const placeOrder = async (token, restaurantId = 'FP-TEST0001', productId = 'FPI-TEST0001') => {
  const placed = await call('POST', '/api/v2/food-partners/orders', {
    token,
    body: {
      restaurantId,
      lines: [{ productId, quantity: 2 }],
      paymentMode: 'cod',
      fulfilment: 'delivery',
      channel: 'web',
      deliveryAddress: '12 Test Lane, Testville',
      customerName: 'Test Diner',
    },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  const { orderNumber } = placed.body.data;
  await FoodOrder.updateOne({ orderNumber }, { deliveryOtp: '7391', pickupCode: '1234' });
  return orderNumber;
};

const world = async () => {
  await makeKitchen();
  await makeDish();
  const token = await dinerToken();
  const orderNumber = await placeOrder(token);
  return { token, orderNumber, code: codeFor('FP-TEST0001', orderNumber) };
};

const view = (orderNumber, code) => call('GET', `/api/v1/order-link/${orderNumber}?token=${encodeURIComponent(code)}`);
const move = (orderNumber, code, body) => call('PATCH', `/api/v1/order-link/${orderNumber}/status?token=${encodeURIComponent(code)}`, { body });
const deliver = (orderNumber, code, body) => call('PATCH', `/api/v1/order-link/${orderNumber}/delivery?token=${encodeURIComponent(code)}`, { body });
const stored = (orderNumber) => FoodOrder.findOne({ orderNumber }).lean();

/* ══════════════════════════════════════════════════════════════════════════ */

describe('the code', () => {
  it('is 22 URL-safe characters, and the same for the same order every time', () => {
    const a = codeFor('FP-A', 'LO111111');
    assert.match(a, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(codeFor('FP-A', 'LO111111'), a, 'deterministic - a resent alert carries the same link');
  });

  it('differs for another order, and for another restaurant', () => {
    const a = codeFor('FP-A', 'LO111111');
    assert.notEqual(codeFor('FP-A', 'LO111112'), a);
    assert.notEqual(codeFor('FP-B', 'LO111111'), a);
  });

  it('cannot be made without an order and a restaurant', () => {
    assert.equal(codeFor('', 'LO111111'), null);
    assert.equal(codeFor('FP-A', ''), null);
    assert.equal(codeFor(undefined, undefined), null);
  });

  it('is compared exactly - a prefix, a longer string and nothing all fail', () => {
    const a = codeFor('FP-A', 'LO111111');
    assert.equal(sameCode(a, a), true);
    assert.equal(sameCode(a.slice(0, 21), a), false);
    assert.equal(sameCode(`${a}x`, a), false);
    assert.equal(sameCode('', a), false);
    assert.equal(sameCode(undefined, a), false);
    assert.equal(sameCode(a, null), false, 'no expected code means nothing matches');
  });

  it('becomes the suffix of the link: the order number, then the token', () => {
    const code = codeFor('FP-A', 'LO111111');
    assert.equal(linkSuffix('FP-A', 'LO111111'), `LO111111&token=${code}`);
  });

  it('is never written to a log - the parameter name is on the redaction list', () => {
    assert.equal(redact({ token: 'abc', order: 'LO1' }).token, '***REDACTED***');
    assert.equal(redact({ token: 'abc', order: 'LO1' }).order, 'LO1');
  });
});

describe('opening the order from its link', () => {
  it('shows the order - its items, the customer\'s address and phone - with no session at all', async () => {
    const { orderNumber, code } = await world();
    const res = await view(orderNumber, code);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.orderNumber, orderNumber);
    assert.equal(res.body.data.status, 'placed');
    assert.equal(res.body.data.lines[0].productName, 'Veg Hakka Noodles');
    assert.equal(res.body.data.deliveryAddress, '12 Test Lane, Testville');
    assert.deepEqual(res.body.data.moves, ['accepted', 'rejected'], 'what may be done next, from the server');
  });

  it('never shows the customer\'s delivery code - it is the one thing that proves somebody was at the door', async () => {
    const { orderNumber, code } = await world();
    assert.ok(!JSON.stringify((await view(orderNumber, code)).body).includes('7391'));
  });

  it('still works after the order has been accepted, so a second tap shows where it stands', async () => {
    const { orderNumber, code } = await world();
    await move(orderNumber, code, { status: 'accepted', promisedMinutes: 20, deliveryBy: 'self' });
    const res = await view(orderNumber, code);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'accepted');
  });
});

describe('accepting from the link - exactly what the console does', () => {
  it('accepts with the cooking time and "we will deliver it ourselves"', async () => {
    const { orderNumber, code, token } = await world();
    const res = await move(orderNumber, code, { status: 'accepted', promisedMinutes: 25, deliveryBy: 'self' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.delivery, { method: 'self', ok: true, sent: null, message: '' });
    const row = await stored(orderNumber);
    assert.equal(row.status, 'accepted');
    assert.equal(row.promisedMinutes, 25);
    assert.equal(row.delivery.method, 'self');

    const seen = await call('GET', `/api/v2/food-web/orders/${orderNumber}`, { token });
    assert.equal(seen.body.data.order.riderTrack[0].label, 'Driver assigned');
  });

  it('accepts and asks the delivery desk for a driver on WhatsApp', async () => {
    const { orderNumber, code } = await world();
    const res = await move(orderNumber, code, { status: 'accepted', promisedMinutes: 20, deliveryBy: 'driver' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.delivery.sent, true);
    assert.equal(sent.length, 1, 'one WhatsApp to the desk');
    assert.equal(sent[0].orderNumber, orderNumber);
    assert.equal(sent[0].to, config.deliveryDesk.whatsapp);
  });

  it('can resend a driver request that did not go, and change the choice', async () => {
    const { orderNumber, code } = await world();
    await move(orderNumber, code, { status: 'accepted', deliveryBy: 'self' });
    const res = await deliver(orderNumber, code, { deliveryBy: 'driver' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.delivery.sent, true);
    assert.equal((await stored(orderNumber)).delivery.method, 'driver');
  });

  it('can refuse, with a reason the diner is told', async () => {
    const { orderNumber, code } = await world();
    const res = await move(orderNumber, code, { status: 'rejected', reason: 'Out of noodles' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const row = await stored(orderNumber);
    assert.equal(row.status, 'rejected');
    assert.equal(row.rejectionReason, 'Out of noodles');
  });

  it('carries the order through to "taken by the delivery boy" - and no further: delivered is the diner\'s word', async () => {
    const { orderNumber, code, token } = await world();
    await move(orderNumber, code, { status: 'accepted', deliveryBy: 'self' });
    await move(orderNumber, code, { status: 'preparing' });
    await move(orderNumber, code, { status: 'ready' });
    const out = await move(orderNumber, code, { status: 'picked_up' });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.deepEqual(out.body.data.moves, [], 'nothing left for the restaurant to press');

    for (const body of [{ status: 'delivered' }, { status: 'delivered', code: '7391' }]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await move(orderNumber, code, body);
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'INVALID_TRANSITION');
    }
    assert.equal((await stored(orderNumber)).status, 'picked_up');

    /* The diner closes it, on their own session. */
    const done = await call('PATCH', `/api/v2/food-partners/orders/${orderNumber}/delivered`, { token });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal((await stored(orderNumber)).status, 'delivered');
  });

  it('cannot do what the state machine forbids - a closed order stays closed', async () => {
    const { orderNumber, code } = await world();
    await move(orderNumber, code, { status: 'rejected', reason: 'no' });
    const res = await move(orderNumber, code, { status: 'accepted' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'INVALID_TRANSITION');
    assert.equal((await stored(orderNumber)).status, 'rejected');
  });
});

describe('a link that is not the right one', () => {
  it('refuses a missing code, a wrong code and a truncated one - all the same way, and never with a 401', async () => {
    const { orderNumber, code } = await world();
    const attempts = [
      await call('GET', `/api/v1/order-link/${orderNumber}`),
      await view(orderNumber, 'not-the-code'),
      await view(orderNumber, code.slice(0, 10)),
      await view(orderNumber, `${code}x`),
    ];
    for (const res of attempts) {
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'LINK_INVALID');
      assert.notEqual(res.status, 401, 'a 401 would sign the owner out of the console in another tab');
    }
  });

  it('gives an order that does not exist the very same answer as a wrong code - no way to count orders', async () => {
    const { orderNumber, code } = await world();
    const wrong = await view(orderNumber, 'wrong-code-wrong-code-x');
    const missing = await view('LO000000', codeFor('FP-TEST0001', 'LO000000'));
    assert.equal(missing.status, wrong.status);
    assert.deepEqual(missing.body, wrong.body);
    assert.ok(code);
  });

  it('will not let one order\'s code open, or act on, another order', async () => {
    const { token, orderNumber, code } = await world();
    const second = await placeOrder(token);

    const looked = await view(second, code);
    assert.equal(looked.status, 403);
    const acted = await move(second, code, { status: 'accepted', deliveryBy: 'self' });
    assert.equal(acted.status, 403);
    assert.equal((await stored(second)).status, 'placed', 'the other order was not touched');
    assert.equal((await view(orderNumber, code)).status, 200, 'and its own still opens');
  });

  it('will not accept a code minted for the same order number under another restaurant', async () => {
    const { orderNumber } = await world();
    const res = await view(orderNumber, codeFor('FP-SOMEONE-ELSE', orderNumber));
    assert.equal(res.status, 403);
  });

  it('cannot be pointed at a different restaurant\'s order by swapping the number', async () => {
    await makeKitchen();
    await makeDish();
    await makeKitchen({
      restaurantId: 'FP-TEST0002', restaurantName: 'Other Kitchen', ownerPhone: '+919000000002', ownerEmail: 'two@example.invalid',
    });
    await makeDish({ productId: 'FPI-TEST0002', restaurantId: 'FP-TEST0002' });
    const token = await dinerToken();
    const mine = await placeOrder(token, 'FP-TEST0001', 'FPI-TEST0001');
    const theirs = await placeOrder(token, 'FP-TEST0002', 'FPI-TEST0002');

    const res = await view(theirs, codeFor('FP-TEST0001', mine));
    assert.equal(res.status, 403);
  });
});

describe('what a link is NOT', () => {
  it('is not a console session - the queue, the menu and the summary still need the password', async () => {
    const { code } = await world();
    for (const path of ['/orders?status=placed', '/menu', '/summary', '/me']) {
      // eslint-disable-next-line no-await-in-loop
      const asBearer = await call('GET', `/api/v1/restaurant-admin${path}`, { token: code });
      assert.equal(asBearer.status, 401, `${path} with the link code as a bearer token`);
      // eslint-disable-next-line no-await-in-loop
      const asQuery = await call('GET', `/api/v1/restaurant-admin${path}${path.includes('?') ? '&' : '?'}token=${code}`);
      assert.equal(asQuery.status, 401, `${path} with the link code in the query`);
    }
  });

  it('has no route that lists orders', async () => {
    const { code } = await world();
    assert.equal((await call('GET', `/api/v1/order-link?token=${code}`)).status, 404);
    assert.equal((await call('GET', `/api/v1/order-link/?token=${code}`)).status, 404);
  });
});

describe('how long it lasts', () => {
  const placedHoursAgo = (orderNumber, hours) => FoodOrder.updateOne(
    { orderNumber }, { placedAt: new Date(Date.now() - hours * 60 * 60 * 1000) },
  );

  it('opens within a day of the order being placed', async () => {
    const { orderNumber, code } = await world();
    await placedHoursAgo(orderNumber, 23);
    assert.equal((await view(orderNumber, code)).status, 200);
  });

  it('has expired after a day - 410, and it says where to go instead', async () => {
    const { orderNumber, code } = await world();
    await placedHoursAgo(orderNumber, 25);

    const looked = await view(orderNumber, code);
    assert.equal(looked.status, 410);
    assert.equal(looked.body.code, 'LINK_EXPIRED');
    assert.match(looked.body.message, /Sign in to the restaurant console/);

    const acted = await move(orderNumber, code, { status: 'accepted', deliveryBy: 'self' });
    assert.equal(acted.status, 410);
    assert.equal((await stored(orderNumber)).status, 'placed', 'an expired link changes nothing');
  });

  it('honours ORDER_LINK_TTL_HOURS', async () => {
    const { orderNumber, code } = await world();
    await placedHoursAgo(orderNumber, 2);
    process.env.ORDER_LINK_TTL_HOURS = '1';
    assert.equal((await view(orderNumber, code)).status, 410);
    process.env.ORDER_LINK_TTL_HOURS = '3';
    assert.equal((await view(orderNumber, code)).status, 200);
  });

  it('dies when the signing secret changes - the way to revoke every link at once', async () => {
    const { orderNumber, code } = await world();
    const original = config.auth.jwtSecret;
    config.auth.jwtSecret = `${original}-rotated`;
    try {
      assert.equal((await view(orderNumber, code)).status, 403);
    } finally {
      config.auth.jwtSecret = original;
    }
    assert.equal((await view(orderNumber, code)).status, 200, 'and comes back with the old secret');
  });

  it('is unavailable, not open, when there is no signing secret at all', async () => {
    const { orderNumber, code } = await world();
    const was = config.auth.configured;
    config.auth.configured = false;
    try {
      const res = await view(orderNumber, code);
      assert.equal(res.status, 503);
      assert.equal(res.body.code, 'AUTH_NOT_CONFIGURED');
      assert.equal(codeFor('FP-TEST0001', orderNumber), null);
      assert.equal(linkSuffix('FP-TEST0001', orderNumber), orderNumber, 'the alert falls back to the plain link');
    } finally {
      config.auth.configured = was;
    }
  });
});

describe('an account that was not approved', () => {
  it('gets the console\'s own refusal from a link too', async () => {
    const { orderNumber, code } = await world();
    await FoodRestaurant.updateOne({ restaurantId: 'FP-TEST0001' }, { verificationStatus: 'rejected' });
    const res = await view(orderNumber, code);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_REJECTED');
  });
});

describe('and it stayed that way', () => {
  it('made no attempt to reach a real provider', () => {
    assert.deepEqual(blocked, [], `something tried to leave this machine: ${blocked.join(', ')}`);
  });
});
