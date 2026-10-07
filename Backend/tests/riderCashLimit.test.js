/* ══════════════════════════════════════════════════════════════════════════
   The cash limit: a rider whose outstanding is ₹2,000 or more is not offered
   cash-on-delivery orders — online and already-paid orders still reach them.
   See `driverMatch.service.js` and `riderLedger.codBlockedDriverIds`.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL', 'EXPO_ACCESS_TOKEN',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
]) process.env[key] = '';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const Driver = require('../src/modules/drivers/driver.model');
const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
const RiderLedgerSettings = require('../src/modules/drivers/riderLedgerSettings.model');
const ledger = require('../src/modules/drivers/riderLedger.service');
const { findCandidatesWithinRadius } = require('../src/modules/drivers/driverMatch.service');
const dispatch = require('../src/modules/drivers/foodDispatch.service');

withDatabase();

const HERE = [78.4867, 17.385];

const open = () => RiderLedgerSettings.updateOne(
  { _id: 'rider_ledger' },
  { $set: { startedAt: new Date('2026-01-01T00:00:00Z') } },
  { upsert: true },
);

/** An approved, online, free rider at HERE who owes `outstandingPaise`. */
const riderOwing = async (driverId, outstandingPaise, phone) => {
  const doc = await Driver.create({
    driverId,
    phone,
    name: driverId,
    status: 'approved',
    isOnline: true,
    isAvailable: true,
    currentLocation: { type: 'Point', coordinates: HERE },
    locationUpdatedAt: new Date(),
  });
  if (outstandingPaise) {
    await ledger.post(driverId, () => ({
      kind: 'opening', outstandingPaise, walletPaise: 0, key: `opening:${driverId}`,
    }));
  }
  return doc;
};

const ids = (rows) => rows.map((r) => r.driverId).sort();
const search = (cashOrder) => findCandidatesWithinRadius({ pickup: HERE, radiusMeters: 3000, cashOrder });

describe('who is offered a cash order', () => {
  it('leaves out riders at or over ₹2,000 — and only for cash orders', async () => {
    await open();
    await riderOwing('DRV-CLEAN001', 0, '+919555555501');
    await riderOwing('DRV-UNDER001', 199999, '+919555555502'); // ₹1,999.99
    await riderOwing('DRV-ATLIM001', 200000, '+919555555503'); // exactly ₹2,000
    await riderOwing('DRV-OVER0001', 250000, '+919555555504');
    await Driver.syncIndexes();

    assert.deepEqual(ids(await search(true)), ['DRV-CLEAN001', 'DRV-UNDER001']);
    assert.deepEqual(
      ids(await search(false)),
      ['DRV-ATLIM001', 'DRV-CLEAN001', 'DRV-OVER0001', 'DRV-UNDER001'],
      'online orders still reach everyone',
    );
  });

  it('gets cash orders again once the rider pays below the limit', async () => {
    await open();
    await riderOwing('DRV-OVER0002', 250000, '+919555555505');
    await Driver.syncIndexes();
    assert.deepEqual(ids(await search(true)), []);

    await ledger.post('DRV-OVER0002', () => ({ kind: 'repayment', outstandingPaise: -60000, walletPaise: 0 }));
    assert.deepEqual(ids(await search(true)), ['DRV-OVER0002'], '₹1,900 left');
  });

  it('applies no limit while the ledger is not open', async () => {
    await riderOwing('DRV-OVER0003', 250000, '+919555555506');
    await Driver.syncIndexes();
    assert.deepEqual(ids(await search(true)), ['DRV-OVER0003']);
  });

  it('uses the limit from settings', async () => {
    await open();
    await RiderLedgerSettings.updateOne({ _id: 'rider_ledger' }, { $set: { codLimitPaise: 100000 } });
    await riderOwing('DRV-MID00001', 150000, '+919555555507');
    await Driver.syncIndexes();
    assert.deepEqual(ids(await search(true)), []);
  });
});

describe('accepting', () => {
  const offeredTo = async (driverId, paymentMode) => {
    await FoodOrder.collection.insertOne({
      orderNumber: 'LIM00001',
      status: 'ready',
      paymentMode,
      paymentStatus: paymentMode === 'online' ? 'paid' : 'pending',
      dispatch: { state: 'searching', offers: [{ driverId, outcome: 'offered', offeredAt: new Date() }] },
      delivery: { driverId: '' },
    });
  };

  it('refuses a cash order to a rider over the limit, with a reason', async () => {
    await open();
    const rider = await riderOwing('DRV-OVER0004', 250000, '+919555555508');
    await offeredTo('DRV-OVER0004', 'cod');
    const out = await dispatch.acceptOffer('LIM00001', rider);
    assert.equal(out.ok, false);
    assert.equal(out.code, 'CASH_LIMIT');
    const order = await FoodOrder.collection.findOne({ orderNumber: 'LIM00001' });
    assert.equal(order.delivery.driverId, '', 'not assigned');
  });

  it('still lets them take an online order', async () => {
    await open();
    const rider = await riderOwing('DRV-OVER0005', 250000, '+919555555509');
    await offeredTo('DRV-OVER0005', 'online');
    /* The raw row here lacks fields a full save validates, so the bookkeeping
       after the claim may throw — what matters is that the claim landed. */
    await dispatch.acceptOffer('LIM00001', rider).catch(() => null);
    const order = await FoodOrder.collection.findOne({ orderNumber: 'LIM00001' });
    assert.equal(order.delivery.driverId, 'DRV-OVER0005', 'the online order was taken');
  });
});
