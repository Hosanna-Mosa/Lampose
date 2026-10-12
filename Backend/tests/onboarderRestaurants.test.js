/* ══════════════════════════════════════════════════════════════════════════
   Restaurants on the Onboarding Team page.

     · a restaurant filled in on the Onboard console is stamped with the
       employee from the VERIFIED staff token — a body that names somebody
       else is ignored.
     · GET /api/admin/onboarders counts restaurants per employee, including an
       employee who has onboarded restaurants and no property.
     · the restaurant queue can be narrowed to one employee's restaurants.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-onboarder-restaurants';

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const Admin = require('../src/modules/admins/admin.model');
const { signAdminToken } = require('../src/modules/admins/adminToken');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');

withDatabase();

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });

const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

const AGENT = { name: 'Field Agent', email: 'agent@lampose.test', password: 'agent-password-1' };

/** The shape the Onboard console posts (see foodPartnerApplication.test.js). */
const application = (over = {}) => ({
  partnerType: 'food',
  restaurantName: 'Paradise Biryani',
  cuisines: ['North Indian'],
  ownerName: 'Ravi Kumar',
  ownerPhone: '9848012345',
  sameAsOwner: true,
  address: { area: 'Danavaipeta', city: 'Rajahmundry' },
  fssaiNumber: '12345678901234',
  fssaiExpiry: '2030-01-01',
  panNumber: 'ABCDE1234F',
  selectedDays: ['Monday'],
  dayTimeSlots: { Monday: [{ open: '09:00', close: '22:00' }] },
  contract: { accepted: true, signature: 'Ravi Kumar' },
  ...over,
});

const setUp = async () => {
  const root = signAdminToken(await Admin.create({
    name: 'Root', email: 'root@lampose.test', password: 'a-good-password-1', role: 'Super Admin',
  }));
  assert.equal((await call('POST', '/api/admin/scriper-users', { token: root, body: AGENT })).status, 201);
  const login = await call('POST', '/api/v2/auth/onboarding-login', { body: AGENT });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { root, agent: login.body.data.token };
};

describe('who onboarded a restaurant', () => {
  it('is taken from the staff token, not the body', async () => {
    const { root, agent } = await setUp();

    const res = await call('POST', '/api/v2/food-partners/applications', {
      token: agent,
      body: application({ onboardedBy: { email: 'someone.else@lampose.test' } }),
    });
    assert.ok(res.status === 200 || res.status === 201, JSON.stringify(res.body));

    const row = await FoodRestaurant.findOne({}).lean();
    assert.equal(row.onboardedBy.email, AGENT.email);
    assert.equal(row.onboardedBy.name, AGENT.name);

    /* Counted on the Onboarding Team page, with no property behind it. */
    const team = await call('GET', '/api/admin/onboarders', { token: root });
    assert.equal(team.status, 200, JSON.stringify(team.body));
    const me = team.body.data.find((o) => o.employeeEmail === AGENT.email);
    assert.ok(me, 'an employee with only restaurants is still listed');
    assert.equal(me.total, 0);
    assert.deepEqual(me.restaurants, { total: 1, approved: 0, pending: 1, rejected: 0 });
    assert.ok(me.lastOnboardedAt);

    /* And the drawer's list narrows to them. */
    const mine = await call('GET', `/api/v1/admin/food-restaurants?onboardedBy=${encodeURIComponent(AGENT.email)}`, { token: root });
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    const items = mine.body.data?.items ?? mine.body.data ?? mine.body.items;
    assert.equal(items.length, 1);
    const nobody = await call('GET', '/api/v1/admin/food-restaurants?onboardedBy=nobody%40lampose.test', { token: root });
    const none = nobody.body.data?.items ?? nobody.body.data ?? nobody.body.items;
    assert.equal(none.length, 0);
  });
});
