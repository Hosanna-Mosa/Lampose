/* ══════════════════════════════════════════════════════════════════════════
   The Google Play review accounts — `reviewAccounts.service.js`.

     · All three are created from the environment, once — a second run makes
       no duplicates.
     · Each signs in through its app's ORDINARY production login.
     · Whatever would lock a reviewer out (a block, a changed password) is put
       right by the next run.
     · The review kitchen signs in but is never listed to diners.
     · A real account already holding the review email is never taken over.
     · Account deletion never erases a review account.

   The environment is set before the app is required: `config/env.js` reads
   it once at load.
   ══════════════════════════════════════════════════════════════════════════ */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-review-accounts';
process.env.REVIEW_LOGIN_PHONE = '9998887456';
process.env.REVIEW_LOGIN_OTP = '665544';
process.env.REVIEW_PARTNER_EMAIL = 'review.stay@example.com';
process.env.REVIEW_PARTNER_PASSWORD = 'stay-review-pass-1';
process.env.REVIEW_RESTAURANT_EMAIL = 'review.kitchen@example.com';
process.env.REVIEW_RESTAURANT_PASSWORD = 'kitchen-review-pass-1';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const Customer = require('../src/modules/customers/customer.model');
const Partner = require('../src/modules/partners/partner.model');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const Driver = require('../src/modules/drivers/driver.model');
const { findCandidatesWithinRadius } = require('../src/modules/drivers/driverMatch.service');
const { ensureReviewAccounts, REVIEW_LISTING_TAG } = require('../src/modules/reviewAccounts/reviewAccounts.service');
const { processDueDeletions } = require('../src/modules/accountDeletion/accountDeletion.eraser');

withDatabase();

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const call = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const partnerLogin = (password = process.env.REVIEW_PARTNER_PASSWORD) => call('POST', '/api/v2/partners/auth/login', {
  email: process.env.REVIEW_PARTNER_EMAIL, password,
});
const kitchenLogin = (identifier = process.env.REVIEW_RESTAURANT_EMAIL) => call('POST', '/api/v2/food-partners/auth/login', {
  identifier, password: process.env.REVIEW_RESTAURANT_PASSWORD,
});

describe('creating the review accounts', () => {
  it('creates all three once, and each signs in through the normal login', async () => {
    const first = await ensureReviewAccounts();
    assert.deepEqual(first, {
      user: 'created', rider: 'created', stayPartner: 'created', stayPartnerListing: 'created',
      foodPartner: 'created', foodPartnerMenu: 'created',
    });
    const second = await ensureReviewAccounts();
    assert.deepEqual(second, {
      user: 'kept', rider: 'kept', stayPartner: 'kept', stayPartnerListing: 'kept',
      foodPartner: 'kept', foodPartnerMenu: 'kept',
    });
    assert.equal(await Partner.countDocuments({ email: process.env.REVIEW_PARTNER_EMAIL }), 1);

    const stay = await partnerLogin();
    assert.equal(stay.status, 200, JSON.stringify(stay.body));
    assert.ok(stay.body.data.token);

    const kitchen = await kitchenLogin();
    assert.equal(kitchen.status, 200, JSON.stringify(kitchen.body));
    assert.ok(kitchen.body.data.token);
    /* The review number works as the identifier too. */
    assert.equal((await kitchenLogin('9998887456')).status, 200);

    const started = await call('POST', '/api/v2/customers/auth/start', { phone: '9998887456' });
    assert.equal(started.status, 200);
    const verified = await call('POST', '/api/v2/customers/auth/verify', { phone: '9998887456', otp: '665544' });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
  });

  it('never lists the review kitchen to diners', async () => {
    await ensureReviewAccounts();
    const feed = await call('GET', '/api/v2/food-partners/restaurants');
    const rows = JSON.stringify(feed.body);
    assert.equal(rows.includes('FP-REVIEW01'), false);
  });
});

describe('the review rider', () => {
  const riderSignIn = async () => {
    const started = await call('POST', '/api/v2/drivers/auth/start', { phone: '9998887456' });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    return call('POST', '/api/v2/drivers/auth/verify', { phone: '9998887456', code: '665544' });
  };

  it('signs in with the fixed code, approved and past onboarding', async () => {
    await ensureReviewAccounts();
    const verified = await riderSignIn();
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const rider = verified.body.data.driver;
    assert.equal(rider.driverId, 'DR-REVIEW01');
    assert.equal(rider.hasCompletedOnboarding, true);
    assert.equal(rider.canGoOnline, true);
    /* Straight away again — no cooldown for the review number. */
    assert.equal((await riderSignIn()).status, 200);
  });

  it('is created by the sign-in itself if the keeper has not run yet', async () => {
    await Driver.deleteMany({ phone: '+919998887456' });
    const verified = await riderSignIn();
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.data.driver.driverId, 'DR-REVIEW01');
  });

  it('is never found by the rider matcher, even online beside the kitchen', async () => {
    await ensureReviewAccounts();
    const here = [78.39, 17.45];
    await Driver.updateOne({ driverId: 'DR-REVIEW01' }, {
      $set: {
        isOnline: true, isAvailable: true, locationUpdatedAt: new Date(),
        currentLocation: { type: 'Point', coordinates: here },
      },
    });
    await Driver.create({
      driverId: 'DR-REALONE', phone: '+919811100011', status: 'approved', hasCompletedOnboarding: true,
      isOnline: true, isAvailable: true, locationUpdatedAt: new Date(),
      currentLocation: { type: 'Point', coordinates: here },
    });
    await Driver.syncIndexes();
    const found = await findCandidatesWithinRadius({ pickup: here, radiusMeters: 3000 });
    const ids = found.map((row) => row.driverId);
    assert.ok(ids.includes('DR-REALONE'), `the control rider is found: ${JSON.stringify(ids)}`);
    assert.equal(ids.includes('DR-REVIEW01'), false);
    await Driver.deleteOne({ driverId: 'DR-REALONE' });
  });

  it('is put back to approved after a reviewer resubmits a document', async () => {
    await ensureReviewAccounts();
    await Driver.updateOne({ driverId: 'DR-REVIEW01' }, {
      $set: { status: 'pending', hasCompletedOnboarding: false, 'documents.0.status': 'pending' },
    });
    await ensureReviewAccounts();
    const rider = await Driver.findOne({ driverId: 'DR-REVIEW01' }).lean();
    assert.equal(rider.status, 'approved');
    assert.equal(rider.hasCompletedOnboarding, true);
    assert.ok(rider.documents.every((doc) => doc.status === 'verified'));
  });

  it('a real rider on the review number is left alone', async () => {
    await Driver.deleteMany({ phone: '+919998887456' });
    await Driver.create({ driverId: 'DR-REALREV', phone: '+919998887456', name: 'Real Rider' });
    assert.equal((await ensureReviewAccounts()).rider, 'conflict');
    const real = await Driver.findOne({ driverId: 'DR-REALREV' }).lean();
    assert.equal(real.status, 'pending');
    await Driver.deleteMany({ phone: '+919998887456' });
    await ensureReviewAccounts();
  });
});

describe('sample content', () => {
  const authed = async (path, token) => {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  it('the review owner sees their PG, and no student can find, open, save or request it', async () => {
    await ensureReviewAccounts();
    const Property = require('../src/modules/properties/property.model');
    const listing = await Property.findOne({ employeeEmail: REVIEW_LISTING_TAG }).lean();
    const id = String(listing._id);

    const token = (await partnerLogin()).body.data.token;
    const mine = await authed('/api/v2/partners/properties', token);
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.ok(JSON.stringify(mine.body).includes(id), 'the owner sees the sample PG');

    const feed = await call('GET', '/api/v2/listings');
    assert.equal(JSON.stringify(feed.body).includes(id), false, 'not in the public feed');
    assert.equal((await call('GET', `/api/v2/listings/${id}`)).status, 404, 'no public listing page');
    const visit = await call('POST', '/api/v2/visit-requests', { listingId: id, phone: '9876500000', name: 'S' });
    assert.notEqual(visit.status, 201, 'cannot be requested');
    assert.equal(JSON.stringify(visit.body).includes('9998887456'), false);

    /* The control: the same document, active, is found — so the 404s above
       are the status doing its job, not a wrong path. */
    await Property.updateOne({ _id: listing._id }, { $set: { status: 'active' } });
    assert.equal((await call('GET', `/api/v2/listings/${id}`)).status, 200);
    assert.ok(JSON.stringify((await call('GET', '/api/v2/listings')).body).includes(id));
    await ensureReviewAccounts();
    assert.equal((await call('GET', `/api/v2/listings/${id}`)).status, 404, 'the keeper hides it again');
  });

  it('puts the PG back when the reviewer removes it, and refills an emptied menu', async () => {
    await ensureReviewAccounts();
    const Property = require('../src/modules/properties/property.model');
    const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
    await Property.updateOne({ employeeEmail: REVIEW_LISTING_TAG }, { $set: { status: 'removed' } });
    await FoodProduct.deleteMany({ restaurantId: 'FP-REVIEW01' });

    await ensureReviewAccounts();

    assert.equal((await Property.findOne({ employeeEmail: REVIEW_LISTING_TAG }).lean()).status, 'review');
    assert.equal(await FoodProduct.countDocuments({ restaurantId: 'FP-REVIEW01' }), 4);
  });

  it('leaves a menu the reviewer edited alone', async () => {
    await ensureReviewAccounts();
    const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
    await FoodProduct.deleteMany({ restaurantId: 'FP-REVIEW01', productId: { $ne: 'FPI-REVIEW01' } });
    await ensureReviewAccounts();
    assert.equal(await FoodProduct.countDocuments({ restaurantId: 'FP-REVIEW01' }), 1);
  });
});

describe('keeping them usable', () => {
  it('unblocks the accounts and restores a changed password', async () => {
    await ensureReviewAccounts();
    await Customer.updateOne({ phone: '+919998887456' }, { $set: { status: 'blocked' } });
    await Partner.updateOne({ email: process.env.REVIEW_PARTNER_EMAIL }, {
      $set: { status: 'blocked', passwordHash: await Partner.hashPassword('somebody-changed-it') },
    });
    assert.equal((await partnerLogin()).status, 401);

    await ensureReviewAccounts();

    assert.equal((await Customer.findOne({ phone: '+919998887456' }).lean()).status, 'active');
    assert.equal((await partnerLogin()).status, 200);
  });

  it('is never erased by a due deletion request', async () => {
    await ensureReviewAccounts();
    const past = {
      status: 'requested',
      requestedAt: new Date(Date.now() - 40 * 86400000),
      scheduledFor: new Date(Date.now() - 86400000),
      source: 'app',
    };
    await Customer.updateOne({ phone: '+919998887456' }, { $set: { deletion: past } });
    await Partner.updateOne({ email: process.env.REVIEW_PARTNER_EMAIL }, { $set: { deletion: past } });
    await FoodRestaurant.updateOne({ restaurantId: 'FP-REVIEW01' }, { $set: { deletion: past } });
    await Driver.updateOne({ driverId: 'DR-REVIEW01' }, { $set: { deletion: past } });

    const summary = await processDueDeletions();
    assert.equal(summary.erased, 0, JSON.stringify(summary));
    assert.equal((await partnerLogin()).status, 200);
    assert.equal((await kitchenLogin()).status, 200);
  });
});

describe('real accounts', () => {
  it('a real owner already holding the review email is left alone', async () => {
    await Partner.create({
      partnerId: 'par_real_owner', phone: '+919811122233', email: process.env.REVIEW_PARTNER_EMAIL,
      name: 'Real Owner', passwordHash: await Partner.hashPassword('the-real-owners-password'),
    });
    const result = await ensureReviewAccounts();
    assert.equal(result.stayPartner, 'conflict');
    const real = await Partner.findOne({ partnerId: 'par_real_owner' }).select('+passwordHash');
    assert.equal(await real.verifyPassword('the-real-owners-password'), true);
    assert.equal(real.name, 'Real Owner');
  });
});
