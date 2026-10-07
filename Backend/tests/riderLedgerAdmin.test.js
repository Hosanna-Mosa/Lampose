/* ══════════════════════════════════════════════════════════════════════════
   The console's side of the rider ledger — /api/v1/admin/rider-ledger and
   the balances on /api/v1/admin/drivers. Corrections and the cash limit are
   Super Admin, required a reason, and are audited.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL', 'EXPO_ACCESS_TOKEN',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
]) process.env[key] = '';

const {
  describe, it, before, after,
} = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const Admin = require('../src/modules/admins/admin.model');
const { AdminAuditLog } = require('../src/modules/admins/adminAuditLog.model');
const { signAdminToken } = require('../src/modules/admins/adminToken');
const Driver = require('../src/modules/drivers/driver.model');
const RiderLedgerSettings = require('../src/modules/drivers/riderLedgerSettings.model');
const ledger = require('../src/modules/drivers/riderLedger.service');

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

const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

const adminToken = async (role) => {
  const admin = await Admin.create({
    name: `${role} Person`,
    email: `${role.toLowerCase().replace(/\s/g, '.')}@lampose.test`,
    password: 'a-good-password-1',
    role,
  });
  return signAdminToken(admin);
};

const RIDER = 'DRV-ADMLDG01';

const openWithRider = async (outstandingPaise = 47000) => {
  await RiderLedgerSettings.updateOne(
    { _id: 'rider_ledger' },
    { $set: { startedAt: new Date('2026-01-01T00:00:00Z') } },
    { upsert: true },
  );
  await Driver.create({
    driverId: RIDER, phone: '+919666666601', name: 'Ledger Rider', status: 'approved',
  });
  await ledger.post(RIDER, () => ({
    kind: 'opening', outstandingPaise, walletPaise: 0, key: `opening:${RIDER}`,
  }));
};

describe('the cash limit setting', () => {
  it('is readable by anyone, changeable by a Super Admin only, and audited', async () => {
    const viewer = await adminToken('Viewer');
    const read = await call('GET', '/api/v1/admin/rider-ledger/settings', { token: viewer });
    assert.equal(read.status, 200);
    assert.equal(read.body.data.codLimitPaise, 200000);
    assert.equal(read.body.data.opened, false);

    const admin = await adminToken('Admin');
    const refused = await call('PATCH', '/api/v1/admin/rider-ledger/settings', { token: admin, body: { codLimit: 3000 } });
    assert.equal(refused.status, 403);

    const superAdmin = await adminToken('Super Admin');
    const changed = await call('PATCH', '/api/v1/admin/rider-ledger/settings', {
      token: superAdmin, body: { codLimit: 3000, minWithdrawal: 200 },
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(changed.body.data.codLimitPaise, 300000);
    assert.equal(changed.body.data.minWithdrawalPaise, 20000);
    assert.equal(changed.body.data.opened, false, 'changing the limit never opens the ledger');
    assert.equal(await AdminAuditLog.countDocuments({ action: 'rider_ledger.settings_changed' }), 1);

    const bad = await call('PATCH', '/api/v1/admin/rider-ledger/settings', { token: superAdmin, body: { codLimit: -5 } });
    assert.equal(bad.status, 400);
  });
});

describe('a correction', () => {
  it('adds a row with the reason, is Super Admin only, and is audited', async () => {
    await openWithRider(47000);
    const admin = await adminToken('Admin');
    const refused = await call('POST', `/api/v1/admin/rider-ledger/${RIDER}/corrections`, {
      token: admin, body: { outstanding: -100, reason: 'test' },
    });
    assert.equal(refused.status, 403);

    const superAdmin = await adminToken('Super Admin');
    const noReason = await call('POST', `/api/v1/admin/rider-ledger/${RIDER}/corrections`, {
      token: superAdmin, body: { outstanding: -100 },
    });
    assert.equal(noReason.body.code, 'REASON_REQUIRED');

    const done = await call('POST', `/api/v1/admin/rider-ledger/${RIDER}/corrections`, {
      token: superAdmin, body: { outstanding: -120, reason: 'Order LO1 refunded after delivery' },
    });
    assert.equal(done.status, 201, JSON.stringify(done.body));
    assert.equal(done.body.data.outstandingPaise, 35000);
    assert.equal(done.body.data.entries[0].kind, 'correction');
    assert.equal(done.body.data.entries[0].note, 'Order LO1 refunded after delivery');
    assert.equal(await AdminAuditLog.countDocuments({ action: 'rider_ledger.corrected', targetId: RIDER }), 1);
  });

  it('refuses to take a balance below zero', async () => {
    await openWithRider(47000);
    const superAdmin = await adminToken('Super Admin');
    const out = await call('POST', `/api/v1/admin/rider-ledger/${RIDER}/corrections`, {
      token: superAdmin, body: { wallet: -10, reason: 'oops' },
    });
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'NOT_ENOUGH_IN_WALLET');
  });

  it('a wallet credit clears outstanding first', async () => {
    await openWithRider(47000);
    const superAdmin = await adminToken('Super Admin');
    const out = await call('POST', `/api/v1/admin/rider-ledger/${RIDER}/corrections`, {
      token: superAdmin, body: { wallet: 100, reason: 'Missed earning on LO2' },
    });
    assert.equal(out.body.data.walletPaise, 0);
    assert.equal(out.body.data.outstandingPaise, 37000);
  });
});

describe('the riders list and detail', () => {
  it('carry wallet, outstanding and whether cash orders are paused', async () => {
    await openWithRider(250000);
    const viewer = await adminToken('Viewer');

    const list = await call('GET', '/api/v1/admin/drivers', { token: viewer });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const row = list.body.data.find((r) => r.driverId === RIDER);
    assert.equal(row.outstandingPaise, 250000);
    assert.equal(row.codBlocked, true);
    assert.equal(row.ledgerOpened, true);

    const detail = await call('GET', `/api/v1/admin/drivers/${RIDER}`, { token: viewer });
    assert.equal(detail.body.data.wallet.opened, true);
    assert.equal(detail.body.data.wallet.outstandingPaise, 250000);
    assert.equal(detail.body.data.wallet.entries.length, 1);
  });
});
