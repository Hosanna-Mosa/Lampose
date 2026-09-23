/* ══════════════════════════════════════════════════════════════════════════
   Carrying out a due deletion — `accountDeletion.eraser.js`.

   What has to hold:

     · A due request, with nothing in hand, empties the account of everything
       that identifies the person — and the ROW stays, marked completed.
     · The real number is freed: a new account can register on it.
     · Old sessions stop working, with ACCOUNT_GONE.
     · Work in hand (a stay still running) postpones it; the request stands.
     · Not due yet, cancelled, or never asked: untouched.
     · The side collections that exist only for the person go; the records
       the deletion page promises to keep (bookings, orders) do not.
   ══════════════════════════════════════════════════════════════════════════ */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-account-deletion';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const Customer = require('../src/modules/customers/customer.model');
const Partner = require('../src/modules/partners/partner.model');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
const Driver = require('../src/modules/drivers/driver.model');
const { PartnerBooking, PartnerStaff } = require('../src/modules/partners/partnerDomains.model');
const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
const { signFoodPartnerToken } = require('../src/modules/foodpartners/foodPartnerAuth.middleware');
const { signDriverToken } = require('../src/modules/drivers/driverAuth.middleware');
const { processDueDeletions } = require('../src/modules/accountDeletion/accountDeletion.eraser');

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

const getMe = async (path, token) => {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const DAY = 24 * 60 * 60 * 1000;
const due = () => ({
  status: 'requested',
  requestedAt: new Date(Date.now() - 31 * DAY),
  scheduledFor: new Date(Date.now() - DAY),
  reason: 'Leaving the city',
  contactEmail: 'me@example.com',
  source: 'app',
});

describe('carrying out a due request', () => {
  it('erases a diner, keeps the row, frees the number and ends the session', async () => {
    const phone = '+919811100001';
    const doc = await Customer.create({
      customerId: 'cus_erase1', phone, name: 'Asha', email: 'asha@example.com',
      addresses: [{ addressId: 'adr_1', line1: 'Room 4, Block B', isDefault: true }],
      devices: [{ token: 'ExponentPushToken[a]', platform: 'android' }],
      deletion: due(),
    });
    const token = signCustomerToken(doc);

    const summary = await processDueDeletions();
    assert.equal(summary.erased, 1, JSON.stringify(summary));

    const row = await Customer.findById(doc._id).lean();
    assert.ok(row, 'the row stays');
    assert.equal(row.deletion.status, 'completed');
    assert.ok(row.deletion.processedAt);
    assert.equal(row.deletion.contactEmail, '');
    assert.equal(row.deletion.reason, '');
    assert.equal(row.name, '');
    assert.equal(row.email, '');
    assert.notEqual(row.phone, phone);
    assert.equal(row.addresses.length, 0);
    assert.equal(row.devices.length, 0);

    const me = await getMe('/api/v2/customers/me', token);
    assert.equal(me.status, 401);

    /* The real number can start again as somebody new. */
    await Customer.create({ customerId: 'cus_fresh', phone });
  });

  it('erases a kitchen and its menu, and takes it off the listing', async () => {
    const doc = await FoodRestaurant.create({
      restaurantId: 'FP-ERASE001', restaurantName: 'Test Kitchen', ownerName: 'Owner',
      ownerPhone: '+919811100002', ownerEmail: 'owner@example.com',
      fssaiLicenseNumber: '12345678901234', cuisineTypes: ['Chinese'],
      verificationStatus: 'approved', isActive: true,
      address: { line1: 'Opposite the RTC complex' },
      location: { type: 'Point', coordinates: [78.4867, 17.385] },
      deletion: due(),
    });
    await FoodProduct.create({
      productId: 'FPI-ERASE1', restaurantId: 'FP-ERASE001', productName: 'Noodles',
      category: 'Noodles', price: 120, isVeg: 'veg', isAvailable: true,
    });
    const token = signFoodPartnerToken(doc);

    const summary = await processDueDeletions();
    assert.equal(summary.erased, 1, JSON.stringify(summary));

    const row = await FoodRestaurant.findById(doc._id).lean();
    assert.equal(row.deletion.status, 'completed');
    assert.equal(row.isActive, false);
    assert.equal(row.ownerEmail, undefined);
    assert.equal(row.location, undefined);
    assert.equal(await FoodProduct.countDocuments({ restaurantId: 'FP-ERASE001' }), 0);
    assert.equal((await getMe('/api/v2/food-partners/me', token)).status, 401);
  });

  it('erases a rider and ends the session', async () => {
    const doc = await Driver.create({
      driverId: 'DRV-ERASE1', phone: '+919811100003', name: 'Ravi', city: 'Hyderabad', deletion: due(),
    });
    const token = signDriverToken(doc);

    await processDueDeletions();

    const row = await Driver.findById(doc._id).lean();
    assert.equal(row.deletion.status, 'completed');
    assert.equal(row.name, '');
    assert.equal(row.city, '');
    assert.equal(row.isOnline, false);
    const me = await getMe('/api/v2/drivers/me', token);
    assert.equal(me.status, 401);
    assert.equal(me.body.code, 'ACCOUNT_GONE');
  });

  it('erases an owner, drops their staff, and keeps the bookings', async () => {
    const doc = await Partner.create({
      partnerId: 'par_erase1', phone: '+919811100004', name: 'Ramesh', deletion: due(),
    });
    await PartnerStaff.create({ partnerPhoneDigits: doc.phoneDigits, name: 'Helper', phone: '+919811100099' })
      .catch(() => null);
    await PartnerBooking.create({
      partnerPhoneDigits: doc.phoneDigits, propertyId: 'p1', propertyName: 'PG', guestName: 'G',
      guestPhone: '+919811100098', roomNumber: '1', checkInDate: '2026-01-01',
      totalAmount: 1000, paidAmount: 1000, status: 'completed',
    });

    await processDueDeletions();

    const row = await Partner.findById(doc._id).lean();
    assert.equal(row.deletion.status, 'completed');
    assert.equal(row.name, '');
    assert.equal(await PartnerStaff.countDocuments({ partnerPhoneDigits: doc.phoneDigits }), 0);
    assert.equal(await PartnerBooking.countDocuments({ propertyId: 'p1' }), 1, 'bookings are records we keep');
  });
});

describe('leaving alone', () => {
  it('postpones while a stay is still running, and keeps the request', async () => {
    const doc = await Customer.create({
      customerId: 'cus_busy', phone: '+919811100005', name: 'Busy', deletion: due(),
    });
    await PartnerBooking.create({
      customerId: 'cus_busy', partnerPhoneDigits: '9000000000', propertyId: 'p2', propertyName: 'PG',
      guestName: 'Busy', guestPhone: '+919811100005', roomNumber: '2', checkInDate: '2026-01-01',
      totalAmount: 1000, paidAmount: 1000, status: 'in_house',
    });

    const summary = await processDueDeletions();
    assert.equal(summary.postponed, 1);
    const row = await Customer.findById(doc._id).lean();
    assert.equal(row.deletion.status, 'requested');
    assert.equal(row.name, 'Busy');
  });

  it('does not touch a request that is not due, or one that was cancelled', async () => {
    await Customer.create({
      customerId: 'cus_notdue', phone: '+919811100006', name: 'Later',
      deletion: { ...due(), scheduledFor: new Date(Date.now() + 5 * DAY) },
    });
    await Customer.create({
      customerId: 'cus_changed', phone: '+919811100007', name: 'Stayed',
      deletion: { ...due(), status: 'cancelled' },
    });

    const summary = await processDueDeletions();
    assert.equal(summary.items.length, 0);
    assert.equal((await Customer.findOne({ customerId: 'cus_notdue' }).lean()).name, 'Later');
    assert.equal((await Customer.findOne({ customerId: 'cus_changed' }).lean()).name, 'Stayed');
  });

  it('a dry run reports and writes nothing', async () => {
    await Customer.create({ customerId: 'cus_dry', phone: '+919811100008', name: 'Dry', deletion: due() });
    const summary = await processDueDeletions({ dryRun: true });
    assert.equal(summary.items[0].outcome, 'would erase');
    assert.equal((await Customer.findOne({ customerId: 'cus_dry' }).lean()).name, 'Dry');
  });
});
