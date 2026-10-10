/* ══════════════════════════════════════════════════════════════════════════
   The console's control over Tracker accounts (`/api/v1/admin/sales-reps`).

     · creating, deactivating and resetting a rep is `sales.manage` — Admin
       and up. A Viewer "reads everything and changes nothing".
     · deactivating takes the rep off duty and kills the phone's session, so
       it stops sharing location; resetting a password signs it out too.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-sales-admin';

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const config = require('../src/config/env');
const Admin = require('../src/modules/admins/admin.model');
const { signAdminToken } = require('../src/modules/admins/adminToken');
const SalesRep = require('../src/modules/sales/salesRep.model');

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

const staff = async (role) => signAdminToken(await Admin.create({
  name: `${role} Person`, email: `${role.toLowerCase().replace(/\s/g, '.')}@lampose.test`, password: 'a-good-password-1', role,
}));

const makeRep = async () => SalesRep.create({
  salesRepId: 'SR-TEST0001', name: 'Rep', email: 'rep@lampose.test',
  passwordHash: await SalesRep.hashPassword('rep-password'), onDuty: true, dutyStartedAt: new Date(),
});

/** The phone's own session, as the Tracker app holds it. */
const repToken = (rep) => jwt.sign(
  { sub: rep.salesRepId, typ: 'sales_rep', ver: rep.sessionVersion || 0 },
  config.auth.jwtSecret,
);

const ROOT = '/api/v1/admin/sales-reps';

describe('who may change a rep', () => {
  it('a Viewer may list reps but not create, deactivate or reset one', async () => {
    const viewer = await staff('Viewer');
    const rep = await makeRep();

    assert.equal((await call('GET', ROOT, { token: viewer })).status, 200);
    assert.equal((await call('POST', ROOT, { token: viewer, body: { name: 'X', email: 'x@lampose.test', password: 'secret1' } })).status, 403);
    assert.equal((await call('PATCH', `${ROOT}/${rep.salesRepId}`, { token: viewer, body: { status: 'inactive' } })).status, 403);
    assert.equal((await call('PUT', `${ROOT}/${rep.salesRepId}/password`, { token: viewer, body: { password: 'newpass1' } })).status, 403);
    assert.equal((await SalesRep.findById(rep._id).lean()).status, 'active');
  });
});

describe('deactivating and resetting', () => {
  it('deactivating takes the rep off duty and the phone is refused', async () => {
    const admin = await staff('Admin');
    const rep = await makeRep();
    const phone = repToken(rep);
    assert.equal((await call('GET', '/api/v2/sales/me', { token: phone })).status, 200);

    const res = await call('PATCH', `${ROOT}/${rep.salesRepId}`, { token: admin, body: { status: 'inactive' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const row = await SalesRep.findById(rep._id).lean();
    assert.equal(row.status, 'inactive');
    assert.equal(row.onDuty, false);
    const refused = await call('GET', '/api/v2/sales/me', { token: phone });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, 'ACCOUNT_INACTIVE');

    /* And back. The old session stays dead; a fresh sign-in is needed. */
    assert.equal((await call('PATCH', `${ROOT}/${rep.salesRepId}`, { token: admin, body: { status: 'active' } })).status, 200);
    assert.equal((await call('GET', '/api/v2/sales/me', { token: phone })).status, 401);
  });

  it('a reset password signs the phone out and works for the next sign-in', async () => {
    const admin = await staff('Super Admin');
    const rep = await makeRep();
    const phone = repToken(rep);

    assert.equal((await call('PUT', `${ROOT}/${rep.salesRepId}/password`, { token: admin, body: { password: '123' } })).status, 400);
    const res = await call('PUT', `${ROOT}/${rep.salesRepId}/password`, { token: admin, body: { password: 'brand-new-1' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    assert.equal((await call('GET', '/api/v2/sales/me', { token: phone })).status, 401);
    const fresh = await SalesRep.findById(rep._id).select('+passwordHash');
    assert.equal(await fresh.verifyPassword('brand-new-1'), true);
  });
});
