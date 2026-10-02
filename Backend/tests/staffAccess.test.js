/* ══════════════════════════════════════════════════════════════════════════
   Lampose staff access to a restaurant account (`staffAccess.js`).

     · The owner's password still signs in, as the owner.
     · The staff password signs in to the same restaurant, as a MARKED session,
       on both the Food-Partner app and the web console — and is recorded.
     · A wrong password is still wrong.
     · Writes made with a staff session are recorded with what was sent.
     · Bank details, the owner's password and account deletion are refused to
       a staff session, recorded as blocked, and left alone for the owner.

   The environment is set before the app is required, because `config/env.js`
   reads it once at load.
   ══════════════════════════════════════════════════════════════════════════ */
const bcrypt = require('bcryptjs');

const STAFF_PASSWORD = 'lampose-staff-test-pass';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-staff-access';
process.env.FOOD_STAFF_PASSWORD_HASH = bcrypt.hashSync(STAFF_PASSWORD, 4);

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodStaffAccess = require('../src/modules/foodpartners/foodStaffAccess.model');

withDatabase();

const OWNER_PASSWORD = 'owner-own-password-1';
const PHONE = '+919848012399';

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

const call = async (method, path, body, token) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const ensureRestaurant = async () => {
  const existing = await FoodRestaurant.findOne({ restaurantId: 'FP-STAFF0001' });
  if (existing) return existing;
  return FoodRestaurant.create({
    restaurantId: 'FP-STAFF0001',
    restaurantName: 'Staff Test Kitchen',
    ownerName: 'Ravi Kumar',
    ownerPhone: PHONE,
    passwordHash: await FoodRestaurant.hashPassword(OWNER_PASSWORD),
    verificationStatus: 'approved',
  });
};

/* The audit rows for writes land on `finish`, a moment after the reply. */
const waitForRows = async (filter, count = 1) => {
  for (let i = 0; i < 40; i += 1) {
    const rows = await FoodStaffAccess.find(filter).lean();
    if (rows.length >= count) return rows;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return FoodStaffAccess.find(filter).lean();
};

describe('signing in', () => {
  it("the owner's password is an owner session", async () => {
    await ensureRestaurant();
    const res = await call('POST', '/api/v2/food-partners/auth/login', { identifier: '9848012399', password: OWNER_PASSWORD });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.staffAccess, false);
    assert.equal(jwt.decode(res.body.data.token).via, undefined);
  });

  it('the staff password opens the same restaurant as a marked session, and is recorded', async () => {
    await ensureRestaurant();
    const res = await call('POST', '/api/v2/food-partners/auth/login', { identifier: '9848012399', password: STAFF_PASSWORD });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.staffAccess, true);
    const claims = jwt.decode(res.body.data.token);
    assert.equal(claims.sub, 'FP-STAFF0001');
    assert.equal(claims.via, 'lampose_staff');
    assert.ok(claims.exp - claims.iat <= 12 * 3600, 'a staff session lasts 12 hours at most');

    const rows = await waitForRows({ kind: 'login', sessionId: claims.sid });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].surface, 'app');
    assert.equal(rows[0].restaurantId, 'FP-STAFF0001');
  });

  it('a wrong password is still refused', async () => {
    await ensureRestaurant();
    const res = await call('POST', '/api/v2/food-partners/auth/login', { identifier: '9848012399', password: 'not-it-at-all' });
    assert.equal(res.status, 401);
  });

  it('the staff password works on the web console too', async () => {
    await ensureRestaurant();
    const res = await call('POST', '/api/v1/restaurant-admin/login', { identifier: '9848012399', password: STAFF_PASSWORD });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.staffAccess, true);
    const rows = await waitForRows({ kind: 'login', sessionId: jwt.decode(res.body.data.token).sid });
    assert.equal(rows[0].surface, 'console');
  });
});

describe('what a staff session does', () => {
  it('records every change, with what was sent', async () => {
    await ensureRestaurant();
    const login = await call('POST', '/api/v2/food-partners/auth/login', { identifier: '9848012399', password: STAFF_PASSWORD });
    const { token } = login.body.data;
    const { sid } = jwt.decode(token);

    const patched = await call('PATCH', '/api/v2/food-partners/me', { description: 'Fixed by Lampose support' }, token);
    assert.equal(patched.status, 200, JSON.stringify(patched.body));

    const [row] = await waitForRows({ kind: 'change', sessionId: sid });
    assert.ok(row, 'the change is recorded');
    assert.equal(row.method, 'PATCH');
    assert.equal(row.ok, true);
    assert.deepEqual(row.changes, { description: 'Fixed by Lampose support' });
    assert.match(row.action, /description/);
  });

  it("refuses bank details and the owner's password, and records the attempt", async () => {
    await ensureRestaurant();
    const login = await call('POST', '/api/v1/restaurant-admin/login', { identifier: '9848012399', password: STAFF_PASSWORD });
    const { token } = login.body.data;
    const { sid } = jwt.decode(token);

    const password = await call('POST', '/api/v1/restaurant-admin/me/password', { currentPassword: 'x', newPassword: 'y-new-password-1' }, token);
    assert.equal(password.status, 403);
    assert.equal(password.body.code, 'STAFF_ACCESS_BLOCKED');

    const bank = await call('POST', '/api/v1/restaurant-admin/payout-accounts', {
      accountHolderName: 'Somebody Else', bankAccountNumber: '123456789012', ifscCode: 'HDFC0001234',
    }, token);
    assert.equal(bank.status, 403);
    assert.equal(bank.body.code, 'STAFF_ACCESS_BLOCKED');

    const listed = await call('GET', '/api/v1/restaurant-admin/payout-accounts', null, token);
    assert.notEqual(listed.body.code, 'STAFF_ACCESS_BLOCKED', 'reading them is still allowed');

    const blocked = await waitForRows({ kind: 'blocked', sessionId: sid }, 2);
    assert.equal(blocked.length, 2);
    const stored = JSON.stringify(await FoodStaffAccess.find({ sessionId: sid }).lean());
    assert.ok(!stored.includes('123456789012'), 'no bank number in the log');

    const saved = await FoodRestaurant.findOne({ restaurantId: 'FP-STAFF0001' }).select('+passwordHash');
    assert.ok(await saved.verifyPassword(OWNER_PASSWORD), "the owner's password is unchanged");
  });

  it('refuses requesting account deletion from the app', async () => {
    await ensureRestaurant();
    const login = await call('POST', '/api/v2/food-partners/auth/login', { identifier: '9848012399', password: STAFF_PASSWORD });
    const res = await call('POST', '/api/v2/food-partners/me/account-deletion', {}, login.body.data.token);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'STAFF_ACCESS_BLOCKED');
  });

  it("leaves the owner's own session unrestricted", async () => {
    await ensureRestaurant();
    const login = await call('POST', '/api/v1/restaurant-admin/login', { identifier: '9848012399', password: OWNER_PASSWORD });
    const res = await call('POST', '/api/v1/restaurant-admin/me/password', { currentPassword: 'wrong', newPassword: 'y-new-password-1' }, login.body.data.token);
    assert.notEqual(res.body.code, 'STAFF_ACCESS_BLOCKED');
  });
});

describe('the staff console log', () => {
  const Admin = require('../src/modules/admins/admin.model');
  const { signAdminToken } = require('../src/modules/admins/adminToken');

  const staffToken = async (role) => {
    const admin = await Admin.create({
      name: `${role} Person`,
      email: `${role.toLowerCase().replace(/\s/g, '.')}.${Date.now()}@lampose.test`,
      password: 'a-good-password-1',
      role,
    });
    return signAdminToken(admin);
  };

  it('lists a sign-in with its changes for an Admin, and refuses a Food Admin', async () => {
    await ensureRestaurant();
    const login = await call('POST', '/api/v2/food-partners/auth/login', { identifier: '9848012399', password: STAFF_PASSWORD });
    const { token } = login.body.data;
    const { sid } = jwt.decode(token);
    await call('PATCH', '/api/v2/food-partners/me', { description: 'Logged change' }, token);
    await waitForRows({ kind: 'change', sessionId: sid });

    const res = await call('GET', '/api/v1/admin/food-staff-access', null, await staffToken('Admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.enabled, true);
    const session = res.body.data.sessions.find((row) => row.sessionId === sid);
    assert.ok(session, 'the sign-in is listed');
    assert.equal(session.restaurantId, 'FP-STAFF0001');
    assert.equal(session.changeCount, 1);
    assert.equal(session.events[0].changes.description, 'Logged change');

    const refused = await call('GET', '/api/v1/admin/food-staff-access', null, await staffToken('Food Admin'));
    assert.equal(refused.status, 403);
  });
});

describe('the plain-text setting', () => {
  it('FOOD_STAFF_PASSWORD signs in, and wins over the hash', async () => {
    const config = require('../src/config/env');
    const saved = config.food.staffPassword;
    config.food.staffPassword = 'plain-text-staff-pass';
    try {
      await ensureRestaurant();
      const ok = await call('POST', '/api/v2/food-partners/auth/login', { identifier: '9848012399', password: 'plain-text-staff-pass' });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.data.staffAccess, true);

      const wrong = await call('POST', '/api/v2/food-partners/auth/login', { identifier: '9848012399', password: 'plain-text-staff-pas' });
      assert.equal(wrong.status, 401);
    } finally {
      config.food.staffPassword = saved;
    }
  });
});
