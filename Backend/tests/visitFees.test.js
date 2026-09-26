/* ══════════════════════════════════════════════════════════════════════════
   The assisted-visit fee, priced by layout.

   The rule (visitFees.service.js) reads free-text layout labels typed by
   field agents, so most of this file is labels that exist in the collection
   and the tier each one must land in. The rest is the table: an edit made in
   the console changes what NEW requests are charged, and a bad edit is
   refused rather than stored.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const fees = require('../src/modules/visitFees/visitFees.service');
const { paymentForNewRequest } = require('../src/modules/visits/requestPayment.util');
const { AdminAuditLog } = require('../src/modules/admins/adminAuditLog.model');
const VisitFeeSettings = require('../src/modules/visitFees/visitFee.model');

withDatabase();

const admin = { _id: 'admin-1', name: 'Test Admin', email: 'admin@example.invalid', role: 'Super Admin' };
const req = { admin, headers: {}, ip: '127.0.0.1' };

describe('tierForLayout', () => {
  const cases = [
    ['BACHELOR', '1 RK', '1RK'],
    ['BACHELOR', '1RK Independent', '1RK'],
    ['BACHELOR', '1 RK Studio', '1RK'],
    ['BACHELOR', 'Single Private Room', '1RK'],
    ['BACHELOR', '1 BHK', '1BHK'],
    ['BACHELOR', '1 BHK Independent', '1BHK'],
    ['BACHELOR', '2 BHK Apartment', '2BHK'],
    ['COLIVE', '3 BHK', '3BHK'],
    ['COLIVE', '4 BHK Villa', '4BHK'],
    ['BACHELOR', '5 BHK', '5BHK'],
    ['BACHELOR', '6BHK Bungalow', '5BHK'],
    ['BACHELOR', 'Studio', 'COMMERCIAL'],
    ['COMMERCIAL', null, 'COMMERCIAL'],
    ['Shop / Commercial', 'anything', 'COMMERCIAL'],
    ['Bachelor Room', '2 BHK', '2BHK'],
  ];
  for (const [category, label, tier] of cases) {
    it(`${category} "${label}" → ${tier}`, () => {
      const hit = fees.tierForLayout(category, label);
      assert.equal(hit.tier, tier);
      assert.equal(hit.recognised, true);
    });
  }

  it('an unrecognised layout is charged the lowest tier, and says so', () => {
    const hit = fees.tierForLayout('BACHELOR', 'Penthouse');
    assert.deepEqual(hit, { tier: '1RK', recognised: false });
  });

  it('does not read the "rk" inside another word', () => {
    assert.equal(fees.tierForLayout('BACHELOR', 'Park View').recognised, false);
  });

  it('PG and Hotel pay no visit fee', () => {
    assert.equal(fees.tierForLayout('PG_HOSTEL', '2 BHK'), null);
    assert.equal(fees.tierForLayout('HOTEL', '1 RK'), null);
  });
});

describe('paymentForNewRequest', () => {
  beforeEach(async () => {
    await VisitFeeSettings.deleteMany({});
    fees._reset();
  });

  it('charges the default fee for the layout picked, and records the tier', async () => {
    const payment = await paymentForNewRequest('BACHELOR', null, 0, '2 BHK');
    assert.equal(payment.required, true);
    assert.equal(payment.purpose, 'assisted_visit');
    assert.equal(payment.amountPaise, 99900);
    assert.equal(payment.feeTier, '2BHK');
  });

  it('charges co-live and commercial visits', async () => {
    assert.equal((await paymentForNewRequest('COLIVE', null, 0, '1 BHK')).amountPaise, 49900);
    assert.equal((await paymentForNewRequest('COMMERCIAL', null, 0, null)).amountPaise, 199900);
  });

  it('never discounts a visit fee', async () => {
    const payment = await paymentForNewRequest('BACHELOR', null, 100, '1 RK');
    assert.equal(payment.amountPaise, 29900);
  });

  it('PG stays free', async () => {
    assert.equal((await paymentForNewRequest('PG_HOSTEL', null, 0, '2 BHK')).required, false);
  });

  it('a fee changed in the console prices the next request', async () => {
    await fees.updateFees({ '2BHK': 120000 }, req);
    const payment = await paymentForNewRequest('BACHELOR', null, 0, '2 BHK');
    assert.equal(payment.amountPaise, 120000);
  });
});

describe('updateFees', () => {
  beforeEach(async () => {
    await VisitFeeSettings.deleteMany({});
    await AdminAuditLog.deleteMany({ action: 'visit_fees.changed' });
    fees._reset();
  });

  it('stores the change and audits the before and the after', async () => {
    const data = await fees.updateFees({ '1RK': 34900 }, req);
    assert.equal(data.tiers.find((t) => t.key === '1RK').amountPaise, 34900);
    assert.equal(data.updatedBy.email, admin.email);

    const rows = await AdminAuditLog.find({ action: 'visit_fees.changed' }).lean();
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].before, { '1RK': 29900 });
    assert.deepEqual(rows[0].after, { '1RK': 34900 });
  });

  it('writes nothing when nothing changed', async () => {
    await fees.updateFees({ '1RK': 29900 }, req);
    assert.equal(await AdminAuditLog.countDocuments({ action: 'visit_fees.changed' }), 0);
  });

  it('refuses an unknown tier', async () => {
    await assert.rejects(fees.updateFees({ '7BHK': 10000 }, req), { code: 'UNKNOWN_TIER' });
  });

  it('refuses amounts outside the limits or not whole paise', async () => {
    await assert.rejects(fees.updateFees({ '1RK': 50 }, req), { code: 'BAD_AMOUNT' });
    await assert.rejects(fees.updateFees({ '1RK': 99999999 }, req), { code: 'BAD_AMOUNT' });
    await assert.rejects(fees.updateFees({ '1RK': 299.5 }, req), { code: 'BAD_AMOUNT' });
    await assert.rejects(fees.updateFees({ '1RK': '29900' }, req), { code: 'BAD_AMOUNT' });
  });
});
