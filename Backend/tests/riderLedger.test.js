/* ══════════════════════════════════════════════════════════════════════════
   The rider ledger — wallet (owed to the rider) and outstanding (owed by
   the rider). See `src/modules/drivers/riderLedger.service.js`.

   The worked example the whole feature was specified with: a ₹500 cash order
   of which ₹30 is the rider's earning leaves ₹470 outstanding and nothing in
   the wallet; the same order paid online puts ₹30 in the wallet.

   Unit cases post plain order rows straight into `food_orders`; the last
   block plays a real cash delivery through the rider's route and reads it
   back from GET /me/wallet. Hermetic like doorstepCollection.test.js.
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
const Customer = require('../src/modules/customers/customer.model');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
const Driver = require('../src/modules/drivers/driver.model');
const DriverCashDeposit = require('../src/modules/drivers/driverCashDeposit.model');
const RiderLedgerEntry = require('../src/modules/drivers/riderLedgerEntry.model');
const RiderLedgerSettings = require('../src/modules/drivers/riderLedgerSettings.model');
const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
const { signDriverToken } = require('../src/modules/drivers/driverAuth.middleware');
const dispatch = require('../src/modules/drivers/foodDispatch.service');
const ledger = require('../src/modules/drivers/riderLedger.service');

withDatabase();

const RIDER = 'DRV-LEDGER01';
const OPENED = new Date('2026-01-01T00:00:00Z');

const open = () => RiderLedgerSettings.create({ _id: 'rider_ledger', startedAt: OPENED });

let seq = 0;
/** A delivered order row, written raw — only the fields the ledger reads. */
const delivered = async ({
  total = 500, earning = 30, cash = false, driverId = RIDER, at = new Date('2026-02-01T10:00:00Z'),
} = {}) => {
  seq += 1;
  const orderNumber = `LDG${String(seq).padStart(5, '0')}`;
  await FoodOrder.collection.insertOne({
    orderNumber,
    status: 'delivered',
    paymentMode: cash ? 'cod' : 'online',
    paymentStatus: 'paid',
    grandTotal: total,
    delivery: {
      driverId, deliveredAt: at, earnings: earning, ledgerPostedAt: null,
    },
    collection: cash
      ? {
        method: 'cash', amountPaise: total * 100, collectedAt: at, collectedBy: driverId,
      }
      : { method: '' },
  });
  return FoodOrder.collection.findOne({ orderNumber });
};

const balance = () => ledger.balanceFor(RIDER);

describe('posting a delivery', () => {
  it('posts nothing until the ledger is opened', async () => {
    const order = await delivered();
    const out = await ledger.postDelivery(order);
    assert.equal(out.posted, false);
    assert.equal(await RiderLedgerEntry.countDocuments(), 0);
  });

  it('an online order puts the earning in the wallet', async () => {
    await open();
    await ledger.postDelivery(await delivered({ earning: 30 }));
    assert.deepEqual(await balance(), { walletPaise: 3000, outstandingPaise: 0, seq: 1 });
  });

  it('a ₹500 cash order with a ₹30 earning leaves ₹470 outstanding and an empty wallet', async () => {
    await open();
    const order = await delivered({ total: 500, earning: 30, cash: true });
    await ledger.postDelivery(order);

    assert.deepEqual(await balance(), { walletPaise: 0, outstandingPaise: 47000, seq: 1 });
    const row = await RiderLedgerEntry.findOne({ orderNumber: order.orderNumber }).lean();
    assert.equal(row.kind, 'cash_order');
    assert.equal(row.collectedPaise, 50000);
    assert.equal(row.earningPaise, 3000, 'the earning kept in cash is on record');

    const after = await FoodOrder.collection.findOne({ orderNumber: order.orderNumber });
    assert.ok(after.delivery.ledgerPostedAt, 'the order is stamped as posted');
  });

  it('uses the wallet to clear outstanding automatically', async () => {
    await open();
    for (let i = 0; i < 10; i += 1) await ledger.postDelivery(await delivered({ earning: 30 })); // ₹300
    await ledger.postDelivery(await delivered({ total: 500, earning: 30, cash: true })); // +₹470

    const now = await balance();
    assert.equal(now.walletPaise, 0);
    assert.equal(now.outstandingPaise, 17000, '₹470 − ₹300');

    /* And the other way round: owing ₹170, an online ₹30 brings it to ₹140. */
    await ledger.postDelivery(await delivered({ earning: 30 }));
    assert.deepEqual(
      { w: (await balance()).walletPaise, o: (await balance()).outstandingPaise },
      { w: 0, o: 14000 },
    );
    assert.equal(await RiderLedgerEntry.countDocuments({ kind: 'auto_adjust' }), 2);
  });

  it('an earning bigger than a tiny cash order is owed to the rider, not by them', async () => {
    await open();
    await ledger.postDelivery(await delivered({ total: 20, earning: 25, cash: true }));
    assert.deepEqual(await balance(), { walletPaise: 500, outstandingPaise: 0, seq: 1 });
  });

  it('posts one delivery once, however many times it is posted', async () => {
    await open();
    const order = await delivered({ earning: 30 });
    const results = await race(5, () => ledger.postDelivery(order));
    assert.equal(results.filter((r) => r && r.posted).length, 1);
    assert.equal(await RiderLedgerEntry.countDocuments({ orderNumber: order.orderNumber }), 1);
    assert.equal((await balance()).walletPaise, 3000);
  });

  it('keeps an exact balance when many deliveries land at once', async () => {
    await open();
    const orders = [];
    for (let i = 0; i < 12; i += 1) orders.push(await delivered({ earning: 25 + i }));
    await race(orders.length, (i) => ledger.postDelivery(orders[i]));

    const rows = await RiderLedgerEntry.find({ driverId: RIDER }).sort({ seq: 1 }).lean();
    assert.deepEqual(rows.map((r) => r.seq), rows.map((_, i) => i + 1), 'no gaps, no repeats');
    const expected = orders.reduce((sum, _, i) => sum + (25 + i) * 100, 0);
    assert.equal((await balance()).walletPaise, expected);
  });
});

describe('the backstop sweep', () => {
  it('posts deliveries the live path missed, and leaves the ones from before opening alone', async () => {
    await open();
    const missed = await delivered({ earning: 40 });
    const old = await delivered({ earning: 99, at: new Date('2025-12-31T23:59:59Z') });

    const first = await ledger.sweepUnposted();
    assert.equal(first.posted, 1);
    assert.equal((await balance()).walletPaise, 4000);
    assert.equal(await RiderLedgerEntry.countDocuments({ orderNumber: old.orderNumber }), 0);
    assert.ok((await FoodOrder.collection.findOne({ orderNumber: missed.orderNumber })).delivery.ledgerPostedAt);

    const second = await ledger.sweepUnposted();
    assert.equal(second.posted, 0, 'nothing left to post');
  });
});

describe('cash handed over', () => {
  it('comes off outstanding, and never more than is owed — even entered twice at once', async () => {
    await open();
    await ledger.postDelivery(await delivered({ total: 500, earning: 30, cash: true })); // ₹470

    const results = await race(2, (i) => ledger.recordDeposit(RIDER, {
      amountPaise: 47000, depositId: `dep${i}`, method: 'cash', by: 'Test Admin',
    }).then(() => 'ok', (error) => error.code));

    assert.deepEqual(results.sort(), ['MORE_THAN_IN_HAND', 'ok']);
    assert.equal((await balance()).outstandingPaise, 0);
  });
});

describe('opening the ledger', () => {
  it('carries in cash held today, once', async () => {
    const asOf = new Date();
    await delivered({ total: 500, earning: 30, cash: true, at: new Date(asOf.getTime() - 3600e3) });
    await delivered({ total: 300, earning: 25, cash: true, at: new Date(asOf.getTime() - 1800e3) });
    await DriverCashDeposit.create({ driverId: RIDER, amountPaise: 20000, recordedBy: 'Test Admin', recordedAt: new Date(asOf.getTime() - 600e3) });

    const report = await ledger.openLedger({ run: false, now: asOf });
    assert.equal(report.dryRun, true);
    assert.equal(await RiderLedgerEntry.countDocuments(), 0, 'a report writes nothing');

    const out = await ledger.openLedger({ run: true, now: asOf });
    assert.equal(out.opened, true);
    assert.deepEqual(await balance(), { walletPaise: 0, outstandingPaise: 60000, seq: 1 }, '₹800 − ₹200');

    const again = await ledger.openLedger({ run: true });
    assert.equal(again.opened, false);
    assert.ok(again.alreadyOpenedAt);
    assert.equal(await RiderLedgerEntry.countDocuments(), 1);
  });

  it('with earnings, credits past trips and nets them against the cash', async () => {
    const asOf = new Date();
    await delivered({ total: 500, earning: 30, cash: true, at: new Date(asOf.getTime() - 3600e3) });
    await delivered({ earning: 40, at: new Date(asOf.getTime() - 1800e3) });

    await ledger.openLedger({ run: true, withEarnings: true, now: asOf });
    /* ₹500 cash held; ₹70 of earnings owed; netted → ₹430 outstanding. */
    const now = await balance();
    assert.equal(now.walletPaise, 0);
    assert.equal(now.outstandingPaise, 43000);
  });
});

/* ── Through the rider's own routes ─────────────────────────────────────── */

describe('a real cash delivery, read back from GET /me/wallet', () => {
  let server;
  let base;

  before(async () => {
    dispatch.startDispatch = async () => ({ started: false });
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    dispatch.stopAllDispatch();
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

  it('shows outstanding = total − earning after the rider takes cash', async () => {
    await RiderLedgerSettings.create({ _id: 'rider_ledger', startedAt: new Date(Date.now() - 60e3) });
    await FoodRestaurant.create({
      restaurantId: 'FP-LEDGER01',
      restaurantName: 'Ledger Kitchen',
      ownerName: 'Owner',
      ownerPhone: '+919000000101',
      ownerEmail: 'owner-ledger@example.invalid',
      contactNumber: '+919000000109',
      fssaiLicenseNumber: '12345678901234',
      cuisineTypes: ['Chinese'],
      verificationStatus: 'approved',
      isActive: true,
      openState: 'open',
      minOrderValue: 100,
      packagingCharge: 10,
      deliveryFee: { type: 'flat', amount: 20 },
      acceptsCod: true,
      acceptsOnlinePayment: true,
      address: { line1: 'Opposite the RTC complex' },
      location: { type: 'Point', coordinates: [78.4867, 17.385] },
    });
    await FoodProduct.create({
      productId: 'FPI-LEDGER01',
      restaurantId: 'FP-LEDGER01',
      productName: 'Veg Hakka Noodles',
      category: 'Noodles',
      price: 120,
      isVeg: 'veg',
      isAvailable: true,
    });
    const customer = await Customer.create({
      customerId: 'cus_ledger1', phone: '+919111111191', name: 'Test Diner', phoneVerifiedAt: new Date(),
    });
    const placed = await call('POST', '/api/v2/food-partners/orders', {
      token: signCustomerToken(customer),
      body: {
        restaurantId: 'FP-LEDGER01',
        lines: [{ productId: 'FPI-LEDGER01', quantity: 2 }],
        paymentMode: 'cod',
        fulfilment: 'delivery',
        channel: 'web',
        deliveryAddress: '12 Test Lane, Testville',
        dropLat: 17.39,
        dropLng: 78.49,
        customerName: 'Test Diner',
      },
    });
    assert.equal(placed.status, 201, JSON.stringify(placed.body));

    const rider = await Driver.create({
      driverId: RIDER, phone: '+919222222291', name: 'Ledger Rider', status: 'approved',
    });
    const row = await FoodOrder.findOne({}).lean();
    await FoodOrder.updateOne({ _id: row._id }, {
      $set: {
        status: 'picked_up',
        deliveryOtp: '7391',
        pickupCode: '1234',
        'delivery.driverId': RIDER,
        'delivery.pickedUpAt': new Date(),
        'delivery.earnings': 30,
      },
    });
    const token = signDriverToken(rider);

    const done = await call('PATCH', `/api/v2/drivers/orders/${row.orderNumber}/status`, {
      token, body: { status: 'delivered', code: '7391', collection: 'cash' },
    });
    assert.equal(done.status, 200, JSON.stringify(done.body));

    const wallet = await call('GET', '/api/v2/drivers/me/wallet', { token });
    assert.equal(wallet.status, 200, JSON.stringify(wallet.body));
    const totalPaise = Math.round(row.grandTotal * 100);
    assert.equal(wallet.body.data.walletPaise, 0);
    assert.equal(wallet.body.data.outstandingPaise, totalPaise - 3000);
    assert.equal(wallet.body.data.codLimitPaise, 200000);
    assert.equal(wallet.body.data.codBlocked, false);
    assert.equal(wallet.body.data.entries[0].kind, 'cash_order');
    assert.equal(wallet.body.data.entries[0].orderNumber, row.orderNumber);
  });
});
