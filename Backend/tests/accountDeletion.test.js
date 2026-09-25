/* ══════════════════════════════════════════════════════════════════════════
   Account deletion, for all four self-serve apps — through the real app.

   What has to hold, and each of these fails silently on its own:

     · Every app — diner, owner, kitchen, rider — can delete from the public
       page with a code texted to the number, and from inside the app with its
       own session. Both delete AT ONCE: the account is archived into
       `deleted_account_archives`, the live row is emptied (never removed),
       and the session it held stops working.
     · The public page never says whether a number has an account: the same
       reply for a stranger's number, and no SMS sent to it.
     · A wrong code is counted and locks; a right one is spent once.
     · A request queued from before deletion was immediate can still be
       cancelled in the app, and the public page still reports it.
     · A token from one app cannot read or write another app's request.
     · The rider page's original address still answers.

   The SMS gateway is replaced on the module object — nothing leaves the
   machine, and what "would have been sent" is recorded to read the code from.
   ══════════════════════════════════════════════════════════════════════════ */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-account-deletion';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const sms = require('../src/infrastructure/sms/sms');
const Customer = require('../src/modules/customers/customer.model');
const Partner = require('../src/modules/partners/partner.model');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const Driver = require('../src/modules/drivers/driver.model');
const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');
const { signFoodPartnerToken } = require('../src/modules/foodpartners/foodPartnerAuth.middleware');
const { signDriverToken } = require('../src/modules/drivers/driverAuth.middleware');
const DeletedAccountArchive = require('../src/modules/accountDeletion/deletedAccountArchive.model');

withDatabase();

let server;
let base;
let outbox = [];

before(async () => {
  sms.smsConfigProblem = () => null;
  sms.sendOtpSms = async (phone, otp) => {
    outbox.push({ phone, otp });
    return { success: true, campId: 'CAMP-TEST' };
  };
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => { outbox = []; });

const call = async (method, path, { token, body, ip } = {}) => {
  const sendsBody = body && !['GET', 'HEAD'].includes(method);
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(sendsBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(ip ? { 'X-Forwarded-For': ip } : {}),
    },
    body: sendsBody ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

/* Each test uses its own numbers so the in-process per-phone limiters, which
   survive between tests, never decide an assertion. */
let seq = 0;
const nextPhone = () => {
  seq += 1;
  return `+9198${String(700000 + seq).padStart(8, '0')}`;
};

const makers = {
  customer: async (phone) => {
    const doc = await Customer.create({ customerId: `cus_del_${seq}`, phone, name: 'Diner', phoneVerifiedAt: new Date() });
    return { doc, token: signCustomerToken(doc), Model: Customer, inApp: '/api/v2/customers/me/account-deletion' };
  },
  partner: async (phone) => {
    const doc = await Partner.create({ partnerId: `par_del_${seq}`, phone, name: 'Owner', phoneVerifiedAt: new Date() });
    return { doc, token: signPartnerToken(doc), Model: Partner, inApp: '/api/v2/partners/me/account-deletion' };
  },
  restaurant: async (phone) => {
    const doc = await FoodRestaurant.create({
      restaurantId: `FP-DEL${String(seq).padStart(4, '0')}`,
      restaurantName: 'Test Kitchen',
      ownerName: 'Owner',
      ownerPhone: phone,
      fssaiLicenseNumber: '12345678901234',
      cuisineTypes: ['Chinese'],
      verificationStatus: 'approved',
      address: { line1: 'Opposite the RTC complex' },
      location: { type: 'Point', coordinates: [78.4867, 17.385] },
    });
    return { doc, token: signFoodPartnerToken(doc), Model: FoodRestaurant, inApp: '/api/v2/food-partners/me/account-deletion' };
  },
  driver: async (phone) => {
    const doc = await Driver.create({ driverId: `DRV-DEL${seq}`, phone, name: 'Rider' });
    return { doc, token: signDriverToken(doc), Model: Driver, inApp: '/api/v2/drivers/me/account-deletion' };
  },
};

const APPS = Object.keys(makers);

describe('the public page', () => {
  it('lists all four apps, and says deletion is immediate', async () => {
    const res = await call('GET', '/api/v2/account-deletion/policy');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.apps.map((a) => a.key), APPS);
    assert.equal(res.body.data.graceDays, 0);
    assert.equal(res.body.data.immediate, true);
  });

  for (const app of APPS) {
    it(`${app}: a texted code deletes the account at once, archived first`, async () => {
      const phone = nextPhone();
      const { doc, Model } = await makers[app](phone);

      const started = await call('POST', `/api/v2/account-deletion/${app}/start`, { body: { phone } });
      assert.equal(started.status, 200, JSON.stringify(started.body));
      assert.equal(outbox.length, 1);
      assert.equal(outbox[0].phone, phone);

      const confirmed = await call('POST', `/api/v2/account-deletion/${app}/confirm`, {
        body: { phone, code: outbox[0].otp, reason: 'Moving city', email: 'Me@Example.com' },
      });
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
      assert.equal(confirmed.body.data.status, 'completed');
      assert.equal(confirmed.body.data.deleted, true);
      assert.equal(confirmed.body.data.app, app);

      const row = await Model.findById(doc._id).lean();
      assert.ok(row, 'the row stays — emptied, never removed');
      assert.equal(row.deletion.status, 'completed');
      assert.equal(row.deletion.source, 'web');
      assert.equal(row.deletion.reason, '', 'free text is kept on the archive, not the row');

      const archive = await DeletedAccountArchive.findOne({ app, accountObjectId: doc._id }).lean();
      assert.ok(archive, 'the account is archived');
      assert.equal(archive.status, 'completed');
      assert.equal(archive.phone, phone);
      assert.equal(archive.source, 'web');
      assert.equal(archive.reason, 'Moving city');
      assert.equal(archive.contactEmail, 'me@example.com');

      /* The code is spent. */
      const replay = await call('POST', `/api/v2/account-deletion/${app}/confirm`, {
        body: { phone, code: outbox[0].otp },
      });
      assert.equal(replay.status, 400);
    });
  }

  it('answers a number with no account exactly as one with, and texts nobody', async () => {
    const known = nextPhone();
    await makers.customer(known);
    const stranger = nextPhone();

    const a = await call('POST', '/api/v2/account-deletion/customer/start', { body: { phone: known } });
    const b = await call('POST', '/api/v2/account-deletion/customer/start', { body: { phone: stranger } });
    assert.equal(a.status, b.status);
    assert.deepEqual(Object.keys(a.body.data).sort(), Object.keys(b.body.data).sort());
    assert.deepEqual(outbox.map((m) => m.phone), [known]);

    const wrong = await call('POST', '/api/v2/account-deletion/customer/confirm', { body: { phone: stranger, code: '123456' } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.code, 'CODE_INCORRECT');
  });

  it('a number registered in ONE app is a stranger to the others', async () => {
    const phone = nextPhone();
    await makers.driver(phone);
    await call('POST', '/api/v2/account-deletion/customer/start', { body: { phone } });
    assert.equal(outbox.length, 0);
  });

  it('locks the code after too many wrong tries', async () => {
    const phone = nextPhone();
    await makers.partner(phone);
    await call('POST', '/api/v2/account-deletion/partner/start', { body: { phone } });
    const right = outbox[0].otp;
    const wrongCode = right === '000000' ? '111111' : '000000';

    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await call('POST', '/api/v2/account-deletion/partner/confirm', { body: { phone, code: wrongCode } });
    }
    assert.equal(last.status, 429);
    const locked = await call('POST', '/api/v2/account-deletion/partner/confirm', { body: { phone, code: right } });
    assert.equal(locked.status, 429, 'the right code must not work while locked');
  });

  it('accepts the friendlier spellings and refuses an unknown app', async () => {
    const alias = await call('GET', '/api/v2/account-deletion/rider/policy');
    assert.equal(alias.status, 200);
    assert.equal(alias.body.data.app, 'driver');

    const unknown = await call('POST', '/api/v2/account-deletion/nonsense/start', { body: { phone: nextPhone() } });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.code, 'UNKNOWN_APP');
  });

  it("keeps the rider page's original address working", async () => {
    const phone = nextPhone();
    const { doc } = await makers.driver(phone);
    await call('POST', '/api/v2/drivers/account/deletion/start', { body: { phone } });
    assert.equal(outbox.length, 1);
    const confirmed = await call('POST', '/api/v2/drivers/account/deletion/confirm', {
      body: { phone, code: outbox[0].otp },
    });
    assert.equal(confirmed.status, 200);
    assert.equal((await Driver.findById(doc._id).lean()).deletion.status, 'completed');
  });

  it('a deleted account is a stranger to the page: no code is sent', async () => {
    const phone = nextPhone();
    const { token, inApp } = await makers.restaurant(phone);
    await call('POST', inApp, { token });

    const started = await call('POST', '/api/v2/account-deletion/restaurant/start', { body: { phone } });
    assert.equal(started.status, 200);
    assert.equal(started.body.data.alreadyRequested, undefined);
    assert.equal(outbox.length, 0);
  });

  it('still reports a request queued from before deletion was immediate', async () => {
    const phone = nextPhone();
    const { doc, Model } = await makers.restaurant(phone);
    await Model.updateOne({ _id: doc._id }, {
      $set: { deletion: { status: 'requested', requestedAt: new Date(), scheduledFor: new Date(Date.now() + 86400000), source: 'app' } },
    });

    const started = await call('POST', '/api/v2/account-deletion/restaurant/start', { body: { phone } });
    assert.equal(started.body.data.alreadyRequested, true);
    assert.equal(started.body.data.request.status, 'requested');
    assert.equal(outbox.length, 0);
  });
});

describe('inside the app', () => {
  for (const app of APPS) {
    it(`${app}: status, then delete — archived, emptied, and the session ends`, async () => {
      const { doc, token, Model, inApp } = await makers[app](nextPhone());

      const before = await call('GET', inApp, { token });
      assert.equal(before.status, 200, JSON.stringify(before.body));
      assert.equal(before.body.data.status, 'none');
      assert.equal(before.body.data.immediate, true);

      const deleted = await call('POST', inApp, { token, body: { reason: 'Not using it' } });
      assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
      assert.equal(deleted.body.data.status, 'completed');
      assert.equal(deleted.body.data.deleted, true);
      assert.equal(deleted.body.data.canCancel, false);

      const row = await Model.findById(doc._id).lean();
      assert.equal(row.deletion.status, 'completed');
      assert.equal(row.deletion.source, 'app');

      const archive = await DeletedAccountArchive.findOne({ app, accountObjectId: doc._id }).lean();
      assert.equal(archive.status, 'completed');
      assert.equal(archive.reason, 'Not using it');

      /* The account is gone for this person: the same token no longer works. */
      const after = await call('GET', inApp, { token });
      assert.equal(after.status, 401, JSON.stringify(after.body));
      assert.equal(after.body.code, 'ACCOUNT_GONE');
    });
  }

  it('a request queued from before deletion was immediate can still be cancelled', async () => {
    const { doc, token, Model, inApp } = await makers.partner(nextPhone());
    await Model.updateOne({ _id: doc._id }, {
      $set: { deletion: { status: 'requested', requestedAt: new Date(), scheduledFor: new Date(Date.now() + 86400000), source: 'app' } },
    });

    const cancelled = await call('DELETE', inApp, { token });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.data.status, 'cancelled');
    assert.equal((await Model.findById(doc._id).lean()).deletion.status, 'cancelled');

    const nothing = await call('DELETE', inApp, { token });
    assert.equal(nothing.status, 409);
  });

  it('deletes even with a stay still open, and records it', async () => {
    const { doc, token, inApp } = await makers.partner(nextPhone());
    const { PartnerBooking } = require('../src/modules/partners/partnerDomains.model');
    await PartnerBooking.create({
      partnerPhoneDigits: doc.phoneDigits, propertyId: 'p-open', propertyName: 'PG', guestName: 'G',
      guestPhone: '+919811100097', roomNumber: '1', checkInDate: '2026-01-01',
      totalAmount: 1000, paidAmount: 1000, status: 'in_house',
    });

    const deleted = await call('POST', inApp, { token });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    assert.equal(deleted.body.data.openWork.activeBookings, 1);
    const archive = await DeletedAccountArchive.findOne({ app: 'partner', accountObjectId: doc._id }).lean();
    assert.equal(archive.openWork.activeBookings, 1);
  });

  it('needs a session, and only its own app’s', async () => {
    const diner = await makers.customer(nextPhone());
    const rider = await makers.driver(nextPhone());

    assert.equal((await call('POST', diner.inApp)).status, 401);
    const crossed = await call('POST', rider.inApp, { token: diner.token });
    assert.ok([401, 403].includes(crossed.status), `got ${crossed.status}`);
    assert.equal((await Driver.findById(rider.doc._id).lean()).deletion.status, 'none');
  });
});
