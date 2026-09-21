/* ══════════════════════════════════════════════════════════════════════════
   The Lampose admin closes a website order the diner never confirmed.

   A website order ends when the DINER presses "Delivered" on the tracking page.
   Some never do: the food arrived, the diner closed the tab, and the restaurant
   is waiting to be paid — restaurants are paid for orders that reach Delivered.
   So the main admin can close it from the staff console.

   What these pin down:

     · only the roles that hold `food.complete` (Super Admin, Admin) may
     · only a WEBSITE order, and only once the food is ready or on its way —
       an app order has a real rider whose own app closes it
     · it means exactly what the diner's button means: cash marked collected, the
       restaurant made payable — but the history says an ADMIN said so, by name
     · the staff console is told, by the server, whether the button is on offer

   Nothing here can reach a real phone: credentials are blanked before anything
   loads, and outbound requests are blocked.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TWILIO_DELIVERY_REQUEST_CONTENT_SID', 'DELIVERY_PARTNER_WHATSAPP',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL', 'EXPO_ACCESS_TOKEN',
]) process.env[key] = '';
/* The staff token is signed and checked against the environment's secret directly,
   so the suite must not depend on a developer's .env having one. */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a-long-secret-for-this-test-suite-only-0123456789abcdef';

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
  describe, it, before, after, beforeEach,
} = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const twilio = require('../src/infrastructure/twilio/twilio');
const Admin = require('../src/modules/admins/admin.model');
const { signAdminToken } = require('../src/modules/admins/adminToken');
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
const realSender = twilio.sendDeliveryRequest;
const realStart = dispatch.startDispatch;

before(async () => {
  twilio.sendDeliveryRequest = async () => ({ success: true, messageSid: 'SMTEST0001' });
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

beforeEach(() => {});

const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

/* ── Seed ─────────────────────────────────────────────────────────────── */

const staffToken = async (role) => {
  const admin = await Admin.create({
    name: `${role} Person`, email: `${role.toLowerCase().replace(/\s/g, '.')}@lampose.test`, password: 'a-good-password-1', role,
  });
  return signAdminToken(admin);
};

const world = async (over = {}) => {
  await FoodRestaurant.create({
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
    customerId: 'cus_diner1', phone: '+919111111111', name: 'Test Diner', phoneVerifiedAt: new Date(),
  });
  const dinerToken = signCustomerToken(customer);
  const placed = await call('POST', '/api/v2/food-partners/orders', {
    token: dinerToken,
    body: {
      restaurantId: 'FP-TEST0001',
      lines: [{ productId: 'FPI-TEST0001', quantity: 2 }],
      paymentMode: 'cod',
      fulfilment: 'delivery',
      channel: 'web',
      deliveryAddress: '12 Test Lane, Testville',
      customerName: 'Test Diner',
      ...over,
    },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  const restaurantToken = signRestaurantAdminToken(await FoodRestaurant.findOne({ restaurantId: 'FP-TEST0001' }));
  return { orderNumber: placed.body.data.orderNumber, dinerToken, restaurantToken };
};

const move = (ctx, status, extra = {}) => call(
  'PATCH', `/api/v1/restaurant-admin/orders/${ctx.orderNumber}/status`, { token: ctx.restaurantToken, body: { status, ...extra } },
);
/** Up to the point where the food is ready. */
const upToReady = async (ctx, extra = { deliveryBy: 'self' }) => {
  assert.equal((await move(ctx, 'accepted', { promisedMinutes: 20, ...extra })).status, 200);
  assert.equal((await move(ctx, 'preparing')).status, 200);
  assert.equal((await move(ctx, 'ready')).status, 200);
};
const onTheWay = async (over = {}, extra = { deliveryBy: 'self' }) => {
  const ctx = await world(over);
  await upToReady(ctx, extra);
  assert.equal((await move(ctx, 'picked_up')).status, 200);
  return ctx;
};

const markDelivered = (ctx, token, body) => call(
  'POST', `/api/v1/admin/food-orders/${ctx.orderNumber}/delivered`, { token, body },
);
const staffView = (ctx, token) => call('GET', `/api/v1/admin/food-orders/${ctx.orderNumber}`, { token });
const stored = (ctx) => FoodOrder.findOne({ orderNumber: ctx.orderNumber }).lean();

/* ══════════════════════════════════════════════════════════════════════════ */

describe('who may close a website order from the staff console', () => {
  it('lets a Super Admin and an Admin', async () => {
    for (const role of ['Super Admin', 'Admin']) {
      // eslint-disable-next-line no-await-in-loop
      await FoodOrder.deleteMany({});
      // eslint-disable-next-line no-await-in-loop
      await FoodProduct.deleteMany({}); await FoodRestaurant.deleteMany({}); await Customer.deleteMany({});
      // eslint-disable-next-line no-await-in-loop
      const ctx = await onTheWay();
      // eslint-disable-next-line no-await-in-loop
      const res = await markDelivered(ctx, await staffToken(role));
      assert.equal(res.status, 200, `${role}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.status, 'delivered');
    }
  });

  it('refuses every other staff role, and no session at all', async () => {
    const ctx = await onTheWay();
    for (const role of ['Editor', 'Viewer', 'Food Admin', 'Support']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await markDelivered(ctx, await staffToken(role));
      assert.equal(res.status, 403, role);
    }
    assert.equal((await markDelivered(ctx, null)).status, 401);
    assert.equal((await markDelivered(ctx, ctx.restaurantToken)).status, 401, 'a restaurant\'s session is not staff');
    assert.equal((await markDelivered(ctx, ctx.dinerToken)).status, 401, 'nor a diner\'s');
    assert.equal((await stored(ctx)).status, 'picked_up', 'nothing changed');
  });
});

describe('what closing it means', () => {
  it('delivers it, marks the cash collected, and records an ADMIN said so - by name', async () => {
    const ctx = await onTheWay();
    const token = await staffToken('Super Admin');
    const res = await markDelivered(ctx, token, { note: 'Diner confirmed by phone' });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const row = await stored(ctx);
    assert.equal(row.status, 'delivered');
    assert.ok(row.delivery.deliveredAt);
    assert.equal(row.paymentStatus, 'paid', 'cash taken at the door');
    const event = row.statusHistory.find((e) => e.status === 'delivered');
    assert.equal(event.by, 'admin');
    assert.match(event.note, /Marked delivered by Super Admin Person/);
    assert.match(event.note, /Diner confirmed by phone/);
  });

  it('shows the diner Delivered, on the tracking page', async () => {
    const ctx = await onTheWay();
    await markDelivered(ctx, await staffToken('Admin'));
    const seen = (await call('GET', `/api/v2/food-web/orders/${ctx.orderNumber}`, { token: ctx.dinerToken })).body.data.order;
    assert.equal(seen.status, 'delivered');
    assert.equal(seen.live, false);
    assert.ok(seen.riderTrack.some((s) => s.label === 'Delivered' && s.done));
  });

  it('makes the restaurant payable - that is what "delivered" is for', async () => {
    const ctx = await onTheWay({}, { deliveryBy: 'driver' }); // cash the desk's driver collects comes back to Lampose
    assert.equal((await availableFor('FP-TEST0001')).availableOrders, 0, 'nothing owed before it is delivered');
    await markDelivered(ctx, await staffToken('Admin'));
    const balance = await availableFor('FP-TEST0001');
    assert.equal(balance.availableOrders, 1);
    assert.ok(balance.available > 0);
  });

  it('can close an order the restaurant never marked "taken" - and still records the pickup, so its journey has no hole', async () => {
    const ctx = await world();
    await upToReady(ctx);
    const res = await markDelivered(ctx, await staffToken('Admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const row = await stored(ctx);
    assert.equal(row.status, 'delivered');
    assert.ok(row.delivery.pickedUpAt, 'a pickup time was written');
  });

  it('tells a second click it is already done, and does not record it twice', async () => {
    const ctx = await onTheWay();
    const token = await staffToken('Admin');
    assert.equal((await markDelivered(ctx, token)).status, 200);
    const again = await markDelivered(ctx, token);
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'ALREADY_DELIVERED');
    assert.equal((await stored(ctx)).statusHistory.filter((e) => e.status === 'delivered').length, 1);
  });
});

describe('what cannot be closed from here', () => {
  it('an order that is not out for delivery yet', async () => {
    const ctx = await world();
    const token = await staffToken('Admin');
    assert.equal((await markDelivered(ctx, token)).status, 409, 'placed');
    await move(ctx, 'accepted', { deliveryBy: 'self' });
    assert.equal((await markDelivered(ctx, token)).status, 409, 'accepted');
    await move(ctx, 'preparing');
    const cooking = await markDelivered(ctx, token);
    assert.equal(cooking.status, 409, 'cooking');
    assert.equal(cooking.body.code, 'NOT_MARKABLE');
    assert.notEqual((await stored(ctx)).status, 'delivered');
  });

  it('an APP order - its real rider closes it, with the customer\'s code', async () => {
    const ctx = await world({ channel: 'app' });
    await upToReady(ctx, {});
    await FoodOrder.updateOne({ orderNumber: ctx.orderNumber }, { status: 'picked_up' });
    const res = await markDelivered(ctx, await staffToken('Super Admin'));
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'NOT_MARKABLE');
    assert.match(res.body.message, /placed in the app/);
    assert.equal((await stored(ctx)).status, 'picked_up');
  });

  it('a counter-pickup order - the customer collects it, nobody delivers it', async () => {
    const ctx = await world({ fulfilment: 'pickup', deliveryAddress: undefined });
    await move(ctx, 'accepted');
    await move(ctx, 'preparing');
    await move(ctx, 'ready');
    const res = await markDelivered(ctx, await staffToken('Admin'));
    assert.equal(res.status, 409);
    assert.match(res.body.message, /counter-pickup/);
  });

  it('an order that does not exist', async () => {
    const res = await call('POST', '/api/v1/admin/food-orders/LO000000/delivered', { token: await staffToken('Admin') });
    assert.equal(res.status, 404);
  });
});

describe('what the staff console is told', () => {
  it('says the button is on offer only when the server would accept it', async () => {
    const ctx = await world();
    const token = await staffToken('Admin');
    const at = async () => (await staffView(ctx, token)).body.data;

    assert.equal((await at()).canMarkDelivered, false, 'placed');
    await move(ctx, 'accepted', { deliveryBy: 'self' });
    assert.equal((await at()).canMarkDelivered, false, 'accepted');
    await move(ctx, 'preparing');
    await move(ctx, 'ready');
    const ready = await at();
    assert.equal(ready.canMarkDelivered, true, 'ready');
    assert.equal(ready.channel, 'web');
    assert.equal(ready.deliveryMethod, 'self');
    await move(ctx, 'picked_up');
    assert.equal((await at()).canMarkDelivered, true, 'on the way');
    await markDelivered(ctx, token);
    assert.equal((await at()).canMarkDelivered, false, 'delivered');
  });

  it('says it is not on offer for an app order', async () => {
    const ctx = await world({ channel: 'app' });
    await upToReady(ctx, {});
    const seen = (await staffView(ctx, await staffToken('Admin'))).body.data;
    assert.equal(seen.channel, 'app');
    assert.equal(seen.canMarkDelivered, false);
  });
});

describe('and it stayed that way', () => {
  it('made no attempt to reach a real provider', () => {
    assert.deepEqual(blocked, [], `something tried to leave this machine: ${blocked.join(', ')}`);
  });
});
