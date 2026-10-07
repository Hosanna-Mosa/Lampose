/* ══════════════════════════════════════════════════════════════════════════
   A restaurant's own photographs — `galleryImages` on `food_restaurants`.

   What has to hold:

     · The partner app sets the whole list through PATCH /me, in its order;
       a repeated photo is kept once, and an empty list clears it.
     · Only UPLOADED photos are stored. A local file or a data: URI is a
       picture no diner's phone can load, and is refused with nothing saved.
     · The list is capped.
     · The customer app's restaurant page gets the URLs — and only the URLs.
   ══════════════════════════════════════════════════════════════════════════ */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-restaurant-photos';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const { signFoodPartnerToken } = require('../src/modules/foodpartners/foodPartnerAuth.middleware');

const { MAX_RESTAURANT_PHOTOS } = FoodRestaurant;

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

const photo = (n) => ({
  url: `https://res.cloudinary.com/lampose/image/upload/v1/lampose/food-partners/FP-PHOTO001/room-${n}.jpg`,
  publicId: `lampose/food-partners/FP-PHOTO001/room-${n}`,
});

const makeRestaurant = async () => {
  const doc = await FoodRestaurant.create({
    restaurantId: 'FP-PHOTO001', restaurantName: 'Photo Kitchen', ownerName: 'Owner',
    ownerPhone: '+919811100031', fssaiLicenseNumber: '12345678901234', cuisineTypes: ['Chinese'],
    verificationStatus: 'approved', isActive: true,
    address: { line1: 'Opposite the RTC complex' },
    location: { type: 'Point', coordinates: [78.4867, 17.385] },
  });
  return { doc, token: signFoodPartnerToken(doc) };
};

const stored = async () => (await FoodRestaurant.findOne({ restaurantId: 'FP-PHOTO001' }).lean()).galleryImages;

describe('restaurant photos', () => {
  it('saves the list in the order sent, once each, and clears it with an empty list', async () => {
    const { token } = await makeRestaurant();

    const saved = await call('PATCH', '/api/v2/food-partners/me', {
      token, body: { galleryImages: [photo(2), photo(1), photo(2)] },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual((await stored()).map((entry) => entry.url), [photo(2).url, photo(1).url]);
    assert.equal((await stored())[0].publicId, photo(2).publicId);

    const cleared = await call('PATCH', '/api/v2/food-partners/me', { token, body: { galleryImages: [] } });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    assert.deepEqual(await stored(), []);
  });

  it('refuses a photo that was never uploaded, and saves nothing', async () => {
    const { token } = await makeRestaurant();
    await call('PATCH', '/api/v2/food-partners/me', { token, body: { galleryImages: [photo(1)] } });

    for (const local of [
      { url: 'file:///data/user/0/com.lampose.partner/cache/ImagePicker/a.jpg' },
      { url: 'data:image/jpeg;base64,/9j/4AAQ' },
      { url: '' },
    ]) {
      const res = await call('PATCH', '/api/v2/food-partners/me', {
        token, body: { galleryImages: [photo(3), local] },
      });
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.deepEqual((await stored()).map((entry) => entry.url), [photo(1).url]);
    }

    const notAList = await call('PATCH', '/api/v2/food-partners/me', { token, body: { galleryImages: photo(4) } });
    assert.equal(notAList.status, 400);
  });

  it(`stops at ${MAX_RESTAURANT_PHOTOS} photos`, async () => {
    const { token } = await makeRestaurant();
    const full = Array.from({ length: MAX_RESTAURANT_PHOTOS }, (_, i) => photo(i));
    assert.equal((await call('PATCH', '/api/v2/food-partners/me', { token, body: { galleryImages: full } })).status, 200);

    const over = await call('PATCH', '/api/v2/food-partners/me', {
      token, body: { galleryImages: [...full, photo(99)] },
    });
    assert.equal(over.status, 400);
    assert.equal((await stored()).length, MAX_RESTAURANT_PHOTOS);
  });

  it('shows the photos on the restaurant page, as URLs only', async () => {
    const { token } = await makeRestaurant();
    await call('PATCH', '/api/v2/food-partners/me', { token, body: { galleryImages: [photo(1), photo(2)] } });

    const page = await call('GET', '/api/v2/food-partners/restaurants/FP-PHOTO001');
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.deepEqual(page.body.data.restaurant.galleryImages, [{ url: photo(1).url }, { url: photo(2).url }]);
  });
});
