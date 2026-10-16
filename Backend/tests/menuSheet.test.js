/* ══════════════════════════════════════════════════════════════════════════
   The menu spreadsheet — POST /api/v2/food-partners/me/products/bulk.

   What has to hold:

     · A row with a Product ID edits that dish; a row without one adds a dish.
     · A dish missing from the sheet is left alone — a sheet never deletes.
     · Any bad row refuses the WHOLE sheet, naming each row, with nothing saved.
     · `dryRun` answers what would happen and writes nothing.
     · A new row repeating a dish already on the menu is refused, so a sheet
       with its Product ID column deleted cannot double the menu.
     · Another restaurant's Product ID is "not on your menu".
     · A row exported and uploaded untouched counts as unchanged.
   ══════════════════════════════════════════════════════════════════════════ */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-menu-sheet';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
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

const makeRestaurant = async (restaurantId, phone) => {
  const doc = await FoodRestaurant.create({
    restaurantId, restaurantName: `Kitchen ${restaurantId}`, ownerName: 'Owner',
    ownerPhone: phone, fssaiLicenseNumber: '12345678901234', cuisineTypes: ['North Indian'],
    verificationStatus: 'approved', isActive: true,
    address: { line1: 'Opposite the RTC complex' },
    location: { type: 'Point', coordinates: [78.4867, 17.385] },
  });
  return signFoodPartnerToken(doc);
};

const dish = (restaurantId, productId, extra = {}) => FoodProduct.create({
  productId, restaurantId, productName: 'Paneer Tikka', category: 'Starters',
  price: 220, isVeg: 'veg', displayOrder: 0, variants: [{ name: 'Half', price: 120 }], ...extra,
});

const BULK = '/api/v2/food-partners/me/products/bulk';

const PHOTO = {
  url: 'https://res.cloudinary.com/lampose/image/upload/v1/lampose/food-partners/FP-SHEET001/chai.jpg',
  publicId: 'lampose/food-partners/FP-SHEET001/chai',
};

let token;
beforeEach(async () => {
  token = await makeRestaurant('FP-SHEET001', '+919811100041');
  await dish('FP-SHEET001', 'FPI-SHEET001');
  await dish('FP-SHEET001', 'FPI-SHEET002', { productName: 'Dal Makhani', category: 'Main Course', price: 180 });
});

describe('menu sheet', () => {
  it('edits a row with a Product ID, adds a row without one, and deletes nothing', async () => {
    const res = await call('POST', BULK, {
      token,
      body: {
        rows: [
          { row: 2, productId: 'fpi-sheet001', productName: 'Paneer Tikka', category: 'Starters', price: 240, isVeg: 'veg' },
          { row: 3, productName: 'Masala Chai', category: 'Beverages', price: 30, isVeg: 'veg', tags: ['Bestseller'], productImage: PHOTO },
        ],
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      { created: res.body.data.created, updated: res.body.data.updated, unchanged: res.body.data.unchanged },
      { created: 1, updated: 1, unchanged: 0 },
    );

    const menu = await FoodProduct.find({ restaurantId: 'FP-SHEET001' }).lean();
    assert.equal(menu.length, 3, 'Dal Makhani was not in the sheet and must still be there');
    assert.equal(menu.find((p) => p.productId === 'FPI-SHEET001').price, 240);
    const chai = menu.find((p) => p.productName === 'Masala Chai');
    assert.deepEqual(chai.tags, ['Bestseller']);
    assert.match(chai.productId, /^FPI-/);
    assert.equal(chai.productImage.url, PHOTO.url);
  });

  it('refuses to save a new dish without an uploaded photo, and saves nothing', async () => {
    const res = await call('POST', BULK, {
      token,
      body: {
        rows: [
          { row: 2, productName: 'Lassi', category: 'Beverages', price: 60, isVeg: 'veg', productImage: PHOTO },
          { row: 3, productName: 'Kulfi', category: 'Desserts', price: 80, isVeg: 'veg' },
          { row: 4, productName: 'Falooda', category: 'Desserts', price: 120, isVeg: 'veg', productImage: { url: 'file:///data/user/0/cache/falooda.jpg' } },
        ],
      },
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.rows.map((entry) => [entry.row, entry.problems[0].field]), [[3, 'productImage'], [4, 'productImage']]);
    assert.equal(await FoodProduct.countDocuments({ restaurantId: 'FP-SHEET001' }), 2);
  });

  it('does not ask for photos on a dry run, and says which rows are new', async () => {
    const res = await call('POST', BULK, {
      token,
      body: {
        dryRun: true,
        rows: [
          { row: 2, productId: 'FPI-SHEET001', price: 999 },
          { row: 3, productId: 'FPI-SHEET002', productName: 'Dal Makhani', category: 'Main Course', price: 180 },
          { row: 4, productName: 'Kulfi', category: 'Desserts', price: 80, isVeg: 'veg' },
        ],
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.plan, [
      { row: 2, kind: 'update' },
      { row: 3, kind: 'unchanged' },
      { row: 4, kind: 'create' },
    ]);
  });

  it('refuses the whole sheet when any row is wrong, naming every row, and saves nothing', async () => {
    const res = await call('POST', BULK, {
      token,
      body: {
        rows: [
          { row: 2, productName: 'Lassi', category: 'Beverages', price: 60, isVeg: 'veg', productImage: PHOTO },
          { row: 3, productName: 'Biryani', category: 'Main Course', price: 'two hundred', isVeg: 'non-veg', productImage: PHOTO },
          { row: 4, productName: 'Omelette', category: 'Breakfast', price: 50, productImage: PHOTO },
        ],
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'SHEET_INVALID');
    assert.deepEqual(res.body.rows.map((entry) => entry.row), [3, 4]);
    assert.ok(res.body.rows[1].problems.some((problem) => problem.field === 'isVeg'), 'a new row must state its diet');
    assert.equal(await FoodProduct.countDocuments({ restaurantId: 'FP-SHEET001' }), 2, 'Lassi must not be saved');
  });

  it('answers a dry run with what would happen and writes nothing', async () => {
    const res = await call('POST', BULK, {
      token,
      body: {
        dryRun: true,
        rows: [
          { row: 2, productId: 'FPI-SHEET001', price: 999 },
          { row: 3, productName: 'Lassi', category: 'Beverages', price: 60, isVeg: 'veg' },
        ],
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.dryRun, true);
    assert.equal(res.body.data.created, 1);
    assert.equal(res.body.data.updated, 1);
    assert.equal((await FoodProduct.findOne({ productId: 'FPI-SHEET001' }).lean()).price, 220);
    assert.equal(await FoodProduct.countDocuments({ restaurantId: 'FP-SHEET001' }), 2);
  });

  it('refuses a new row that repeats a dish already on the menu', async () => {
    const res = await call('POST', BULK, {
      token,
      body: { rows: [{ row: 2, productName: ' paneer  tikka ', category: 'starters', price: 220, isVeg: 'veg', productImage: PHOTO }] },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.rows[0].problems[0].field, 'productName');
  });

  it("treats another restaurant's Product ID as not on this menu", async () => {
    await makeRestaurant('FP-SHEET002', '+919811100042');
    await dish('FP-SHEET002', 'FPI-OTHER001');
    const res = await call('POST', BULK, {
      token,
      body: { rows: [{ row: 2, productId: 'FPI-OTHER001', price: 1 }] },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.rows[0].problems[0].field, 'productId');
    assert.equal((await FoodProduct.findOne({ productId: 'FPI-OTHER001' }).lean()).price, 220);
  });

  it('counts a row uploaded exactly as exported as unchanged', async () => {
    const res = await call('POST', BULK, {
      token,
      body: {
        rows: [{
          row: 2, productId: 'FPI-SHEET001', productName: 'Paneer Tikka', category: 'Starters',
          price: 220, isVeg: 'veg', variants: [{ name: 'Half', price: 120 }],
        }],
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.unchanged, 1);
    assert.equal(res.body.data.updated, 0);
  });

  it("counts the app's reading of an untouched export as unchanged — empty cells, words, prices as text", async () => {
    /* Exactly what `Food-Partner/lib/menuWorkbook.ts#readMenuWorkbook` sends
       for FPI-SHEET001 downloaded and uploaded without an edit. */
    const res = await call('POST', BULK, {
      token,
      body: {
        dryRun: true,
        rows: [{
          row: 2, productId: 'FPI-SHEET001', category: 'Starters', productName: 'Paneer Tikka', price: 220,
          isVeg: 'Veg', discountedPrice: '', description: '', spiceLevel: '', calories: '', preparationTime: '',
          allergenInfo: [], variants: [{ name: 'Half', price: '120' }], addOns: [], isAvailable: 'yes',
          serves: 1, displayOrder: 0, tags: [],
        }],
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data, { created: 0, updated: 0, unchanged: 1, plan: [{ row: 2, kind: 'unchanged' }] });
  });

  it('refuses a sheet with no rows', async () => {
    const res = await call('POST', BULK, { token, body: { rows: [] } });
    assert.equal(res.status, 400);
  });
});
