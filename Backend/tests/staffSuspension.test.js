/* ══════════════════════════════════════════════════════════════════════════
   Taking an onboarding agent off the job (`/api/admin/scriper-users`).

     · only a Super Admin may suspend, reactivate or sign somebody out.
     · suspending ends the session already on the agent's phone, refuses a
       fresh sign-in with ACCOUNT_SUSPENDED, and keeps the account row.
     · reactivating lets them sign in again; the old session stays dead.
     · "sign out everywhere" ends sessions but leaves the account usable.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-staff-suspension';

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const Admin = require('../src/modules/admins/admin.model');
const { signAdminToken } = require('../src/modules/admins/adminToken');
const { AdminAuditLog } = require('../src/modules/admins/adminAuditLog.model');
const { User } = require('../src/modules/scraper/scriper.model');

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

const console_ = async (role) => signAdminToken(await Admin.create({
  name: `${role} Person`, email: `${role.toLowerCase().replace(/\s/g, '.')}@lampose.test`, password: 'a-good-password-1', role,
}));

const ROOT = '/api/admin/scriper-users';
const AGENT = { name: 'Field Agent', email: 'agent@lampose.test', password: 'agent-password-1' };

/** Creates the agent through the console and signs them in to the Onboard app. */
const onboardAgent = async (superAdmin) => {
  const created = await call('POST', ROOT, { token: superAdmin, body: AGENT });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const login = await call('POST', '/api/v2/auth/onboarding-login', { body: AGENT });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { userId: created.body.data.userId, phone: login.body.data.token };
};

describe('who may stop an agent', () => {
  it('an Admin below Super Admin cannot suspend, reactivate or sign out', async () => {
    const root = await console_('Super Admin');
    const admin = await console_('Admin');
    const { userId } = await onboardAgent(root);

    assert.equal((await call('POST', `${ROOT}/${userId}/suspend`, { token: admin })).status, 403);
    assert.equal((await call('POST', `${ROOT}/${userId}/reactivate`, { token: admin })).status, 403);
    assert.equal((await call('POST', `${ROOT}/${userId}/sign-out`, { token: admin })).status, 403);
    assert.notEqual((await User.findOne({ userId }).lean()).status, 'suspended');
  });
});

describe('suspending and reactivating', () => {
  it('ends the live session, refuses a new sign-in, and is reversible', async () => {
    const root = await console_('Super Admin');
    const { userId, phone } = await onboardAgent(root);
    assert.equal((await call('GET', '/api/v2/auth/me', { token: phone })).status, 200);

    const res = await call('POST', `${ROOT}/${userId}/suspend`, { token: root, body: { reason: 'Left the company' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'suspended');

    const row = await User.findOne({ userId }).lean();
    assert.equal(row.status, 'suspended', 'the account is kept, not deleted');
    assert.equal(row.suspendedReason, 'Left the company');

    assert.equal((await call('GET', '/api/v2/auth/me', { token: phone })).status, 401, 'the phone is signed out');

    const refused = await call('POST', '/api/v2/auth/onboarding-login', { body: AGENT });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, 'ACCOUNT_SUSPENDED');
    assert.equal(refused.body.valid, false);

    /* A wrong password still gets the generic answer — the suspension is only
       revealed to somebody who already knows the password. */
    const wrong = await call('POST', '/api/v2/auth/onboarding-login', { body: { ...AGENT, password: 'not-it-at-all' } });
    assert.equal(wrong.status, 401);

    assert.equal((await call('POST', `${ROOT}/${userId}/reactivate`, { token: root })).status, 200);
    assert.equal((await call('GET', '/api/v2/auth/me', { token: phone })).status, 401, 'the old session stays dead');
    const again = await call('POST', '/api/v2/auth/onboarding-login', { body: AGENT });
    assert.equal(again.status, 200);

    const actions = (await AdminAuditLog.find({ targetId: userId }).lean()).map((r) => r.action).sort();
    assert.deepEqual(actions, ['staff.created', 'staff.reactivated', 'staff.suspended']);
  });

  it('the list reports each account\'s status', async () => {
    const root = await console_('Super Admin');
    const { userId } = await onboardAgent(root);
    await call('POST', `${ROOT}/${userId}/suspend`, { token: root });
    const list = await call('GET', ROOT, { token: root });
    assert.equal(list.body.data.find((u) => u.userId === userId).status, 'suspended');
  });
});

describe('signing out everywhere', () => {
  it('ends the session but leaves the account able to sign in', async () => {
    const root = await console_('Super Admin');
    const { userId, phone } = await onboardAgent(root);

    assert.equal((await call('POST', `${ROOT}/${userId}/sign-out`, { token: root })).status, 200);
    assert.equal((await call('GET', '/api/v2/auth/me', { token: phone })).status, 401);
    assert.equal((await call('POST', '/api/v2/auth/onboarding-login', { body: AGENT })).status, 200);
  });

  it('answers 404 for an account that does not exist', async () => {
    const root = await console_('Super Admin');
    assert.equal((await call('POST', `${ROOT}/user_nope/suspend`, { token: root })).status, 404);
    assert.equal((await call('POST', `${ROOT}/user_nope/sign-out`, { token: root })).status, 404);
  });
});
