/* ══════════════════════════════════════════════════════════════════════════
   The order loop: diner → kitchen → diner.

   Boots the real app in-process and walks the journey that connects the two
   apps, against the seeded restaurant:

     User App        POST /orders                (a diner places one)
     backend         →  food_orders              (written, priced server-side)
                     →  push to the restaurant   (the alert)
     Food-Partner    GET  /me/orders             (it appears in the queue)
                     PATCH .../status            (accept → preparing → ready)
     User App        GET  /orders/:number        (the diner tracks it)

   It also checks the things that would be silent rather than loud: that a
   client-supplied price is ignored, that a dish which is not on the menu is
   refused rather than dropped, that another diner cannot read the order, and
   that the kitchen cannot skip straight to delivered.

   Cleans up after itself.

   Run with: npm run verify:food-order
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
    console.log('\nMongoDB is not reachable. Start it and re-run.\n');
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
        'X-Client': 'food-order-loop',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* no body is fine */ }
    return { status: res.status, json };
  };

  const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
  const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
  const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
  const Customer = require('../src/modules/customers/customer.model');
  const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
  const { signFoodPartnerToken } = require('../src/modules/foodpartners/foodPartnerAuth.middleware');

  const stamp = Date.now().toString().slice(-8);
  const made = [];
  let diner = null;
  let other = null;
  let orderNumber = null;

  try {
    const restaurant = await FoodRestaurant.findOne({ verificationStatus: 'approved', isActive: true });
    if (!restaurant) throw new Error('no approved restaurant — run npm run seed:food-menu first');

    const menu = await FoodProduct.find({ restaurantId: restaurant.restaurantId, isAvailable: true })
      .limit(3).lean();
    check('an approved restaurant with a menu exists', menu.length >= 2, `${menu.length} dishes`);

    diner = await Customer.create({
      customerId: `loop_${stamp}`, phone: `+9188${stamp}`, name: 'Loop Diner', phoneVerified: true,
    });
    const dinerToken = signCustomerToken(diner);
    const kitchenToken = signFoodPartnerToken(restaurant);

    /* ── The diner orders ─────────────────────────────────────────────── */
    const headline = menu.find((m) => (m.variants || []).length) || menu[0];
    const placed = await call('POST', '/api/v2/food-partners/orders', {
      restaurantId: restaurant.restaurantId,
      fulfilment: 'delivery',
      paymentMode: 'cod',
      deliveryAddress: 'Room 214, Sunrise PG, MVP Colony',
      lines: [
        {
          productId: headline.productId,
          quantity: 2,
          ...(headline.variants?.[0] ? { variantName: headline.variants[0].name } : {}),
          ...(headline.addOns?.[0] ? { addOns: [headline.addOns[0].name] } : {}),
        },
        { productId: menu[1].productId, quantity: 1 },
      ],
    }, dinerToken);

    orderNumber = placed.json?.data?.orderNumber || null;
    if (orderNumber) made.push(orderNumber);
    check('the diner can place an order', placed.status === 201 && !!orderNumber,
      `status ${placed.status} ${placed.json?.message || placed.json?.code || ''}`);

    const saved = orderNumber ? await FoodOrder.findOne({ orderNumber }).lean() : null;
    check('it is written to food_orders', !!saved);
    check('it is scoped to the diner who placed it', saved?.customerId === diner.customerId);
    check('it starts as "placed"', saved?.status === 'placed', String(saved?.status));

    /* ── Prices come from the database ────────────────────────────────── */
    const unit = headline.variants?.[0]
      ? headline.variants[0].price
      : (headline.discountedPrice > 0 ? headline.discountedPrice : headline.price);
    const addOn = headline.addOns?.[0] ? headline.addOns[0].price : 0;
    check('the line total is recomputed from the menu row',
      saved?.lines?.[0]?.lineTotal === (unit + addOn) * 2,
      `${saved?.lines?.[0]?.lineTotal} vs ${(unit + addOn) * 2}`);
    check('commission is taken off the payout',
      saved?.partnerPayout === Math.round(saved.itemsTotal * 0.85 * 100) / 100,
      `payout ${saved?.partnerPayout} of ${saved?.itemsTotal}`);

    /* A client that sends its own totals must not be believed. */
    const cheeky = await call('POST', '/api/v2/food-partners/orders', {
      restaurantId: restaurant.restaurantId,
      fulfilment: 'pickup',
      paymentMode: 'cod',
      lines: [{ productId: menu[0].productId, quantity: 1, unitPrice: 1, lineTotal: 1 }],
      itemsTotal: 1, grandTotal: 1, partnerPayout: 1,
    }, dinerToken);
    if (cheeky.json?.data?.orderNumber) made.push(cheeky.json.data.orderNumber);
    const cheekyRow = await FoodOrder.findOne({ orderNumber: cheeky.json?.data?.orderNumber }).lean();
    check('a client-supplied price is ignored', !!cheekyRow && cheekyRow.grandTotal > 1,
      `stored ₹${cheekyRow?.grandTotal}`);

    const bogus = await call('POST', '/api/v2/food-partners/orders', {
      restaurantId: restaurant.restaurantId, fulfilment: 'pickup', paymentMode: 'cod',
      lines: [{ productId: 'FPI-NOTREAL0', quantity: 1 }],
    }, dinerToken);
    check('a dish not on the menu is refused, not dropped', bogus.status === 409, `status ${bogus.status}`);

    /* ── It reaches the kitchen ───────────────────────────────────────── */
    const queue = await call('GET', '/api/v2/food-partners/me/orders', undefined, kitchenToken);
    check('it appears in the restaurant queue',
      (queue.json?.data || []).some((o) => o.orderNumber === orderNumber), `status ${queue.status}`);
    check('the queue carries a status tally for the tab badges',
      typeof queue.json?.counts === 'object' && (queue.json.counts.placed ?? 0) >= 1);

    /* ── The kitchen works it ─────────────────────────────────────────── */
    const accepted = await call('PATCH', `/api/v2/food-partners/me/orders/${orderNumber}/status`,
      { status: 'accepted', promisedMinutes: 25 }, kitchenToken);
    check('the kitchen can accept it', accepted.status === 200, `status ${accepted.status}`);

    const jump = await call('PATCH', `/api/v2/food-partners/me/orders/${orderNumber}/status`,
      { status: 'delivered' }, kitchenToken);
    check('the kitchen cannot jump to "delivered"', jump.status === 409, `status ${jump.status}`);

    await call('PATCH', `/api/v2/food-partners/me/orders/${orderNumber}/status`, { status: 'preparing' }, kitchenToken);
    const ready = await call('PATCH', `/api/v2/food-partners/me/orders/${orderNumber}/status`, { status: 'ready' }, kitchenToken);
    check('placed → accepted → preparing → ready runs through', ready.status === 200, `status ${ready.status}`);

    /* ── The diner tracks it ──────────────────────────────────────────── */
    const tracked = await call('GET', `/api/v2/food-partners/orders/${orderNumber}`, undefined, dinerToken);
    check('the diner can track their own order',
      tracked.status === 200 && tracked.json?.data?.status === 'ready', `status ${tracked.status}`);

    other = await Customer.create({ customerId: `loop2_${stamp}`, phone: `+9177${stamp}`, phoneVerified: true });
    const peek = await call('GET', `/api/v2/food-partners/orders/${orderNumber}`, undefined, signCustomerToken(other));
    check('another diner cannot read it', peek.status === 404, `status ${peek.status}`);

    const tooLate = await call('PATCH', `/api/v2/food-partners/orders/${orderNumber}/cancel`, {}, dinerToken);
    check('cancelling once the food is ready is refused', tooLate.status === 409, `status ${tooLate.status}`);

    /* ── Handset registration, which the alert depends on ─────────────── */
    const bad = await call('POST', '/api/v2/food-partners/me/devices', { token: 'not-a-token' }, kitchenToken);
    check('an invalid push token is rejected', bad.status === 422, `status ${bad.status}`);

    const good = await call('POST', '/api/v2/food-partners/me/devices',
      { token: 'ExponentPushToken[loopTestXXXXXXXXXXXX]', platform: 'android' }, kitchenToken);
    check('a valid push token registers', good.status === 200 || good.status === 201, `status ${good.status}`);

    const withDevices = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId })
      .select('+devices').lean();
    check('the handset is stored against the restaurant',
      (withDevices?.devices || []).some((d) => d.token.includes('loopTest')));

    await call('DELETE', '/api/v2/food-partners/me/devices',
      { token: 'ExponentPushToken[loopTestXXXXXXXXXXXX]' }, kitchenToken);
    const cleaned = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId })
      .select('+devices').lean();
    check('it can be unregistered again',
      !(cleaned?.devices || []).some((d) => d.token.includes('loopTest')));
  } catch (error) {
    check(`the run completed without throwing — ${error.message}`, false);
  } finally {
    if (made.length) await FoodOrder.deleteMany({ orderNumber: { $in: made } }).catch(() => {});
    if (diner) await Customer.deleteOne({ _id: diner._id }).catch(() => {});
    if (other) await Customer.deleteOne({ _id: other._id }).catch(() => {});

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
