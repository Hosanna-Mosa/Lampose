/* ══════════════════════════════════════════════════════════════════════════
   The console's restaurant approval queue: its filters and their counts.

   Every chip and dropdown on Restaurant Approvals carries a number, and the
   number has to be what clicking it would show — counted under the search
   and every OTHER chosen filter, never its own. A count that ignored another
   filter would promise rows the list then does not show; one that applied its
   own would make every other choice read 0.

   Documents go in through the raw collection: this asserts the query, and a
   full application's validation would only add noise to the fixtures.
   ══════════════════════════════════════════════════════════════════════════ */
const test = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
const { listRestaurants } = require('../src/modules/foodpartners/foodAdmin.controller');

withDatabase();

const DAY = 24 * 60 * 60 * 1000;

const kitchen = (id, over = {}) => ({
  restaurantId: id,
  restaurantName: `Kitchen ${id}`,
  ownerName: 'Owner',
  verificationStatus: 'pending',
  isActive: false,
  cuisineTypes: [],
  address: { line1: 'Street', city: '', state: '' },
  createdAt: new Date(),
  ...over,
});

const seed = async () => {
  await FoodRestaurant.collection.insertMany([
    kitchen('R1', {
      verificationStatus: 'approved', isActive: true, cuisineTypes: ['Biryani', 'North Indian'],
      address: { line1: 'MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
      fssaiLicenseNumber: '12345678901234', payout: { accountLast4: '4321' },
      location: { type: 'Point', coordinates: [73.85, 18.52] },
      dineIn: { enabled: true },
    }),
    kitchen('R2', {
      verificationStatus: 'approved', isActive: false, cuisineTypes: ['biryani'],
      address: { line1: 'FC Road', city: 'pune ', state: 'Maharashtra' },
      fssaiLicenseNumber: '22222222222222', fssaiExpiry: new Date(Date.now() - DAY),
    }),
    kitchen('R3', {
      verificationStatus: 'pending',
      address: { line1: 'Banjara Hills', city: 'Hyderabad', state: 'Telangana' },
      payout: { upiId: 'r3@upi' },
      createdAt: new Date(Date.now() - 20 * DAY),
    }),
    kitchen('R4', { verificationStatus: 'rejected', createdAt: new Date(Date.now() - 200 * DAY) }),
  ]);
  await FoodProduct.collection.insertMany([
    { productId: 'P1', restaurantId: 'R1', productName: 'Dum biryani', category: 'Mains', price: 250 },
    { productId: 'P3', restaurantId: 'R3', productName: 'Haleem', category: 'Mains', price: 200 },
  ]);
};

/** Calls the handler the way Express would and hands back the JSON body. */
const list = async (query = {}) => {
  let status = 200;
  let body = null;
  const res = {
    status(code) { status = code; return this; },
    json(payload) { body = payload; return this; },
  };
  await listRestaurants({ query }, res, (err) => { throw err; });
  return { status, body };
};

const ids = (body) => body.data.map((r) => r.restaurantId).sort();
const cityCount = (body, value) => (body.facets.city.find((c) => c.value === value) || {}).n;

/* `withDatabase` empties every collection before each test, so each seeds. */
test('the queue: filters, and a count for every choice', async (t) => {
  await t.test('with nothing chosen, every dimension counts the whole queue', async () => {
    await seed();
    const { body } = await list();
    assert.deepEqual(ids(body), ['R1', 'R2', 'R3', 'R4']);
    assert.deepEqual(body.facets.status, { approved: 2, pending: 1, rejected: 1 });
    assert.deepEqual(body.facets.listing, { live: 1, paused: 3 });
    /* "Pune" and "pune " are one place. */
    assert.equal(cityCount(body, 'pune'), 2);
    assert.equal(cityCount(body, 'hyderabad'), 1);
    assert.equal(cityCount(body, '__none'), 1);
    assert.equal((body.facets.cuisine.find((c) => c.value === 'biryani') || {}).n, 2);
    assert.deepEqual(body.facets.fssai, { has: 2, missing: 2, expired: 1 });
    assert.deepEqual(body.facets.payout, { has: 2, missing: 2 });
    assert.deepEqual(body.facets.pin, { pinned: 1, unpinned: 3 });
    assert.deepEqual(body.facets.menu, { has: 2, none: 2 });
    assert.deepEqual(body.facets.dineIn, { on: 1, off: 3 });
    assert.equal(body.facets.applied['30'], 3);
    assert.equal(body.facets.applied['7'], 2);
  });

  await t.test('a city narrows the list, and every other count, but not its own', async () => {
    await seed();
    const { body } = await list({ city: 'PUNE' });
    assert.deepEqual(ids(body), ['R1', 'R2']);
    assert.deepEqual(body.facets.status, { approved: 2 });
    /* The city list is still a choice between cities. */
    assert.equal(cityCount(body, 'hyderabad'), 1);
    assert.equal(cityCount(body, 'pune'), 2);
  });

  await t.test('status and city together', async () => {
    await seed();
    const { body } = await list({ status: 'pending', city: 'pune' });
    assert.deepEqual(ids(body), []);
    assert.equal(body.facets.status.approved, 2);
    assert.equal(cityCount(body, 'hyderabad'), 1);
    assert.equal(cityCount(body, 'pune'), undefined);
  });

  await t.test('readiness filters', async () => {
    await seed();
    assert.deepEqual(ids((await list({ fssai: 'expired' })).body), ['R2']);
    assert.deepEqual(ids((await list({ fssai: 'missing' })).body), ['R3', 'R4']);
    assert.deepEqual(ids((await list({ payout: 'has' })).body), ['R1', 'R3']);
    assert.deepEqual(ids((await list({ payout: 'missing' })).body), ['R2', 'R4']);
    assert.deepEqual(ids((await list({ pin: 'pinned' })).body), ['R1']);
    assert.deepEqual(ids((await list({ menu: 'none' })).body), ['R2', 'R4']);
    assert.deepEqual(ids((await list({ dineIn: 'on' })).body), ['R1']);
    assert.deepEqual(ids((await list({ applied: '7' })).body), ['R1', 'R2']);
    assert.deepEqual(ids((await list({ city: '__none' })).body), ['R4']);
    assert.deepEqual(ids((await list({ cuisine: '__none' })).body), ['R3', 'R4']);
  });

  await t.test('the search reaches the address, and the counts follow it', async () => {
    await seed();
    const { body } = await list({ search: '411001' });
    assert.deepEqual(ids(body), ['R1']);
    assert.deepEqual(body.facets.status, { approved: 1 });
  });

  await t.test('the earlier shape is still there', async () => {
    await seed();
    const { body } = await list({ status: 'approved' });
    assert.deepEqual(body.matchCounts, { pending: 1, approved: 2, rejected: 1, live: 1, paused: 1 });
    assert.deepEqual(body.counts, { pending: 1, approved: 2, rejected: 1 });
  });

  await t.test('an unknown value is refused, not ignored', async () => {
    await seed();
    const { status, body } = await list({ fssai: 'maybe' });
    assert.equal(status, 400);
    assert.equal(body.code, 'BAD_INPUT');
  });
});
