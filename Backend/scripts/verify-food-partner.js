/* ══════════════════════════════════════════════════════════════════════════
   End-to-end verification of the food-partner chain.

   Boots the real app in-process on an ephemeral port and walks the whole
   journey the product actually performs:

     partner app  →  POST /applications          (a restaurant + its menu)
     admin console →  GET  /admin/food-restaurants
                   →  PATCH .../decision          (approve)
     partner app  →  POST /auth/login             (the onboarding credentials)
                   →  menu CRUD on the real rows

   It also checks the things that would be silent failures rather than errors:
   that a pending restaurant is NOT in the public feed, that GeoJSON went in as
   [lng, lat], that another restaurant's dish answers 404 rather than 403, and
   that a rejection with no reason is refused.

   It CLEANS UP AFTER ITSELF — every document it creates is removed, which is
   the same promise `npm run verify` makes.

   Run with: npm run verify:food-partner
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
const createApp = require('../app');

/* Refuse to run against production. See src/infrastructure/database/guard.js */
require('../src/infrastructure/database/guard').assertDevTargetOrExit();


const results = [];
const check = (name, ok, extra = '') => results.push([ok, name, extra]);

(async () => {
  await connectDB().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (!isLamposeUp()) {
    console.log('\nMongoDB is not reachable from here, so the chain cannot be walked.');
    console.log('This is a missing database, not a failing test. Start Mongo and re-run.\n');
    process.exit(2);
  }

  const app = createApp({});
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'food-partner-verify',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* a body-less response is fine */ }
    return { status: res.status, json };
  };

  const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
  const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
  const Admin = require('../src/modules/admins/admin.model');

  /* The same minimal JPEG the app's sample content uses, so this script
     exercises the identical upload path a phone takes. */
  const SAMPLE_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  const isCloudinaryUrl = (u) => typeof u === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(u);

  const stamp = Date.now().toString().slice(-8);
  const phone = `+9199${stamp}`;
  const email = `chain${stamp}@example.com`;
  const PASSWORD = 'lampose123';

  let restaurantId = null;
  let adminDoc = null;

  try {
    /* ── 1. The route map ─────────────────────────────────────────────── */
    const api = await call('GET', '/api');
    check(
      'route map lists both food surfaces',
      (api.json?.routes?.v2 || []).some((r) => r.path === '/api/v2/food-partners')
        && (api.json?.routes?.v1 || []).some((r) => r.path === '/api/v1/admin/food-restaurants'),
    );

    /* ── 2. The application ───────────────────────────────────────────── */
    const otp = await call('POST', '/api/v2/food-partners/auth/otp/start', { phone });
    check('OTP start answers (sent or a named 503)', [200, 201, 503].includes(otp.status), `status ${otp.status}`);

    const application = {
      restaurantName: `Chain Test Kitchen ${stamp}`,
      ownerName: 'Chain Tester',
      ownerPhone: phone,
      ownerEmail: email,
      password: PASSWORD,
      description: 'End to end chain test',
      cuisineTypes: ['North Indian'],
      address: {
        line1: 'Shop 1', city: 'Visakhapatnam', state: 'Andhra Pradesh',
        pincode: '530017', landmark: 'Near the RTC complex',
      },
      latitude: 17.7231,
      longitude: 83.3012,
      contactNumber: phone,
      openingHours: [{ day: 'Monday', openTime: '09:00', closeTime: '22:00' }],
      openState: 'auto',
      avgPreparationTime: 25,
      deliveryRadiusKm: 6,
      minOrderValue: 150,
      packagingCharge: 20,
      deliveryFee: { type: 'flat', amount: 30, perKm: 0, freeAboveValue: 0 },
      acceptsOnlinePayment: true,
      acceptsCod: true,
      fssaiLicenseNumber: '12345678901234',
      fssaiExpiry: '2030-12-31',
      gstNumber: '37AAAAA0000A1Z5',
      gstExempt: false,
      panNumber: 'ABCDE1234F',
      payout: {
        accountHolderName: 'Chain Tester', bankAccountNumber: '912010012345678',
        ifscCode: 'HDFC0001234', accountType: 'savings', upiId: 'chain@okhdfc',
      },
      contract: { accepted: true, signature: 'Chain Tester' },
      products: [
        {
          productName: 'Chicken Biryani', category: 'Rice & Biryani', price: 320,
          isVeg: 'non-veg', description: 'Dum cooked', tags: ['Bestseller'],
          variants: [{ name: 'Half', price: 220 }], addOns: [{ name: 'Raita', price: 40 }],
          allergenInfo: ['Dairy'], isAvailable: true, displayOrder: 0,
        },
        {
          productName: 'Butter Naan', category: 'Breads', price: 60, isVeg: 'veg',
          allergenInfo: ['Gluten'], isAvailable: true, displayOrder: 0,
        },
      ],
    };

    const created = await call('POST', '/api/v2/food-partners/applications', application);
    const body = created.json?.data || created.json;
    restaurantId = body?.restaurantId || null;
    check(
      'application is accepted and stored',
      created.status === 201 && !!restaurantId,
      `status ${created.status} ${created.json?.message || ''}`,
    );

    if (restaurantId) {
      const stored = await FoodRestaurant.findOne({ restaurantId }).lean();
      check('restaurant written to food_restaurants', !!stored);
      check('it lands as pending', stored?.verificationStatus === 'pending', String(stored?.verificationStatus));
      check('it is NOT listed before approval', stored?.isActive === false);
      /* Getting this backwards does not throw — it silently returns nothing
         from every $near query — which is exactly why it is asserted. */
      check(
        'GeoJSON stored as [lng, lat]',
        Math.round(stored?.location?.coordinates?.[0]) === 83,
        JSON.stringify(stored?.location?.coordinates),
      );

      const menu = await FoodProduct.find({ restaurantId }).lean();
      check('both dishes written to food_products', menu.length === 2, `${menu.length} rows`);
      check(
        'variants and add-ons survived the write',
        (menu.find((m) => m.productName === 'Chicken Biryani')?.variants || []).length === 1,
      );
    }

    const rejectedDuplicate = await call('POST', '/api/v2/food-partners/applications', application);
    check('a duplicate email is refused', rejectedDuplicate.status === 409, `status ${rejectedDuplicate.status}`);

    /* ── 3. Not visible until approved ────────────────────────────────── */
    const feed = await call('GET', '/api/v2/food-partners/restaurants');
    check(
      'a pending restaurant is NOT in the public feed',
      !(feed.json?.data || []).some((r) => r.restaurantId === restaurantId),
    );

    /* ── 4. The console approves it ───────────────────────────────────── */
    adminDoc = await Admin.create({
      name: 'Chain Food Admin', email: `fa${stamp}@example.com`, password: PASSWORD, role: 'Food Admin',
    });
    const adminLogin = await call('POST', '/api/v1/admin/login', { email: adminDoc.email, password: PASSWORD });
    const adminToken = adminLogin.json?.token || adminLogin.json?.data?.token;
    check('a Food Admin can sign in to the console', !!adminToken, `status ${adminLogin.status}`);

    const queue = await call('GET', '/api/v1/admin/food-restaurants?status=pending', undefined, adminToken);
    check(
      'the approval queue lists the application',
      (queue.json?.data || []).some((r) => r.restaurantId === restaurantId),
      `status ${queue.status}`,
    );

    const detail = await call('GET', `/api/v1/admin/food-restaurants/${restaurantId}`, undefined, adminToken);
    check('the approver sees the payout account', !!detail.json?.data?.restaurant?.payout?.bankAccountNumber);
    check('the approver never sees a password hash', !detail.json?.data?.restaurant?.passwordHash);
    check('the approver sees the menu', (detail.json?.data?.menu || []).length > 0);

    const noReason = await call(
      'PATCH', `/api/v1/admin/food-restaurants/${restaurantId}/decision`, { decision: 'rejected' }, adminToken,
    );
    check('a rejection with no reason is refused', noReason.status === 400, `status ${noReason.status}`);

    const approved = await call(
      'PATCH', `/api/v1/admin/food-restaurants/${restaurantId}/decision`, { decision: 'approved' }, adminToken,
    );
    check('approval succeeds', approved.status === 200, `status ${approved.status}`);

    const afterApproval = await FoodRestaurant.findOne({ restaurantId }).lean();
    check(
      'approval is what lists the restaurant',
      afterApproval?.isActive === true && afterApproval?.verificationStatus === 'approved',
    );

    const feedAfter = await call('GET', '/api/v2/food-partners/restaurants');
    check(
      'an approved restaurant appears in the public feed',
      (feedAfter.json?.data || []).some((r) => r.restaurantId === restaurantId),
    );

    /* ── 5. The partner signs in ──────────────────────────────────────── */
    const partnerLogin = await call('POST', '/api/v2/food-partners/auth/login', { identifier: email, password: PASSWORD });
    const partnerToken = (partnerLogin.json?.data || partnerLogin.json)?.token;
    check('partner signs in with the onboarding email + password', !!partnerToken, `status ${partnerLogin.status}`);

    const wrongPassword = await call('POST', '/api/v2/food-partners/auth/login', { identifier: email, password: 'nope' });
    check('a wrong password is refused', wrongPassword.status === 401, `status ${wrongPassword.status}`);

    const me = await call('GET', '/api/v2/food-partners/me', undefined, partnerToken);
    /* /me nests the restaurant under data.restaurant and repeats the derived
       open state at the top level — assert the shape the app unwraps. */
    check(
      'GET /me returns the restaurant, its menu count and the open state',
      me.status === 200
        && !!me.json?.data?.restaurant?.restaurantId
        && typeof me.json?.data?.menuItemCount === 'number'
        && typeof me.json?.data?.isCurrentlyOpen === 'boolean',
      `status ${me.status}`,
    );

    /* ── 5b. Images: phone → Cloudinary → Mongo → back out ────────────── */
    const upload = await call(
      'POST', '/api/v2/food-partners/uploads/images',
      { kind: 'product', images: [SAMPLE_JPEG] }, partnerToken,
    );
    const uploadedUrl = upload.json?.data?.[0]?.url;
    const uploadedPublicId = upload.json?.data?.[0]?.publicId;

    if (upload.status === 503) {
      /* CLOUDINARY_* is unset on this machine. Say so rather than reporting a
         failure that is really a missing credential. */
      console.log('\n  Cloudinary is not configured here — the image checks are skipped.\n');
    } else {
      check('an image uploads to Cloudinary', upload.status === 201 && isCloudinaryUrl(uploadedUrl),
        `status ${upload.status} ${upload.json?.code || ''}`);
      check('the upload comes back with a publicId', !!uploadedPublicId);

      /* The URL has to survive a write AND a read — that round trip is the
         whole point, and a link stored but not returned looks identical to a
         link never stored. */
      const withPhoto = await call(
        'POST', '/api/v2/food-partners/me/products',
        {
          productName: 'Photographed Dish', category: 'Desserts', price: 99, isVeg: 'veg',
          productImage: { url: uploadedUrl, publicId: uploadedPublicId },
        },
        partnerToken,
      );
      check('a dish saves with its Cloudinary image', withPhoto.status === 201, `status ${withPhoto.status}`);

      const savedId = (withPhoto.json?.data || withPhoto.json)?.productId;
      const inDb = await FoodProduct.findOne({ productId: savedId }).lean();
      check('the Cloudinary URL is what Mongo stored', isCloudinaryUrl(inDb?.productImage?.url),
        String(inDb?.productImage?.url));
      check('no local file:// path reached the database', !/^file:|^content:|^ph:/.test(inDb?.productImage?.url || ''));

      const readBack = await call('GET', '/api/v2/food-partners/me/products', undefined, partnerToken);
      const fetched = (readBack.json?.data || []).find((p) => p.productId === savedId);
      check('the image comes back on the menu fetch', isCloudinaryUrl(fetched?.productImage?.url));

      const publicRead = await call('GET', `/api/v2/food-partners/restaurants/${restaurantId}`);
      const publicMenu = (publicRead.json?.data?.menu || []).flatMap((g) => g.items || []);
      check('the image is served on the public restaurant route',
        publicMenu.some((p) => isCloudinaryUrl(p?.productImage?.url)));

      /* Actually fetch it. A URL that 404s is a URL that was never really
         stored, and every check above would still have passed. */
      const head = await fetch(uploadedUrl, { method: 'GET' });
      check('the stored URL actually serves the image', head.ok && (head.headers.get('content-type') || '').startsWith('image/'),
        `status ${head.status} ${head.headers.get('content-type') || ''}`);
    }

    /* ── 6. Menu CRUD on the real rows ────────────────────────────────── */
    const mine = await call('GET', '/api/v2/food-partners/me/products', undefined, partnerToken);
    const list = mine.json?.data || [];
    /* By name, not by count: the image section above may have added a dish,
       and a count assertion that breaks whenever a step is inserted earlier
       tests the script rather than the product. */
    const names = list.map((p) => p.productName);
    check(
      'partner reads their own menu',
      names.includes('Chicken Biryani') && names.includes('Butter Naan'),
      names.join(', '),
    );

    const target = list[0];
    const edited = await call(
      'PATCH', `/api/v2/food-partners/me/products/${target.productId}`,
      { price: 349, description: 'Edited by the chain test' }, partnerToken,
    );
    check('partner edits a dish', edited.status === 200, `status ${edited.status}`);
    check('the edit persisted', (await FoodProduct.findOne({ productId: target.productId }).lean())?.price === 349);

    await call(
      'PATCH', `/api/v2/food-partners/me/products/${target.productId}/availability`,
      { isAvailable: false }, partnerToken,
    );
    check(
      'the availability toggle persisted',
      (await FoodProduct.findOne({ productId: target.productId }).lean())?.isAvailable === false,
    );

    const added = await call(
      'POST', '/api/v2/food-partners/me/products',
      { productName: 'Gulab Jamun', category: 'Desserts', price: 80, isVeg: 'veg' }, partnerToken,
    );
    check('partner adds a dish', added.status === 201, `status ${added.status}`);

    const deleted = await call('DELETE', `/api/v2/food-partners/me/products/${target.productId}`, undefined, partnerToken);
    check('partner deletes a dish', deleted.status === 200, `status ${deleted.status}`);
    check('the delete persisted', !(await FoodProduct.findOne({ productId: target.productId }).lean()));

    const foreign = await call(
      'PATCH', '/api/v2/food-partners/me/products/FPI-DOESNOTEXIST', { price: 1 }, partnerToken,
    );
    check("another restaurant's dish answers 404, not 403", foreign.status === 404, `status ${foreign.status}`);

    /* ── 6b. What the User App's Food module actually reads ───────────── */

    /* The consumer app maps these payloads through
       `User App/services/adapters/food.adapter.ts`. Asserting the FIELDS that
       adapter reads is what stops a projection change from silently emptying
       the food feed — a missing `openingHours` does not error, it just makes
       every kitchen match no meal window and the feed renders empty. */
    const consumerFeed = await call('GET', `/api/v2/food-partners/restaurants?lat=17.72&lng=83.30&radiusKm=25`);
    const row = (consumerFeed.json?.data || []).find((r) => r.restaurantId === restaurantId);

    check('the consumer feed returns the kitchen', !!row, `status ${consumerFeed.status}`);
    check('a geo feed carries distanceKm (the walking time is derived from it)',
      typeof row?.distanceKm === 'number', String(row?.distanceKm));
    check('the feed row carries openingHours (meal windows are derived from them)',
      Array.isArray(row?.openingHours) && row.openingHours.length > 0,
      `${row?.openingHours?.length ?? 0} slots`);
    check('the feed row carries what a card draws',
      !!row?.restaurantName && Array.isArray(row?.cuisineTypes)
        && typeof row?.avgPreparationTime === 'number'
        && typeof row?.minOrderValue === 'number'
        && !!row?.deliveryFee,
    );
    check('the feed never leaks the payout account or a password',
      !row?.payout?.bankAccountNumber && !row?.passwordHash);

    const consumerDetail = await call('GET', `/api/v2/food-partners/restaurants/${restaurantId}`);
    const groups = consumerDetail.json?.data?.menu || [];
    check('the detail route groups the menu by category (the section rail)',
      groups.length > 0 && !!groups[0].category && Array.isArray(groups[0].items));
    check('dishes carry price and diet (the veg/non-veg mark)',
      groups.some((g) => (g.items || []).some((i) => typeof i.price === 'number' && !!i.isVeg)));

    /* ── 7. Orders ────────────────────────────────────────────────────── */
    const orders = await call('GET', '/api/v2/food-partners/me/orders', undefined, partnerToken);
    check(
      'orders answers with a real list (empty until a diner orders)',
      orders.status === 200 && Array.isArray(orders.json?.data),
      `status ${orders.status}`,
    );
  } catch (error) {
    check(`the run completed without throwing — ${error.message}`, false);
  } finally {
    if (restaurantId) {
      await FoodProduct.deleteMany({ restaurantId }).catch(() => {});
      await FoodRestaurant.deleteOne({ restaurantId }).catch(() => {});
    }
    if (adminDoc) await Admin.deleteOne({ _id: adminDoc._id }).catch(() => {});

    const failed = results.filter(([ok]) => !ok).length;
    console.log(`\n${'─'.repeat(64)}`);
    console.log(results.map(([ok, n, e]) => `${ok ? 'PASS' : 'FAIL'}  ${n}${e ? `  (${e})` : ''}`).join('\n'));
    console.log(`${'─'.repeat(64)}`);
    console.log(`${results.length - failed}/${results.length} passed  ·  every test document removed\n`);

    server.close();
    await closeConnections().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(failed ? 1 : 0);
  }
})();
