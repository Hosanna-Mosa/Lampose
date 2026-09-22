/* ══════════════════════════════════════════════════════════════════════════
   The link in "your order is placed" — one order, no sign-in, READ ONLY.

   A diner taps a link in WhatsApp seconds after paying, on a phone that has
   never signed in to lampose.com — because the tap opens WhatsApp's own
   browser, which holds no session. Before this, that link showed a sign-in
   wall to somebody watching a bag come across town. The code in it opens the
   tracking page, and what these tests pin down is how narrow that door is:

     · the right code opens ITS order, with no Authorization header at all
     · a wrong code, another order's code, the RESTAURANT's code for the same
       order, and no code are all refused — as a 401, because the fall-through
       is "sign in", which is where the diner was before the link existed
     · it expires with the order's own TTL, and a signed-in diner is never
       locked out by a stale one
     · it cannot reach the orders LIST, only the one order in the path

   Nothing here can reach a real phone: credentials are blanked before anything
   loads and the WhatsApp client is a recorder.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TWILIO_FOOD_ORDER_CONTENT_SID', 'TWILIO_FOOD_ORDER_BUTTON_SID',
  'TWILIO_FOOD_ORDER_PLACED_CONTENT_SID', 'ORDER_LINK_TTL_HOURS',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL', 'EXPO_ACCESS_TOKEN',
]) process.env[key] = '';
process.env.PUBLIC_SITE_URL = 'https://lampose.com';

const {
  describe, it, before, after, afterEach,
} = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const twilio = require('../src/infrastructure/twilio/twilio');
const Customer = require('../src/modules/customers/customer.model');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
const { codeFor: ownerCodeFor } = require('../src/modules/foodpartners/orderLink.service');
const { codeFor, trackUrl, PARAM } = require('../src/modules/foodweb/trackLink.service');
const { notifyCustomerOfOrder } = require('../src/modules/foodpartners/foodOrder.notifier');
const dispatch = require('../src/modules/drivers/foodDispatch.service');

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

afterEach(() => {
  process.env.ORDER_LINK_TTL_HOURS = '';
  process.env.TWILIO_FOOD_ORDER_PLACED_CONTENT_SID = '';
  twilio._useClientForTests(null);
});

const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

/** A stand-in for Twilio's client — it records what would have been sent. */
const fakeClient = () => {
  const created = [];
  const messages = () => ({ fetch: async () => ({ status: 'delivered' }) });
  messages.create = async (payload) => { created.push(payload); return { sid: 'SMFAKE0001', status: 'queued' }; };
  return { client: { messages }, created };
};

let seq = 0;

const world = async () => {
  seq += 1;
  const restaurantId = `FP-TRK${String(seq).padStart(4, '0')}`;
  const productId = `FPI-TRK${String(seq).padStart(4, '0')}`;

  await FoodRestaurant.create({
    restaurantId,
    restaurantName: 'Test Kitchen',
    ownerName: 'Owner',
    ownerPhone: `+9190000000${String(seq).padStart(2, '0')}`,
    fssaiLicenseNumber: '12345678901234',
    cuisineTypes: ['Chinese'],
    verificationStatus: 'approved',
    isActive: true,
    openState: 'open',
    deliveryFee: { type: 'flat', amount: 20 },
    acceptsCod: true,
    address: { line1: 'Opposite the RTC complex' },
    location: { type: 'Point', coordinates: [78.4867, 17.385] },
  });
  await FoodProduct.create({
    productId, restaurantId, productName: 'Veg Hakka Noodles', category: 'Noodles',
    price: 120, isVeg: 'veg', isAvailable: true,
  });

  const customer = await Customer.create({
    customerId: `cus_trk${seq}`, phone: `+9191111111${String(seq).padStart(2, '0')}`,
    name: 'Test Diner', phoneVerifiedAt: new Date(),
  });
  const token = signCustomerToken(customer);

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
  return {
    token, orderNumber, restaurantId, code: codeFor(orderNumber),
  };
};

const track = (reference, code, token) => call(
  'GET',
  `/api/v2/food-web/orders/${reference}${code ? `?${PARAM}=${encodeURIComponent(code)}` : ''}`,
  { token },
);

/* ══════════════════════════════════════════════════════════════════════════ */

describe('the diner code', () => {
  it('is 22 URL-safe characters, and the same for one order every time', () => {
    const a = codeFor('LO111111');
    assert.match(a, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(codeFor('LO111111'), a, 'a resent message carries the same link');
  });

  it('is NOT the restaurant\'s code for the same order', () => {
    /* Same secret, same order number, different purpose — so a diner\'s link
       cannot be retyped into the console\'s route, or the other way round. */
    assert.notEqual(codeFor('LO111111'), ownerCodeFor('FP-A', 'LO111111'));
  });

  it('builds the tracking URL the message carries', () => {
    const url = trackUrl('LO828483');
    assert.equal(url, `https://lampose.com/food/orders/LO828483?${PARAM}=${codeFor('LO828483')}`);
    assert.ok(url.startsWith('https://'), 'with the scheme, or WhatsApp will not make it tappable');
  });
});

describe('opening the tracking page from a message', () => {
  it('opens that order with no session at all', async () => {
    const { orderNumber, code } = await world();

    const res = await track(orderNumber, code);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.order.reference, orderNumber);
    assert.ok(res.body.data.order.kitchenName, 'the page has what it draws');
  });

  it('leaves out the address and the door code — a message can be forwarded', async () => {
    const { orderNumber, token, code } = await world();
    /* A website order shows its door code once one of OUR riders is on it —
       `showsCode`. Set so the signed-in half of this test has a code to be
       given, which is the half that proves the link view is missing one. */
    await FoodOrder.updateOne({ orderNumber }, {
      deliveryOtp: '7391',
      'delivery.assignedAt': new Date(),
    });

    const viaLink = await track(orderNumber, code);
    assert.equal(viaLink.status, 200);
    assert.equal(viaLink.body.data.order.addressTitle, '', 'not where they live');
    assert.equal(viaLink.body.data.order.deliveryOtp, '', 'not the digits that take the food');
    assert.equal(viaLink.body.data.order.viaLink, true, 'and the page is told why');

    /* Not redacted in the JSON only — the whole card is absent of them. */
    const printed = JSON.stringify(viaLink.body);
    assert.equal(printed.includes('7391'), false, 'not in the chip, and not in the rider track either');
    assert.equal(printed.includes('12 Test Lane'), false);

    /* The diner's own session still gets everything. */
    const signedIn = await track(orderNumber, null, token);
    assert.equal(signedIn.body.data.order.deliveryOtp, '7391');
    assert.equal(signedIn.body.data.order.addressTitle, '12 Test Lane, Testville');
    assert.equal(signedIn.body.data.order.viaLink, false);
  });

  it('refuses a wrong code, another order\'s code and the restaurant\'s code alike', async () => {
    const { orderNumber, restaurantId } = await world();
    const other = await world();

    for (const bad of [
      'not-a-code',
      codeFor(other.orderNumber),
      ownerCodeFor(restaurantId, orderNumber),
      '',
    ]) {
      const res = await track(orderNumber, bad);
      assert.equal(res.status, 401, `${bad || '(none)'} must not open it`);
    }
  });

  it('expires with the order, and says nothing about whether it existed', async () => {
    const { orderNumber, code } = await world();
    process.env.ORDER_LINK_TTL_HOURS = '24';
    await FoodOrder.updateOne(
      { orderNumber },
      { placedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    );

    const res = await track(orderNumber, code);
    assert.equal(res.status, 401, 'a day later it is a sign-in, not a door');
  });

  it('never locks out a diner who IS signed in', async () => {
    const { orderNumber, token, code } = await world();

    /* Their own session, with no code at all — the way it always worked. */
    const plain = await track(orderNumber, null, token);
    assert.equal(plain.status, 200);

    /* And with a stale one: the code is tried, fails, and the session answers
       rather than the request being refused on the strength of a bad guess. */
    const stale = await track(orderNumber, 'not-a-code', token);
    assert.equal(stale.status, 200);
    assert.equal(stale.body.data.order.reference, orderNumber);
  });

  it('cannot reach anything but that one order', async () => {
    const { orderNumber, code } = await world();

    /* The list, the addresses and the usuals keep `requireCustomer` alone, so a
       code on them is simply an unknown query parameter. */
    for (const path of ['/orders', '/addresses', '/usuals']) {
      const res = await call('GET', `/api/v2/food-web${path}?${PARAM}=${encodeURIComponent(code)}`);
      assert.equal(res.status, 401, `${path} must still need a session`);
    }

    /* Nor another order, with this order's code. */
    const other = await world();
    assert.equal((await track(other.orderNumber, code)).status, 401);
    assert.equal((await track(orderNumber, code)).status, 200, 'its own still opens');
  });
});

describe('the message that carries it', () => {
  it('fills the four variables, and the link is the one that opens the page', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);
    process.env.TWILIO_FOOD_ORDER_PLACED_CONTENT_SID = 'HXTESTorderplaced0000000000000000';

    const { orderNumber } = await world();
    const order = await FoodOrder.findOne({ orderNumber }).lean();

    /* Placing the order ALREADY sent this message and the kitchen's alert —
       that is the wiring under test elsewhere. Cleared so what follows counts
       one deliberate call rather than three incidental ones. */
    fake.created.length = 0;

    const out = await notifyCustomerOfOrder(order);
    assert.equal(out.sent, true, out.reason || '');
    assert.equal(fake.created.length, 1);

    const [notice] = fake.created;
    assert.equal(notice.to, `whatsapp:${order.customerPhone}`);
    const filled = JSON.parse(notice.contentVariables);
    assert.deepEqual(Object.keys(filled).sort(), ['1', '2', '3', '4']);
    assert.equal(filled['2'], orderNumber);
    assert.equal(filled['3'], order.restaurant.name);
    assert.equal(filled['4'], trackUrl(orderNumber));

    /* The link in the message is the link that works — asserted end to end
       rather than by reading the string, because that is the whole feature. */
    const opened = await track(orderNumber, new URL(filled['4']).searchParams.get(PARAM));
    assert.equal(opened.status, 200);
  });

  it('sends nothing when there is no number, and calls that no failure', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);

    const { orderNumber } = await world();
    await FoodOrder.updateOne({ orderNumber }, { customerPhone: '' });
    const order = await FoodOrder.findOne({ orderNumber }).lean();
    fake.created.length = 0;

    const out = await notifyCustomerOfOrder(order);
    assert.equal(out.sent, false);
    assert.match(out.reason, /no phone number/);
    assert.equal(fake.created.length, 0);
  });
});
