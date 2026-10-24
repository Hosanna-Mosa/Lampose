/* ══════════════════════════════════════════════════════════════════════════
   A restaurant's menu written by Lampose staff —
   /api/v1/admin/food-restaurants/:restaurantId/menu.

   What has to hold:

     · An approver (`food.menu.manage`) can add, edit, switch off and remove
       a dish on ANY restaurant, and the restaurant comes from the path.
     · A Viewer can read the menu and cannot write it.
     · The menu sheet is the app's own contract: dry run, refuse-all on a bad
       row, a new dish needs a photo.
     · A kitchen's own token is not a console session here.
     · Every write is in `admin_audit_log`; a dry run is not.
     · A Product ID belonging to another restaurant is "not found".
   ══════════════════════════════════════════════════════════════════════════ */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-menu-admin';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const Admin = require('../src/modules/admins/admin.model');
const { AdminAuditLog } = require('../src/modules/admins/adminAuditLog.model');
const { signAdminToken } = require('../src/modules/admins/adminToken');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
const { signFoodPartnerToken } = require('../src/modules/foodpartners/foodPartnerAuth.middleware');

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
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : null),
      ...(body ? { 'Content-Type': 'application/json' } : null),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const makeRestaurant = (restaurantId, phone, extra = {}) => FoodRestaurant.create({
  restaurantId, restaurantName: `Kitchen ${restaurantId}`, ownerName: 'Owner',
  ownerPhone: phone, fssaiLicenseNumber: '12345678901234', cuisineTypes: ['North Indian'],
  verificationStatus: 'pending', isActive: false,
  address: { line1: 'Opposite the RTC complex' },
  location: { type: 'Point', coordinates: [78.4867, 17.385] },
  ...extra,
});

const staff = async (role, email) => signAdminToken(await Admin.create({
  name: `${role} Person`, email, password: 'a-good-password-1', role,
}));

const MENU = (id) => `/api/v1/admin/food-restaurants/${id}/menu`;

const PHOTO = {
  url: 'https://res.cloudinary.com/lampose/image/upload/v1/lampose/food-partners/FP-STAFF001/chai.jpg',
  publicId: 'lampose/food-partners/FP-STAFF001/chai',
};

let approver;
let viewer;
let kitchen;
beforeEach(async () => {
  kitchen = await makeRestaurant('FP-STAFF001', '+919811100051');
  await makeRestaurant('FP-STAFF002', '+919811100052');
  await FoodProduct.create({
    productId: 'FPI-OTHER001', restaurantId: 'FP-STAFF002', productName: 'Haleem',
    category: 'Mains', price: 200, isVeg: 'non-veg',
  });
  approver = await staff('Food Admin', 'food.admin@lampose.test');
  viewer = await staff('Viewer', 'viewer@lampose.test');
});

describe('staff menu: one dish at a time', () => {
  it('adds, edits, switches off and removes a dish on the restaurant in the path', async () => {
    const created = await call('POST', MENU('FP-STAFF001'), {
      token: approver,
      body: {
        productName: 'Masala Chai', category: 'Beverages', price: 40, isVeg: 'veg', productImage: PHOTO,
        /* Named in the body, and ignored: the path decides. */
        restaurantId: 'FP-STAFF002',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.restaurantId, 'FP-STAFF001');
    assert.equal(created.body.data.productImage.url, PHOTO.url);
    const { productId } = created.body.data;

    const edited = await call('PATCH', `${MENU('FP-STAFF001')}/${productId}`, { token: approver, body: { price: 45 } });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.price, 45);

    const off = await call('PATCH', `${MENU('FP-STAFF001')}/${productId}/availability`, {
      token: approver, body: { isAvailable: false },
    });
    assert.equal(off.status, 200);
    assert.equal(off.body.data.isAvailable, false);

    const listed = await call('GET', MENU('FP-STAFF001'), { token: approver });
    assert.equal(listed.body.count, 1);
    assert.equal(listed.body.unavailable, 1);

    const removed = await call('DELETE', `${MENU('FP-STAFF001')}/${productId}`, { token: approver });
    assert.equal(removed.status, 200);
    assert.equal(await FoodProduct.countDocuments({ restaurantId: 'FP-STAFF001' }), 0);

    const audit = await AdminAuditLog.find({ action: 'food_menu.changed' }).sort({ createdAt: 1 }).lean();
    assert.deepEqual(audit.map((row) => row.after.op), ['created', 'updated', 'availability', 'deleted']);
    assert.ok(audit.every((row) => row.targetId === 'FP-STAFF001' && row.adminRole === 'Food Admin'));
    assert.deepEqual(audit[1].after.changed, ['price']);
  });

  it('refuses a bad dish with the app’s own sentence and records nothing', async () => {
    const res = await call('POST', MENU('FP-STAFF001'), { token: approver, body: { productName: 'Chai' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'BAD_INPUT');
    assert.ok(res.body.fields.includes('price'));
    assert.equal(await AdminAuditLog.countDocuments({ action: 'food_menu.changed' }), 0);
  });

  it('does not reach another restaurant’s dish through this one', async () => {
    const res = await call('PATCH', `${MENU('FP-STAFF001')}/FPI-OTHER001`, { token: approver, body: { price: 1 } });
    assert.equal(res.status, 404);
    assert.equal((await FoodProduct.findOne({ productId: 'FPI-OTHER001' })).price, 200);
  });

  it('answers 404 for an unknown or erased restaurant', async () => {
    assert.equal((await call('GET', MENU('FP-NOPE0001'), { token: approver })).status, 404);
    await FoodRestaurant.updateOne({ restaurantId: 'FP-STAFF002' }, { $set: { 'deletion.status': 'completed' } });
    assert.equal((await call('GET', MENU('FP-STAFF002'), { token: approver })).status, 404);
  });
});

describe('staff menu: who may', () => {
  it('lets a Viewer read and not write', async () => {
    assert.equal((await call('GET', MENU('FP-STAFF002'), { token: viewer })).status, 200);
    const res = await call('POST', MENU('FP-STAFF002'), {
      token: viewer, body: { productName: 'Chai', category: 'Beverages', price: 40 },
    });
    assert.equal(res.status, 403);
    assert.equal(await FoodProduct.countDocuments({ restaurantId: 'FP-STAFF002' }), 1);
  });

  it('refuses the kitchen’s own token and no token at all', async () => {
    const own = signFoodPartnerToken(kitchen);
    assert.equal((await call('GET', MENU('FP-STAFF001'), { token: own })).status, 401);
    assert.equal((await call('GET', MENU('FP-STAFF001'))).status, 401);
  });
});

describe('staff menu: the sheet', () => {
  const rows = [
    { row: 2, productName: 'Masala Chai', category: 'Beverages', price: '40', isVeg: 'veg' },
    { row: 3, productName: 'Samosa', category: 'Starters', price: '30', isVeg: 'veg' },
  ];

  it('dry-runs, then needs a photo per new dish, then applies', async () => {
    const dry = await call('POST', `${MENU('FP-STAFF001')}/bulk`, { token: approver, body: { rows, dryRun: true } });
    assert.equal(dry.status, 200, JSON.stringify(dry.body));
    assert.equal(dry.body.data.created, 2);
    assert.deepEqual(dry.body.data.plan.map((step) => step.kind), ['create', 'create']);
    assert.equal(await FoodProduct.countDocuments({ restaurantId: 'FP-STAFF001' }), 0);
    assert.equal(await AdminAuditLog.countDocuments({ action: 'food_menu.changed' }), 0);

    const noPhotos = await call('POST', `${MENU('FP-STAFF001')}/bulk`, { token: approver, body: { rows } });
    assert.equal(noPhotos.status, 400);
    assert.equal(noPhotos.body.code, 'SHEET_INVALID');
    assert.deepEqual(noPhotos.body.rows.map((entry) => entry.row), [2, 3]);

    const applied = await call('POST', `${MENU('FP-STAFF001')}/bulk`, {
      token: approver, body: { rows: rows.map((row) => ({ ...row, productImage: PHOTO })) },
    });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.data.created, 2);
    assert.equal(await FoodProduct.countDocuments({ restaurantId: 'FP-STAFF001' }), 2);

    const audit = await AdminAuditLog.findOne({ action: 'food_menu.changed' }).lean();
    assert.equal(audit.after.op, 'bulk');
    assert.equal(audit.after.created, 2);
  });

  it('adds new dishes with no photo when the console says photos are optional', async () => {
    const res = await call('POST', `${MENU('FP-STAFF001')}/bulk`, { token: approver, body: { rows, photoOptional: true } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.created, 2);
  });

  it('is refused to a Viewer, dry run included', async () => {
    const res = await call('POST', `${MENU('FP-STAFF001')}/bulk`, { token: viewer, body: { rows, dryRun: true } });
    assert.equal(res.status, 403);
  });
});
