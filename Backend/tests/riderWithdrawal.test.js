/* ══════════════════════════════════════════════════════════════════════════
   A rider's wallet paid out — riderWithdrawal.service.js and the console's
   /api/v1/admin/rider-withdrawals. The rider asks; a Super Admin pays it
   (with a reference) or refuses it (and the money goes back to the wallet).
   Hermetic like doorstepCollection.test.js.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TWILIO_DELIVERY_REQUEST_CONTENT_SID', 'DELIVERY_PARTNER_WHATSAPP',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAYX_KEY_ID', 'RAZORPAYX_KEY_SECRET',
  'RAZORPAYX_WEBHOOK_SECRET', 'EXPO_ACCESS_TOKEN',
]) process.env[key] = '';

const http = require('node:http');
const https = require('node:https');

const isLocal = (host) => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host || ''));
const hostOf = (target) => {
  if (typeof target === 'string') return new URL(target).hostname;
  if (target instanceof URL) return target.hostname;
  return (target && (target.hostname || target.host)) || '';
};
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if (!isLocal(hostOf(url))) throw new Error(`Blocked an outbound request in a test: ${url}`);
  return realFetch(input, init);
};
for (const mod of [http, https]) {
  for (const name of ['request', 'get']) {
    const real = mod[name];
    mod[name] = (target, ...rest) => {
      if (!isLocal(hostOf(target))) throw new Error(`Blocked an outbound request in a test: ${hostOf(target)}`);
      return real.call(mod, target, ...rest);
    };
  }
}

const {
  describe, it, before, after,
} = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase, race } = require('./helpers/db');
const createApp = require('../app');
const Admin = require('../src/modules/admins/admin.model');
const { signAdminToken } = require('../src/modules/admins/adminToken');
const Driver = require('../src/modules/drivers/driver.model');
const RiderLedgerSettings = require('../src/modules/drivers/riderLedgerSettings.model');
const RiderWithdrawal = require('../src/modules/drivers/riderWithdrawal.model');
const { signDriverToken } = require('../src/modules/drivers/driverAuth.middleware');
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

const RIDER = 'DRV-WDRAW001';

/** A rider with a bank account, a wallet and (optionally) something owed. */
const rider = async ({
  walletPaise = 50000, outstandingPaise = 0, bank = true, driverId = RIDER, phone = '+919444444401',
} = {}) => {
  await RiderLedgerSettings.updateOne(
    { _id: 'rider_ledger' },
    { $set: { startedAt: new Date('2026-01-01T00:00:00Z') } },
    { upsert: true },
  );
  const doc = await Driver.create({
    driverId,
    phone,
    name: 'Wallet Rider',
    status: 'approved',
    payout: bank
      ? {
        accountHolderName: 'Wallet Rider', bankAccountNumber: '123456789012', accountLast4: '9012', ifscCode: 'SBIN0001234', bankName: 'SBI',
      }
      : {},
  });
  await ledger.post(driverId, () => ({
    kind: 'opening', walletPaise, outstandingPaise, key: `opening:${driverId}`,
  }));
  return signDriverToken(doc);
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

const withdraw = (token, body) => call('POST', '/api/v2/drivers/me/withdrawals', { token, body });
const balance = (driverId = RIDER) => ledger.balanceFor(driverId);

/* ══════════════════════════════════════════════════════════════════════════ */

describe('a rider asking', () => {
  it('takes the whole wallet by default and holds it off the balance at once', async () => {
    const token = await rider({ walletPaise: 50000 });
    const out = await withdraw(token);
    assert.equal(out.status, 201, JSON.stringify(out.body));
    assert.equal(out.body.data.withdrawal.amountPaise, 50000);
    assert.equal(out.body.data.withdrawal.status, 'requested');
    assert.equal(out.body.data.withdrawal.account.accountLast4, '9012');
    assert.equal(out.body.data.withdrawal.account.bankAccountNumber, undefined, 'never to the rider app');
    assert.equal(out.body.data.wallet.walletPaise, 0);
  });

  it('refuses while anything is owed', async () => {
    /* Not reachable through deliveries (auto-adjust keeps one side at zero),
       but an opening row can carry both. */
    const token = await rider({ walletPaise: 50000, outstandingPaise: 10000 });
    const out = await withdraw(token);
    assert.equal(out.status, 409);
    assert.equal(out.body.code, 'OUTSTANDING_DUE');
    assert.equal(await RiderWithdrawal.countDocuments(), 0, 'no request row left behind');
    assert.equal((await balance()).walletPaise, 50000);
  });

  it('refuses below the minimum, above the wallet, and with nowhere to send it', async () => {
    const token = await rider({ walletPaise: 50000 });
    assert.equal((await withdraw(token, { amount: 50 })).body.code, 'BELOW_MINIMUM');
    assert.equal((await withdraw(token, { amount: 600 })).body.code, 'NOT_ENOUGH_IN_WALLET');

    const noBank = await rider({ driverId: 'DRV-WDRAW002', phone: '+919444444402', bank: false });
    assert.equal((await withdraw(noBank)).body.code, 'NO_PAYOUT_ACCOUNT');
  });

  it('allows one open request, even when asked twice at once', async () => {
    const token = await rider({ walletPaise: 50000 });
    const results = await race(3, () => withdraw(token, { amount: 100 }));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(await RiderWithdrawal.countDocuments(), 1);
    assert.equal((await balance()).walletPaise, 40000, 'only one ₹100 left the wallet');
  });
});

describe('the console', () => {
  it('lists the queue to any admin, and shows the account number only to a Super Admin', async () => {
    const token = await rider();
    const { withdrawalId } = (await withdraw(token)).body.data.withdrawal;

    const viewer = await adminToken('Viewer');
    const list = await call('GET', '/api/v1/admin/rider-withdrawals', { token: viewer });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.data.items.length, 1);
    assert.equal(list.body.data.counts.requested.amountPaise, 50000);

    const asViewer = await call('GET', `/api/v1/admin/rider-withdrawals/${withdrawalId}`, { token: viewer });
    assert.equal(asViewer.body.data.account.bankAccountNumber, undefined);

    const superAdmin = await adminToken('Super Admin');
    const asSuper = await call('GET', `/api/v1/admin/rider-withdrawals/${withdrawalId}`, { token: superAdmin });
    assert.equal(asSuper.body.data.account.bankAccountNumber, '123456789012');
  });

  it('only a Super Admin may mark it paid, and only with a reference', async () => {
    const token = await rider();
    const { withdrawalId } = (await withdraw(token)).body.data.withdrawal;

    const admin = await adminToken('Admin');
    const refused = await call('POST', `/api/v1/admin/rider-withdrawals/${withdrawalId}/paid`, {
      token: admin, body: { reference: 'UTR123' },
    });
    assert.equal(refused.status, 403);

    const superAdmin = await adminToken('Super Admin');
    const noRef = await call('POST', `/api/v1/admin/rider-withdrawals/${withdrawalId}/paid`, { token: superAdmin, body: {} });
    assert.equal(noRef.status, 400);
    assert.equal(noRef.body.code, 'REFERENCE_REQUIRED');

    const paid = await call('POST', `/api/v1/admin/rider-withdrawals/${withdrawalId}/paid`, {
      token: superAdmin, body: { reference: 'UTR123' },
    });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.equal(paid.body.data.status, 'paid');
    assert.equal(paid.body.data.reference, 'UTR123');
    assert.equal((await balance()).walletPaise, 0, 'paying changes nothing on the ledger');

    const twice = await call('POST', `/api/v1/admin/rider-withdrawals/${withdrawalId}/reject`, {
      token: superAdmin, body: { reason: 'oops' },
    });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.code, 'NOT_OPEN');

    const mine = await call('GET', '/api/v2/drivers/me/withdrawals', { token });
    assert.equal(mine.body.data[0].status, 'paid');
  });

  it('refusing puts the money back in the wallet, once', async () => {
    /* Its own rider: the per-rider rate limit is in memory and the tests above
       have used this file's usual rider's allowance. */
    const R = 'DRV-WDRAW009';
    const token = await rider({ walletPaise: 50000, driverId: R, phone: '+919444444409' });
    const { withdrawalId } = (await withdraw(token)).body.data.withdrawal;
    const superAdmin = await adminToken('Super Admin');

    const results = await race(2, () => call('POST', `/api/v1/admin/rider-withdrawals/${withdrawalId}/reject`, {
      token: superAdmin, body: { reason: 'Bank details do not match the name' },
    }));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal((await balance(R)).walletPaise, 50000);

    const again = await withdraw(token, { amount: 200 });
    assert.equal(again.status, 201, 'a new request can be made once the old one is closed');
  });
});
