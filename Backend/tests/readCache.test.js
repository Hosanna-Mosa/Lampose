/* ══════════════════════════════════════════════════════════════════════════
   The read cache, end to end, through the real routes the User App calls:

     GET /api/v2/listings                         the stay feed
     GET /api/v2/listings/:id                     one listing
     GET /api/v2/food-partners/restaurants        the kitchen feed
     GET /api/v2/food-partners/restaurants/:id    one kitchen and its menu

   What has to hold:

     (a) the first read is a MISS and queries Mongo; the second is a HIT and
         does not touch the cached collections
     (b) a write — to a property, a partner's name, a kitchen, a dish —
         invalidates, and the next read is fresh
     (c) cache on, cache off and Redis unreachable all answer the SAME body
     and: bed counts stay live under a cached feed, "near me" is never cached,
     "not found" is remembered briefly and forgotten when the thing appears,
     and a write that touches nothing public leaves the cache warm.

   Mongo is real (mongodb-memory-server); Redis is `ioredis-mock`, or the real
   client against a closed port for the "Redis is down" case.
   ══════════════════════════════════════════════════════════════════════════ */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-read-cache';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const RedisMock = require('ioredis-mock');
const Redis = require('ioredis');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const cache = require('../src/infrastructure/cache/cache');
const Property = require('../src/modules/properties/property.model');
const Partner = require('../src/modules/partners/partner.model');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
const { syncShareTypes, setFreeBeds } = require('../src/modules/inventory/inventory.service');

withDatabase();

/* ── Plumbing ─────────────────────────────────────────────────────────────*/

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await cache.close();
  await new Promise((resolve) => server.close(resolve));
});

const get = async (path) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, cache: res.headers.get('x-cache'), body: await res.json() };
};

/* Every Mongo operation, by collection — how "did not query" is proven. */
const queries = [];
/* Index builds are Mongoose's own background work on first use, not reads. */
mongoose.set('debug', (collection, method) => {
  if (!/index/i.test(method)) queries.push(`${collection}.${method}`);
});
const queriesOn = (...collections) => queries.filter((q) => collections.includes(q.split('.')[0]));

const cacheOn = async () => {
  await cache.close();
  /* Connected (and its 'ready' emitted) BEFORE it is handed over, so the
     reconnect flush cannot land in the middle of a test. */
  const client = new RedisMock({ lazyConnect: true });
  await client.connect();
  client.status = 'ready';
  await client.flushall();
  cache.init({ client });
};

const cacheOff = async () => { await cache.close(); };

const cacheDown = async () => {
  await cache.close();
  const client = new Redis('redis://127.0.0.1:1', {
    enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 150, retryStrategy: () => 1000,
  });
  client.on('error', () => {});
  cache.init({ client });
};

beforeEach(() => { queries.length = 0; });

/* ── Seeds ────────────────────────────────────────────────────────────────*/

const OWNER_PHONE = '+919876543210';

const seedStay = async () => {
  await Partner.create({
    partnerId: 'par_cache_1', phone: OWNER_PHONE, name: 'Venky', phoneVerifiedAt: new Date(),
  });
  const pg = await Property.create({
    name: 'Cache House', place: 'HSR Layout, Bangalore', ownerName: 'Sunand', ownerMobile: OWNER_PHONE,
    category: 'PG_HOSTEL', rent: 6000, status: 'active',
    categoryDetails: { sharingTypes: ['Single'], sharingPrices: { Single: 6000 }, sharingBeds: { Single: 4 } },
  });
  await syncShareTypes(pg);
  const other = await Property.create({
    name: 'Second Stay', place: 'Koramangala, Bangalore', ownerName: 'Someone', ownerMobile: '+919000000002',
    category: 'PG_HOSTEL', rent: 5000, status: 'active',
  });
  return { pg, other };
};

const seedFood = async () => {
  await FoodRestaurant.create({
    restaurantId: 'FP-CACHE001', restaurantName: 'Cache Kitchen', ownerName: 'Owner',
    ownerPhone: '+919000000011', ownerEmail: 'cache1@example.invalid', contactNumber: '+919000000019',
    fssaiLicenseNumber: '12345678901234', cuisineTypes: ['Chinese'],
    verificationStatus: 'approved', isActive: true, openState: 'open',
    deliveryFee: { type: 'flat', amount: 20 }, address: { line1: 'Opposite the RTC complex', city: 'Hyderabad' },
    location: { type: 'Point', coordinates: [78.4867, 17.385] },
  });
  await FoodRestaurant.create({
    restaurantId: 'FP-CACHE002', restaurantName: 'Other Kitchen', ownerName: 'Owner',
    ownerPhone: '+919000000012', ownerEmail: 'cache2@example.invalid',
    fssaiLicenseNumber: '12345678901235', cuisineTypes: ['Biryani'],
    verificationStatus: 'approved', isActive: true, openState: 'open',
    address: { line1: 'Main road', city: 'Hyderabad' },
    location: { type: 'Point', coordinates: [78.49, 17.39] },
  });
  await FoodProduct.create({
    productId: 'FPI-CACHE001', restaurantId: 'FP-CACHE001', productName: 'Veg Hakka Noodles',
    category: 'Noodles', price: 120, isVeg: 'veg', isAvailable: true,
  });
};

const STAY_COLLECTIONS = ['properties', 'app_partners', 'partner_reviews'];
const FOOD_COLLECTIONS = ['food_restaurants', 'food_products'];

/* ── (a) MISS then HIT, and a HIT does not query ──────────────────────────*/

describe('(a) first read is a MISS that queries Mongo, the second a HIT that does not', () => {
  beforeEach(cacheOn);

  it('stay feed', async () => {
    await seedStay();
    queries.length = 0;
    const first = await get('/api/v2/listings?category=PG_HOSTEL');
    assert.equal(first.cache, 'MISS');
    assert.ok(queriesOn('properties').length > 0);

    queries.length = 0;
    const second = await get('/api/v2/listings?category=PG_HOSTEL');
    assert.equal(second.cache, 'HIT');
    assert.deepEqual(queriesOn(...STAY_COLLECTIONS), []);
    assert.deepEqual(second.body, first.body);
  });

  it('every page of the stay feed shares one entry', async () => {
    await seedStay();
    await get('/api/v2/listings?limit=1');
    const page2 = await get('/api/v2/listings?limit=1&offset=1');
    assert.equal(page2.cache, 'HIT');
    assert.equal(page2.body.data.length, 1);
    assert.equal(page2.body.count, 2);
  });

  it('one listing', async () => {
    const { pg } = await seedStay();
    queries.length = 0;
    const first = await get(`/api/v2/listings/${pg._id}`);
    assert.equal(first.cache, 'MISS');
    assert.ok(queriesOn('properties').length > 0);

    queries.length = 0;
    const second = await get(`/api/v2/listings/${pg._id}`);
    assert.equal(second.cache, 'HIT');
    assert.deepEqual(queriesOn(...STAY_COLLECTIONS), []);
    assert.deepEqual(second.body, first.body);
    assert.equal(second.body.data.ownerName, 'Venky');
  });

  it('kitchen feed, with and without openNow', async () => {
    await seedFood();
    for (const path of ['/api/v2/food-partners/restaurants', '/api/v2/food-partners/restaurants?openNow=true&cuisine=Chinese']) {
      queries.length = 0;
      // eslint-disable-next-line no-await-in-loop
      const first = await get(path);
      assert.equal(first.cache, 'MISS');
      assert.ok(queriesOn('food_restaurants').length > 0);

      queries.length = 0;
      // eslint-disable-next-line no-await-in-loop
      const second = await get(path);
      assert.equal(second.cache, 'HIT');
      assert.deepEqual(queriesOn(...FOOD_COLLECTIONS), []);
      assert.deepEqual(second.body, first.body);
    }
  });

  it('one kitchen and its menu', async () => {
    await seedFood();
    const first = await get('/api/v2/food-partners/restaurants/FP-CACHE001');
    assert.equal(first.cache, 'MISS');
    queries.length = 0;
    const second = await get('/api/v2/food-partners/restaurants/fp-cache001');
    assert.equal(second.cache, 'HIT');
    assert.deepEqual(queriesOn(...FOOD_COLLECTIONS), []);
    assert.deepEqual(second.body, first.body);
    assert.equal(second.body.data.menu[0].items[0].productName, 'Veg Hakka Noodles');
  });
});

/* ── What is never frozen ─────────────────────────────────────────────────*/

describe('what stays live under a cached read', () => {
  beforeEach(cacheOn);

  it('bed counts and the owner\'s pause switch are read on every request', async () => {
    const { pg } = await seedStay();
    const first = await get(`/api/v2/listings/${pg._id}`);
    assert.equal(first.body.data.sharingOptions[0].availableBeds, 4);

    const [row] = await PartnerShareType.find({ propertyId: String(pg._id) }).lean();
    await setFreeBeds({ propertyId: pg._id, shareTypeId: row.shareTypeId, freeBeds: 1 });

    const detail = await get(`/api/v2/listings/${pg._id}`);
    assert.equal(detail.cache, 'HIT', 'the property itself did not change');
    assert.equal(detail.body.data.sharingOptions[0].availableBeds, 1);

    await get('/api/v2/listings');
    await PartnerShareType.updateMany({ propertyId: String(pg._id) }, { $set: { isAvailable: false } });
    const feed = await get('/api/v2/listings');
    assert.equal(feed.cache, 'HIT');
    assert.ok(!feed.body.data.some((l) => l.id === String(pg._id)), 'a switched-off listing leaves the feed at once');
  });

  it('the kitchen is cached as a document, not as a reply — isCurrentlyOpen is not stored', async () => {
    await seedFood();
    await get('/api/v2/food-partners/restaurants/FP-CACHE001');
    const stored = await cache.get('food:restaurant:v1:FP-CACHE001');
    assert.equal(stored.restaurantName, 'Cache Kitchen');
    assert.ok(!('isCurrentlyOpen' in stored));
    assert.ok(Array.isArray(stored.openingHours) || stored.openingHours === undefined);
  });

  it('"near me" is never cached', async () => {
    await seedStay();
    await seedFood();
    /* No X-Cache at all: the cache was never consulted. */
    assert.equal((await get('/api/v2/listings?lat=12.91&lng=77.64')).cache, null);
    assert.equal((await get('/api/v2/listings?lat=12.91&lng=77.64')).cache, null);
    queries.length = 0;
    assert.equal((await get('/api/v2/food-partners/restaurants?lat=17.385&lng=78.4867')).cache, null);
    assert.equal((await get('/api/v2/food-partners/restaurants?lat=17.385&lng=78.4867')).cache, null);
    assert.ok(queriesOn('food_restaurants').length >= 2, 'both located reads went to Mongo');
  });

  it('sends no Cache-Control that would make the phone hold on to a reply', async () => {
    await seedStay();
    const res = await fetch(`${base}/api/v2/listings`);
    assert.ok(!/max-age=[1-9]/.test(res.headers.get('cache-control') || ''));
  });
});

/* ── (b) A write invalidates ──────────────────────────────────────────────*/

describe('(b) a committed write invalidates, and the next read is fresh', () => {
  beforeEach(cacheOn);

  it('a property edited through save()', async () => {
    const { pg } = await seedStay();
    await get('/api/v2/listings');
    await get(`/api/v2/listings/${pg._id}`);

    const doc = await Property.findById(pg._id);
    doc.name = 'Renamed House';
    await doc.save();

    const detail = await get(`/api/v2/listings/${pg._id}`);
    assert.equal(detail.cache, 'MISS');
    assert.equal(detail.body.data.name, 'Renamed House');
    const feed = await get('/api/v2/listings');
    assert.equal(feed.cache, 'MISS');
    assert.ok(feed.body.data.some((l) => l.name === 'Renamed House'));
  });

  it('a property updated by query, removed, and deleted', async () => {
    const { pg, other } = await seedStay();
    await get(`/api/v2/listings/${pg._id}`);

    await Property.findByIdAndUpdate(pg._id, { $set: { rent: 7000 } });
    assert.equal((await get(`/api/v2/listings/${pg._id}`)).body.data.rent, 7000);

    await Property.updateOne({ _id: pg._id }, { $set: { status: 'removed' } });
    const removed = await get(`/api/v2/listings/${pg._id}`);
    assert.equal(removed.body.data.removed, true);
    assert.ok(!(await get('/api/v2/listings')).body.data.some((l) => l.id === String(pg._id)));

    await get(`/api/v2/listings/${other._id}`);
    await Property.findByIdAndDelete(other._id);
    assert.equal((await get(`/api/v2/listings/${other._id}`)).status, 404);
  });

  it('a new property appears in a cached feed', async () => {
    await seedStay();
    const before = await get('/api/v2/listings');
    await Property.create({
      name: 'Brand New', place: 'BTM Layout, Bangalore', ownerName: 'New', ownerMobile: '+919000000003',
      category: 'PG_HOSTEL', rent: 4000,
    });
    const after = await get('/api/v2/listings');
    assert.equal(after.cache, 'MISS');
    assert.equal(after.body.count, before.body.count + 1);
  });

  it('a partner\'s name — but not a partner\'s sign-in code', async () => {
    const { pg } = await seedStay();
    await get(`/api/v2/listings/${pg._id}`);

    await Partner.updateOne({ partnerId: 'par_cache_1' }, { $set: { otpAttempts: 1 } });
    assert.equal((await get(`/api/v2/listings/${pg._id}`)).cache, 'HIT', 'nothing public changed');

    const partner = await Partner.findOne({ partnerId: 'par_cache_1' });
    partner.name = 'Venkatesh';
    await partner.save();
    const after = await get(`/api/v2/listings/${pg._id}`);
    assert.equal(after.cache, 'MISS');
    assert.equal(after.body.data.ownerName, 'Venkatesh');
  });

  it('a kitchen renamed, closed, or unlisted — but not its push token', async () => {
    await seedFood();
    await get('/api/v2/food-partners/restaurants');
    await get('/api/v2/food-partners/restaurants/FP-CACHE001');

    await FoodRestaurant.updateOne({ restaurantId: 'FP-CACHE001' }, { $set: { ownerName: 'Changed' } });
    assert.equal((await get('/api/v2/food-partners/restaurants/FP-CACHE001')).cache, 'HIT');

    const doc = await FoodRestaurant.findOne({ restaurantId: 'FP-CACHE001' });
    doc.restaurantName = 'Renamed Kitchen';
    doc.openState = 'closed';
    await doc.save();
    const detail = await get('/api/v2/food-partners/restaurants/FP-CACHE001');
    assert.equal(detail.cache, 'MISS');
    assert.equal(detail.body.data.restaurant.restaurantName, 'Renamed Kitchen');
    assert.equal(detail.body.data.restaurant.isCurrentlyOpen, false);
    const feed = await get('/api/v2/food-partners/restaurants');
    assert.equal(feed.cache, 'MISS');
    assert.ok(feed.body.data.some((r) => r.restaurantName === 'Renamed Kitchen'));

    await FoodRestaurant.updateOne({ restaurantId: 'FP-CACHE001' }, { $set: { isActive: false } });
    assert.equal((await get('/api/v2/food-partners/restaurants/FP-CACHE001')).status, 404);
    assert.ok(!(await get('/api/v2/food-partners/restaurants')).body.data.some((r) => r.restaurantId === 'FP-CACHE001'));
  });

  it('a dish edited, sold out, added, and deleted', async () => {
    await seedFood();
    const path = '/api/v2/food-partners/restaurants/FP-CACHE001';
    await get(path);

    await FoodProduct.findOneAndUpdate({ productId: 'FPI-CACHE001' }, { $set: { price: 150 } });
    const priced = await get(path);
    assert.equal(priced.body.data.menu[0].items[0].price, 150);

    await FoodProduct.create({
      productId: 'FPI-CACHE002', restaurantId: 'FP-CACHE001', productName: 'Fried Rice',
      category: 'Rice', price: 110, isVeg: 'veg', isAvailable: true,
    });
    assert.equal((await get(path)).body.count, 2);

    const dish = await FoodProduct.findOne({ productId: 'FPI-CACHE002' });
    dish.isAvailable = false;
    await dish.save();
    assert.equal((await get(path)).body.count, 1);

    await FoodProduct.deleteMany({ restaurantId: 'FP-CACHE001' });
    assert.equal((await get(path)).body.count, 0);
  });

  it('"not found" is remembered, and forgotten the moment the thing exists', async () => {
    const first = await get('/api/v2/food-partners/restaurants/FP-NOPE0001');
    assert.equal(first.status, 404);
    const second = await get('/api/v2/food-partners/restaurants/FP-NOPE0001');
    assert.equal(second.status, 404);
    assert.equal(second.cache, 'HIT');
    assert.deepEqual(second.body, first.body);

    await FoodRestaurant.create({
      restaurantId: 'FP-NOPE0001', restaurantName: 'Now Here', ownerName: 'Owner',
      ownerPhone: '+919000000013', ownerEmail: 'nope@example.invalid', fssaiLicenseNumber: '12345678901236',
      cuisineTypes: ['Chinese'], verificationStatus: 'approved', isActive: true,
      address: { line1: 'Somewhere' },
    });
    assert.equal((await get('/api/v2/food-partners/restaurants/FP-NOPE0001')).status, 200);
  });
});

/* ── (c) On, off and down answer the same ─────────────────────────────────*/

describe('(c) cache on, off, and Redis unreachable answer identically', () => {
  const PATHS = (pgId) => [
    '/api/v2/listings',
    '/api/v2/listings?category=PG_HOSTEL&city=Bangalore',
    '/api/v2/listings?limit=1&offset=1',
    '/api/v2/listings?locality=hsr%20layout',
    '/api/v2/listings?lat=12.91&lng=77.64',
    `/api/v2/listings/${pgId}`,
    '/api/v2/listings/000000000000000000000000',
    '/api/v2/listings/not-an-id',
    '/api/v2/food-partners/restaurants',
    '/api/v2/food-partners/restaurants?cuisine=chinese,Biryani&limit=1&page=2',
    '/api/v2/food-partners/restaurants?openNow=true',
    '/api/v2/food-partners/restaurants?search=kitchen',
    '/api/v2/food-partners/restaurants/FP-CACHE001',
    '/api/v2/food-partners/restaurants/FP-MISSING1',
  ];

  it('every endpoint, status and body', async () => {
    const { pg } = await seedStay();
    await seedFood();
    const paths = PATHS(pg._id);

    const read = async () => {
      const out = [];
      for (const path of paths) {
        // eslint-disable-next-line no-await-in-loop
        const { status, body } = await get(path);
        out.push({ path, status, body });
      }
      return out;
    };

    await cacheOff();
    const off = await read();

    await cacheOn();
    const miss = await read();
    const hit = await read();

    await cacheDown();
    const down = await read();

    for (let i = 0; i < paths.length; i += 1) {
      assert.deepEqual(miss[i], off[i], `MISS differs from uncached: ${paths[i]}`);
      assert.deepEqual(hit[i], off[i], `HIT differs from uncached: ${paths[i]}`);
      assert.deepEqual(down[i], off[i], `Redis-down differs from uncached: ${paths[i]}`);
    }
    assert.ok(off.every((r) => r.status === 200 || r.status === 404));
  });

  it('with the cache off, X-Cache says BYPASS and nothing is stored', async () => {
    await cacheOff();
    await seedStay();
    const res = await get('/api/v2/listings');
    assert.equal(res.status, 200);
    assert.equal(res.cache, 'BYPASS');
  });
});
