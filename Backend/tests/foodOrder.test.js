/* ══════════════════════════════════════════════════════════════════════════
   Can a diner order? - the whole path, against the real app.

   This boots the real Express app on a real port, over a real (in-memory)
   MongoDB, and plays a diner through it: the kitchen they can see, the menu
   they read, the order they place, and the order they then read back on the
   website. Nothing is mocked except the outbound messages, so a green run means
   the pieces genuinely fit together.

   It exists because the website's "Place order" button was, for a long time, a
   preview that never reached the server - and nothing in the suite noticed,
   because nothing exercised the endpoint the button should be calling. This is
   that exercise. It tests the SERVER half; the website half is whether the
   button calls it.

   The refusals matter as much as the success. An order the server accepts for
   a closed kitchen, an unapproved one, a dish that is not on the menu, or at a
   price the client chose, is an order that reaches a real kitchen.
   ══════════════════════════════════════════════════════════════════════════ */
/*
 * ── This file must not be able to reach the outside world ───────────────────
 *
 * Placing an order notifies the kitchen by WhatsApp, and this checkout's
 * `.env` carries live Twilio credentials. The first version of this file did
 * not guard against that, and its runs sent real order alerts, from the real
 * account, to a phone number the test had invented. A test that places orders
 * must be incapable of that, not merely careful about it - so there are two
 * independent layers, and either one alone is enough.
 *
 *   1. The messaging credentials are blanked BEFORE anything is required.
 *      `dotenv` never overrides a variable that already exists - an empty
 *      string counts - so `.env` cannot put them back, and the Twilio and SMS
 *      modules see an unconfigured provider and refuse to send.
 *
 *   2. Every outbound request that is not to this machine is blocked, and
 *      counted. If layer 1 were ever undone by an import-order change, the
 *      send would throw here instead of reaching a real phone.
 */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
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

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const Customer = require('../src/modules/customers/customer.model');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
const { signRestaurantAdminToken } = require('../src/modules/foodpartners/restaurantAdmin.middleware');
const { stopAllDispatch } = require('../src/modules/drivers/foodDispatch.service');

withDatabase();

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  /* Accepting an order starts a rider search, which owns timers; left running
     they keep the process alive after every test has finished. */
  stopAllDispatch();
  await new Promise((resolve) => server.close(resolve));
});

describe('this file is hermetic', () => {
  it('has no messaging credentials to send with', () => {
    assert.equal(process.env.TWILIO_ACCOUNT_SID, '');
    assert.equal(process.env.TWILIO_AUTH_TOKEN, '');
    assert.equal(process.env.SMS_APIKEY, '');
  });

  it('blocks a request to anywhere but this machine', async () => {
    await assert.rejects(async () => fetch('https://api.twilio.com/2010-04-01/Accounts'), /Blocked an outbound request/);
    assert.throws(() => https.request('https://example.com/'), /Blocked an outbound request/);
    blocked.length = 0; // those two were on purpose
  });
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

/* ── Seed ─────────────────────────────────────────────────────────────── */

const makeKitchen = async (over = {}) => FoodRestaurant.create({
  restaurantId: 'FP-TEST0001',
  restaurantName: 'Test Kitchen',
  ownerName: 'Owner',
  ownerPhone: '+919000000001',
  ownerEmail: 'owner1@example.invalid',
  fssaiLicenseNumber: '12345678901234',
  cuisineTypes: ['Chinese'],
  verificationStatus: 'approved',
  isActive: true,
  /* The owner's own switch, so the test does not depend on what time it is. */
  openState: 'open',
  minOrderValue: 100,
  packagingCharge: 10,
  deliveryFee: { type: 'flat', amount: 20 },
  acceptsCod: true,
  acceptsOnlinePayment: true,
  ...over,
});

const makeDish = async (over = {}) => FoodProduct.create({
  productId: 'FPI-TEST0001',
  restaurantId: 'FP-TEST0001',
  productName: 'Veg Hakka Noodles',
  category: 'Noodles',
  price: 120,
  isVeg: 'veg',
  isAvailable: true,
  addOns: [{ name: 'Extra sauce', price: 10 }],
  ...over,
});

const makeDiner = async (over = {}) => {
  const customer = await Customer.create({
    customerId: 'cus_diner1',
    phone: '+919111111111',
    name: 'Test Diner',
    phoneVerifiedAt: new Date(),
    ...over,
  });
  return { customer, token: signCustomerToken(customer) };
};

const order = (over = {}) => ({
  restaurantId: 'FP-TEST0001',
  lines: [{ productId: 'FPI-TEST0001', quantity: 2, addOns: [{ name: 'Extra sauce' }] }],
  paymentMode: 'cod',
  fulfilment: 'delivery',
  deliveryAddress: '12 Test Lane, Testville',
  ...over,
});

/* ── What the diner can see ───────────────────────────────────────────── */

describe('browsing', () => {
  it('lists an approved, active kitchen with its menu', async () => {
    await makeKitchen();
    await makeDish();

    const feed = await call('GET', '/api/v2/food-web/kitchens');
    assert.equal(feed.status, 200);
    const kitchen = feed.body.data.kitchens.find((k) => k.id === 'FP-TEST0001');
    assert.ok(kitchen, 'the kitchen is on the feed');
    assert.equal(kitchen.openNow, true);
    assert.deepEqual(kitchen.sections, ['Noodles']);

    const menu = await call('GET', '/api/v2/food-web/kitchens/FP-TEST0001/dishes');
    assert.equal(menu.status, 200);
    assert.equal(menu.body.data.dishes[0].name, 'Veg Hakka Noodles');
    assert.equal(menu.body.data.dishes[0].price, 120);
  });

  it('never lists a kitchen that is pending, rejected or switched off', async () => {
    await makeKitchen({ restaurantId: 'FP-PENDING1', ownerPhone: '+919000000002', ownerEmail: 'a@example.invalid', verificationStatus: 'pending', isActive: false });
    await makeKitchen({ restaurantId: 'FP-REJECTED', ownerPhone: '+919000000003', ownerEmail: 'b@example.invalid', verificationStatus: 'rejected', isActive: false });
    await makeKitchen({ restaurantId: 'FP-SWITCHED', ownerPhone: '+919000000004', ownerEmail: 'c@example.invalid', isActive: false });
    await makeKitchen();

    const feed = await call('GET', '/api/v2/food-web/kitchens');
    assert.deepEqual(feed.body.data.kitchens.map((k) => k.id), ['FP-TEST0001']);

    for (const id of ['FP-PENDING1', 'FP-REJECTED', 'FP-SWITCHED']) {
      assert.equal((await call('GET', `/api/v2/food-web/kitchens/${id}`)).status, 404, id);
      assert.equal((await call('GET', `/api/v2/food-web/kitchens/${id}/dishes`)).status, 404, id);
    }
  });
});

/* ── Placing an order ─────────────────────────────────────────────────── */

describe('placing an order', () => {
  it('takes a cash order from a signed-in diner, and prices it itself', async () => {
    await makeKitchen();
    await makeDish();
    const { token } = await makeDiner();

    const placed = await call('POST', '/api/v2/food-partners/orders', {
      token,
      body: order({
        /* A client that tries to name its own price. Ignored: the server reads
           the price off the dish. */
        lines: [{ productId: 'FPI-TEST0001', quantity: 2, addOns: [{ name: 'Extra sauce' }], unitPrice: 1, lineTotal: 2 }],
      }),
    });

    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const saved = await FoodOrder.findOne({ restaurantId: 'FP-TEST0001' }).lean();
    assert.ok(saved, 'an order row exists');

    /* 2 x (120 + 10 add-on) = 260, + 10 packing + 20 delivery. */
    assert.equal(saved.itemsTotal, 260);
    assert.equal(saved.grandTotal, 290);
    assert.equal(saved.lines[0].unitPrice, 130);
    assert.equal(saved.status, 'placed');
    assert.equal(saved.paymentMode, 'cod');
    assert.equal(saved.paymentStatus, 'pending');
    assert.equal(saved.customerId, 'cus_diner1');
  });

  it('shows that order back to the diner on the website, and to nobody else', async () => {
    await makeKitchen();
    await makeDish();
    const { token } = await makeDiner();
    const other = await makeDiner({ customerId: 'cus_diner2', phone: '+919222222222', name: 'Somebody Else' });

    await call('POST', '/api/v2/food-partners/orders', { token, body: order() });
    const { orderNumber } = await FoodOrder.findOne({}).lean();

    const mine = await call('GET', '/api/v2/food-web/orders', { token });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.orders.length, 1);
    assert.equal(mine.body.data.orders[0].reference, orderNumber);
    assert.equal(mine.body.data.orders[0].status, 'placed');
    assert.equal(mine.body.data.orders[0].dueOnDelivery, 290);
    assert.equal(mine.body.data.orders[0].paid, 0);

    const one = await call('GET', `/api/v2/food-web/orders/${orderNumber}`, { token });
    assert.equal(one.status, 200);
    assert.equal(one.body.data.order.lines[0].price * one.body.data.order.lines[0].qty, 260);

    /* Somebody else's order is not theirs to read - and says "not found", not
       "forbidden", so the reference is not confirmed to exist. */
    const theirs = await call('GET', `/api/v2/food-web/orders/${orderNumber}`, { token: other.token });
    assert.equal(theirs.status, 404);
    assert.equal((await call('GET', '/api/v2/food-web/orders', { token: other.token })).body.data.orders.length, 0);
  });

  it('refuses an order with no session', async () => {
    await makeKitchen();
    await makeDish();
    const placed = await call('POST', '/api/v2/food-partners/orders', { body: order() });
    assert.equal(placed.status, 401);
    assert.equal(await FoodOrder.countDocuments({}), 0);
  });
});

describe('the refusals - each one an order that must never be written', () => {
  const expectRefused = async (body, status, code, seed = async () => {}) => {
    await seed();
    const { token } = await makeDiner();
    const placed = await call('POST', '/api/v2/food-partners/orders', { token, body });
    assert.equal(placed.status, status, JSON.stringify(placed.body));
    assert.equal(placed.body.code, code);
    assert.equal(await FoodOrder.countDocuments({}), 0, 'nothing was written');
  };

  it('a closed kitchen', async () => {
    await expectRefused(order(), 409, 'RESTAURANT_CLOSED', async () => {
      await makeKitchen({ openState: 'closed' });
      await makeDish();
    });
  });

  it('a kitchen that is not approved', async () => {
    await expectRefused(order(), 404, 'RESTAURANT_UNAVAILABLE', async () => {
      await makeKitchen({ verificationStatus: 'pending', isActive: false });
      await makeDish();
    });
  });

  it('a dish that is not on the menu', async () => {
    await expectRefused(order({ lines: [{ productId: 'FPI-NOPE0000', quantity: 1 }] }), 409, 'DISH_UNAVAILABLE', async () => {
      await makeKitchen();
      await makeDish();
    });
  });

  it('a dish that has just sold out', async () => {
    await expectRefused(order(), 409, 'DISH_SOLD_OUT', async () => {
      await makeKitchen();
      await makeDish({ isAvailable: false });
    });
  });

  it('an order under the kitchen\'s minimum', async () => {
    await expectRefused(order({ lines: [{ productId: 'FPI-TEST0001', quantity: 1 }] }), 409, 'BELOW_MINIMUM', async () => {
      await makeKitchen({ minOrderValue: 500 });
      await makeDish();
    });
  });

  it('cash from a kitchen that does not take it', async () => {
    await expectRefused(order(), 409, 'COD_UNAVAILABLE', async () => {
      await makeKitchen({ acceptsCod: false });
      await makeDish();
    });
  });

  it('an empty order', async () => {
    await expectRefused(order({ lines: [] }), 400, 'EMPTY_ORDER', async () => {
      await makeKitchen();
      await makeDish();
    });
  });
});

/* ── The kitchen's side: does the restaurant admin see it? ────────────── */

/*
 * These exist because of a real report: "I placed an order from Paradise and it
 * is not in the restaurant admin." There are exactly three ways that can be
 * true, and this section pins each one so the next report can be answered by
 * reading a test instead of a database:
 *
 *   1. The order never reached the server (the website's button was a preview).
 *      Nothing here can show that - it is the absence of a request - so it is
 *      answered from the server's log, not from this file.
 *   2. It reached the server, but for a DIFFERENT kitchen with the same name.
 *      The database has two "Paradise Biryani House" rows with different owners,
 *      and an admin signed in as one cannot see the other's orders.
 *   3. It reached the server as an ONLINE order that was never paid. The kitchen
 *      is told about an order when it is real, and an unpaid card order is not
 *      yet - so it is held back on purpose.
 */
describe('the kitchen\'s side - does the restaurant admin see it?', () => {
  const adminFor = async (restaurantId) => signRestaurantAdminToken(
    await FoodRestaurant.findOne({ restaurantId }),
  );
  const queue = (token, status = 'placed') => call('GET', `/api/v1/restaurant-admin/orders?status=${status}`, { token });

  it('shows a new cash order under "placed", and counts it', async () => {
    await makeKitchen();
    await makeDish();
    const { token } = await makeDiner();
    await call('POST', '/api/v2/food-partners/orders', { token, body: order() });
    const { orderNumber } = await FoodOrder.findOne({}).lean();

    const admin = await adminFor('FP-TEST0001');
    const list = await queue(admin);
    assert.equal(list.status, 200);
    assert.equal(list.body.count, 1);
    assert.equal(list.body.data[0].orderNumber, orderNumber);
    assert.equal(list.body.counts.placed, 1);
  });

  it('lets the kitchen accept it, and the diner sees that on the website', async () => {
    await makeKitchen();
    await makeDish();
    const { token } = await makeDiner();
    await call('POST', '/api/v2/food-partners/orders', { token, body: order() });
    const { orderNumber } = await FoodOrder.findOne({}).lean();
    const admin = await adminFor('FP-TEST0001');

    const accepted = await call('PATCH', `/api/v1/restaurant-admin/orders/${orderNumber}/status`, {
      token: admin, body: { status: 'accepted', promisedMinutes: 20 },
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

    assert.equal((await queue(admin)).body.count, 0, 'it has left the "placed" tab');
    assert.equal((await queue(admin, 'accepted')).body.count, 1, 'and is under "accepted"');

    const seen = await call('GET', `/api/v2/food-web/orders/${orderNumber}`, { token });
    assert.equal(seen.body.data.order.status, 'accepted');
    assert.ok(seen.body.data.order.kitchenTrack.some((step) => step.label === 'Accepted'));
  });

  it('does NOT show it to a different kitchen that has the same name', async () => {
    /* The real database has two "Paradise Biryani House" rows. */
    await makeKitchen({ restaurantId: 'FP-PARADISE1', restaurantName: 'Paradise Biryani House' });
    await makeKitchen({
      restaurantId: 'FP-PARADISE2', restaurantName: 'Paradise Biryani House',
      ownerPhone: '+919000000002', ownerEmail: 'other@example.invalid',
    });
    await makeDish({ productId: 'FPI-PARA0001', restaurantId: 'FP-PARADISE1' });
    const { token } = await makeDiner();

    await call('POST', '/api/v2/food-partners/orders', {
      token, body: order({ restaurantId: 'FP-PARADISE1', lines: [{ productId: 'FPI-PARA0001', quantity: 2 }] }),
    });

    const theirs = await queue(await adminFor('FP-PARADISE1'));
    const other = await queue(await adminFor('FP-PARADISE2'));
    assert.equal(theirs.body.count, 1, 'the kitchen it was ordered from sees it');
    assert.equal(other.body.count, 0, 'the other one, same name, does not');
    assert.deepEqual(other.body.counts, {});
  });

  it('holds back an online order until it is paid', async () => {
    await makeKitchen();
    await makeDish();
    const { token } = await makeDiner();

    const placed = await call('POST', '/api/v2/food-partners/orders', { token, body: order({ paymentMode: 'online' }) });
    assert.equal(placed.status, 201, JSON.stringify(placed.body));

    const row = await FoodOrder.findOne({}).lean();
    assert.equal(row.paymentMode, 'online');
    assert.equal(row.paymentStatus, 'pending');

    const admin = await adminFor('FP-TEST0001');
    assert.equal((await queue(admin)).body.count, 0, 'an unpaid card order is not the kitchen\'s to cook yet');

    /* Once the payment is settled it is real, and it appears. */
    await FoodOrder.updateOne({ _id: row._id }, { paymentStatus: 'paid' });
    assert.equal((await queue(admin)).body.count, 1);
  });

  it('refuses a kitchen the moment its session is not that kitchen\'s', async () => {
    await makeKitchen();
    await makeDish();
    const { token } = await makeDiner();
    await call('POST', '/api/v2/food-partners/orders', { token, body: order() });

    /* A DINER's token is not a kitchen's, and no token is not a kitchen at all. */
    assert.equal((await queue(token)).status, 401);
    assert.equal((await call('GET', '/api/v1/restaurant-admin/orders?status=placed')).status, 401);
  });
});

describe('and it stayed that way', () => {
  it('made no attempt to reach a real provider while placing orders', () => {
    assert.deepEqual(blocked, [], 'something tried to send a request out of this machine: ' + blocked.join(', '));
  });
});
