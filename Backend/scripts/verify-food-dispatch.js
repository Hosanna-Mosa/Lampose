/* ══════════════════════════════════════════════════════════════════════════
   The delivery loop: diner → kitchen → RIDER → diner.

   `verify-food-order-loop.js` walks the two-app half of this (a diner orders,
   a kitchen cooks). This one walks the part that involves a third: the
   riders who are found, offered the job together, and one of whom carries it.

     User App        POST /food-partners/orders           (cash, so it goes
                                                           straight out)
     Food-Partner    PATCH /me/orders/:n/status           (accept, with a
                                                           prep-time quote —
                                                           THIS starts the
                                                           search now, not
                                                           placement; see
                                                           `foodDispatch
                                                           .service.js`'s own
                                                           header)
     backend         →  every rider within reach of that quote, broadcast
                        together, not one at a time
     Driver app      GET  /drivers/me/offer               (the poll fallback)
                     POST /drivers/orders/:n/accept
     Food-Partner    PATCH /me/orders/:n/status           (preparing → ready)
     Driver app      PATCH /drivers/me/location           (where they are now)
                     PATCH /drivers/orders/:n/status      (picked_up, delivered)
     User App        GET  /food-partners/orders/:n        (a rider, a position
                                                           and a map, on the
                                                           tracking screen)

   It also checks the things that would be silent rather than loud:

     · the search does NOT start the instant an order is placed — only once
       the kitchen has accepted it
     · everyone within the prep-time radius is offered together, not just
       the nearest one — and a rider well outside it is not offered at all
     · the moment one rider accepts, everyone else still holding that offer
       is told it is gone, and their own row is stamped `superseded` rather
       than left looking live
     · a rider's own decline stays `declined` even after somebody else
       accepts — one outcome must never overwrite another rider's
     · two riders cannot both get it
     · the hand-over codes are actually checked
     · a rider cannot mark `picked_up` before the kitchen says `ready`
     · an unpaid ONLINE order sends nobody and is invisible to the kitchen
     · going offline mid-delivery is refused
     · the position reaches the diner as [lng, lat] and NOT swapped — the one
       mistake in this whole flow that does not throw, it just puts the rider
       in the Arctic Ocean
     · a position older than two minutes is withheld rather than drawn, and a
       delivered order stops broadcasting one at all

   Cleans up after itself: every rider and order it creates is removed, and it
   restores the duty state of anything it touched.

   Run with: npm run verify:food-dispatch
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
        'X-Client': 'food-dispatch-loop',
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
  const Driver = require('../src/modules/drivers/driver.model');
  const dispatch = require('../src/modules/drivers/foodDispatch.service');
  const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
  const { signDriverToken } = require('../src/modules/drivers/driverAuth.middleware');
  const { signFoodPartnerToken } = require('../src/modules/foodpartners/foodPartnerAuth.middleware');

  const stamp = Date.now().toString().slice(-8);
  const madeOrders = [];
  const madeDrivers = [];
  let diner = null;

  try {
    /* ── The maths, checked fast and without a single real timer ─────────── */

    check(
      'a short or missing quote still searches at least 2km',
      dispatch._radiusFromMinutes(0) === 2000 && dispatch._radiusFromMinutes(2) === 2000,
      `${dispatch._radiusFromMinutes(0)}m, ${dispatch._radiusFromMinutes(2)}m`,
    );
    check(
      'a 30-minute quote searches 10km, at the planning speed',
      dispatch._radiusFromMinutes(30) === (30 * dispatch.PLANNING_SPEED_KMH * 1000) / 60,
      `${dispatch._radiusFromMinutes(30)}m`,
    );
    check(
      'no quote at all means no ready time to show anybody',
      dispatch._readyAtFor({ promisedMinutes: 0, statusHistory: [] }) === null,
    );

    /* ── The fixtures ──────────────────────────────────────────────────── */

    const restaurant = await FoodRestaurant.findOne({
      verificationStatus: 'approved',
      isActive: true,
      'location.coordinates.0': { $exists: true },
    });
    if (!restaurant) {
      throw new Error(
        'no approved restaurant with a map pin — run `npm run seed:food-menu`, '
        + 'then make sure the restaurant has a `location`',
      );
    }
    const [rLng, rLat] = restaurant.location.coordinates;

    const menu = await FoodProduct.find({
      restaurantId: restaurant.restaurantId, isAvailable: true,
    }).limit(2).lean();
    check('an approved restaurant with a pin and a menu exists', menu.length >= 1, restaurant.restaurantId);
    if (!menu.length) throw new Error('the seeded restaurant has no available dishes');

    diner = await Customer.create({
      customerId: `VD-${stamp}`, phone: `+9199${stamp}`, name: 'Dispatch Diner',
    });
    const dinerToken = signCustomerToken(diner);
    const partnerToken = signFoodPartnerToken(restaurant);

    /* Three riders. `near` sits on the restaurant's own pin, `mid` is ~1.1km
       out — inside BOTH a 20-minute quote's ~6.7km radius and the bare 2km
       floor an order with no quote at all still searches, so it can stand in
       for "a second in-range rider" in either scenario below. `far` is ~28km
       out — outside even the wider radius, the rider used to prove somebody
       NOT in range is never offered at all. */
    const makeRider = async (suffix, latOffset) => {
      const rider = await Driver.create({
        driverId: `DR-VER${stamp}${suffix}`,
        phone: `+9198${stamp}${suffix}`,
        name: `Verify Rider ${suffix}`,
        status: 'approved',
        hasCompletedOnboarding: true,
        isOnline: true,
        isAvailable: true,
        vehicle: { type: 'bike', plate: `TS09VER${suffix}` },
        currentLocation: { type: 'Point', coordinates: [rLng, rLat + latOffset] },
        locationUpdatedAt: new Date(),
      });
      madeDrivers.push(rider.driverId);
      return { rider, token: signDriverToken(rider) };
    };

    const near = await makeRider('1', 0);
    const mid = await makeRider('2', 0.01);
    const far = await makeRider('3', 0.25);

    /* ── 1. A cash order is placed — and goes nowhere yet ────────────────── */

    const placed = await call('POST', '/api/v2/food-partners/orders', {
      restaurantId: restaurant.restaurantId,
      lines: [{ productId: menu[0].productId, quantity: 1 }],
      fulfilment: 'delivery',
      paymentMode: 'cod',
      deliveryAddress: 'Room 204 · Sunrise Hostel · Gate 2',
      dropLat: rLat + 0.02,
      dropLng: rLng + 0.01,
    }, dinerToken);

    check('a cash order is accepted', placed.status === 201, `HTTP ${placed.status}`);
    const orderNumber = placed.json?.data?.orderNumber;
    if (!orderNumber) throw new Error(`the order was not created: ${JSON.stringify(placed.json)}`);
    madeOrders.push(orderNumber);

    check('a cash order is told to go straight to tracking', placed.json?.nextStep === 'track', placed.json?.nextStep);
    check('the drop coordinates were stored', !!placed.json?.data?.dropLocation);
    check('a delivery PIN was minted for the diner', !!placed.json?.data?.deliveryOtp);
    check('the pickup code is NOT sent to the diner', !placed.json?.data?.pickupCode);

    const beforeAccept = await FoodOrder.findOne({ orderNumber }).lean();
    check(
      'the search does not start before the kitchen accepts',
      beforeAccept.dispatch.state === 'idle',
      beforeAccept.dispatch.state,
    );

    /* ── 2. The kitchen accepts with a 20-minute quote ───────────────────── */

    const accepted = await call(
      'PATCH', `/api/v2/food-partners/me/orders/${orderNumber}/status`,
      { status: 'accepted', promisedMinutes: 20 }, partnerToken,
    );
    check('the kitchen can move it to "accepted"', accepted.status === 200, `HTTP ${accepted.status}`);

    /* The broadcast is fired without being awaited, so give it a moment to
       land. Everything after this reads the database or polls, not a timer. */
    await new Promise((resolve) => setTimeout(resolve, 500));

    const searching = await FoodOrder.findOne({ orderNumber }).lean();
    check('the order entered the rider search', searching.dispatch.state === 'searching', searching.dispatch.state);
    check(
      'both riders in range were shortlisted',
      searching.dispatch.candidateCount >= 2,
      `${searching.dispatch.candidateCount}`,
    );
    check(
      'the radius came from the 20-minute quote',
      searching.dispatch.radiusMeters === dispatch._radiusFromMinutes(20),
      `${searching.dispatch.radiusMeters}m`,
    );

    /* ── 3. Everyone in range holds the offer at once — not just nearest ── */

    const nearOffer = await call('GET', '/api/v2/drivers/me/offer', undefined, near.token);
    const midOffer = await call('GET', '/api/v2/drivers/me/offer', undefined, mid.token);
    const farOffer = await call('GET', '/api/v2/drivers/me/offer', undefined, far.token);

    check('the near rider holds the offer', nearOffer.json?.data?.orderNumber === orderNumber);
    check('the mid-distance rider holds it too — this is a broadcast', midOffer.json?.data?.orderNumber === orderNumber);
    check('the rider outside the quote radius holds nothing', farOffer.json?.data === null);
    check(
      "the offer hides the diner's phone number before accepting",
      nearOffer.json?.data?.customerPhone === '',
    );
    check(
      'the offer shows the FULL delivery address before accepting',
      nearOffer.json?.data?.drop?.address === 'Room 204 · Sunrise Hostel · Gate 2',
      nearOffer.json?.data?.drop?.address,
    );
    check('the offer carries what the rider is paid', (nearOffer.json?.data?.earnings || 0) > 0, `₹${nearOffer.json?.data?.earnings}`);
    check('the offer names when the food will be ready', !!nearOffer.json?.data?.readyAt, nearOffer.json?.data?.readyAt);
    check('the offer has no fifteen-second countdown any more', nearOffer.json?.data?.expiresInSeconds === undefined);

    /* ── 4. A rider who was never in range cannot take it ────────────────── */

    const poach = await call('POST', `/api/v2/drivers/orders/${orderNumber}/accept`, {}, far.token);
    check('a rider who was never offered the order cannot accept it', poach.status === 409, `HTTP ${poach.status} ${poach.json?.code}`);

    /* ── 5. One of the offered riders accepts ────────────────────────────── */

    const accept = await call('POST', `/api/v2/drivers/orders/${orderNumber}/accept`, {}, near.token);
    check('the offered rider can accept', accept.status === 200, `HTTP ${accept.status} ${accept.json?.code || ''}`);
    check("accepting reveals the diner's number", !!accept.json?.data?.customerPhone);
    check('accepting reveals the pickup code', !!accept.json?.data?.pickupCode);

    const assigned = await FoodOrder.findOne({ orderNumber }).lean();
    check('the order is assigned', assigned.dispatch.state === 'assigned', assigned.dispatch.state);
    check('the rider is recorded on the order', assigned.delivery.driverId === near.rider.driverId);

    const busyRider = await Driver.findOne({ driverId: near.rider.driverId }).lean();
    check('the rider is marked unavailable', busyRider.isAvailable === false);
    check('the rider is marked as on this order', busyRider.currentOrderNumber === orderNumber);

    /* ── 6. Everybody else still holding the offer is told it is gone ───── */

    const midRow = (assigned.dispatch.offers || []).find((o) => o.driverId === mid.rider.driverId);
    check("the rider who did not win is stamped superseded, not left offered", midRow?.outcome === 'superseded', midRow?.outcome);

    const midAfter = await call('GET', '/api/v2/drivers/me/offer', undefined, mid.token);
    check('polling now shows nothing for the rider who did not win', midAfter.json?.data === null);

    /* ── The live position, which is what the diner's map draws ────────── */

    const moved = await call('PATCH', '/api/v2/drivers/me/location', {
      lat: rLat + 0.004, lng: rLng + 0.002, heading: 143,
    }, near.token);
    check('a rider can report their position', moved.status === 200, `HTTP ${moved.status}`);

    const following = await call('GET', `/api/v2/food-partners/orders/${orderNumber}`, undefined, dinerToken);
    const seen = following.json?.data?.rider;
    check('the diner is given the rider position', Array.isArray(seen?.location), JSON.stringify(seen?.location));
    check('the position is [lng, lat], not swapped', Math.abs((seen?.location?.[1] ?? 0) - (rLat + 0.004)) < 1e-6);
    check('the heading travels with it', seen?.heading === 143);
    check('the position says how old it is', !!seen?.at);
    check('the two ends of the journey are sent too', !!following.json?.data?.pickupLocation);

    /* Stale is dropped, not drawn: a marker sitting still reads as a rider who
       has stopped rather than as a phone that lost signal. */
    await Driver.updateOne(
      { driverId: near.rider.driverId },
      { $set: { locationUpdatedAt: new Date(Date.now() - 5 * 60 * 1000) } },
    );
    const stale = await call('GET', `/api/v2/food-partners/orders/${orderNumber}`, undefined, dinerToken);
    check('a stale position is withheld rather than drawn', stale.json?.data?.rider?.location === null);
    await Driver.updateOne(
      { driverId: near.rider.driverId },
      { $set: { locationUpdatedAt: new Date() } },
    );

    /* ── 7. Nobody else can take it now ──────────────────────────────────── */

    const second = await call('POST', `/api/v2/drivers/orders/${orderNumber}/accept`, {}, far.token);
    check('a second rider cannot take an assigned order', second.status === 409, second.json?.code);

    /* ── 8. Going offline mid-delivery is refused ───────────────────────── */

    const offline = await call('POST', '/api/v2/drivers/me/duty', { online: false }, near.token);
    check('a rider carrying an order cannot go offline', offline.status === 409, offline.json?.code);

    /* ── 9. The rider cannot collect before the kitchen is ready ─────────── */

    const early = await call('PATCH', `/api/v2/drivers/orders/${orderNumber}/status`, {
      status: 'picked_up', code: assigned.pickupCode,
    }, near.token);
    check('a rider cannot collect food that is not ready', early.status === 409, early.json?.code);

    /* ── 10. The kitchen keeps cooking it — it already accepted, in step 2 ── */

    for (const step of ['preparing', 'ready']) {
      // eslint-disable-next-line no-await-in-loop
      const moved_ = await call(
        'PATCH', `/api/v2/food-partners/me/orders/${orderNumber}/status`,
        { status: step }, partnerToken,
      );
      check(`the kitchen can move it to "${step}"`, moved_.status === 200, `HTTP ${moved_.status}`);
      if (step === 'ready') {
        check('the kitchen sees which rider is coming', moved_.json?.data?.rider?.name === near.rider.name);
      }
    }

    /* ── 11. Both hand-overs are gated on the other party's code ─────────── */

    const wrongPickup = await call('PATCH', `/api/v2/drivers/orders/${orderNumber}/status`, {
      status: 'picked_up', code: '0000' === assigned.pickupCode ? '1111' : '0000',
    }, near.token);
    check('a wrong pickup code is refused', wrongPickup.status === 409, wrongPickup.json?.code);

    const pickup = await call('PATCH', `/api/v2/drivers/orders/${orderNumber}/status`, {
      status: 'picked_up', code: assigned.pickupCode,
    }, near.token);
    check('the right pickup code collects the order', pickup.status === 200, `HTTP ${pickup.status}`);

    const wrongDrop = await call('PATCH', `/api/v2/drivers/orders/${orderNumber}/status`, {
      status: 'delivered', code: '9999' === assigned.deliveryOtp ? '8888' : '9999',
    }, near.token);
    check('a wrong delivery PIN is refused', wrongDrop.status === 409, wrongDrop.json?.code);

    const delivered = await call('PATCH', `/api/v2/drivers/orders/${orderNumber}/status`, {
      status: 'delivered', code: assigned.deliveryOtp,
    }, near.token);
    check('the right delivery PIN completes it', delivered.status === 200, `HTTP ${delivered.status}`);

    /* ── 12. Everything that has to be true afterwards ───────────────────── */

    const done = await FoodOrder.findOne({ orderNumber }).lean();
    check('the order is delivered', done.status === 'delivered');
    check('a cash order is marked paid on delivery', done.paymentStatus === 'paid', done.paymentStatus);
    check('the delivery time was recorded', !!done.delivery.deliveredAt);

    const freeRider = await Driver.findOne({ driverId: near.rider.driverId }).lean();
    check('the rider is available again', freeRider.isAvailable === true);
    check('the rider is no longer on an order', freeRider.currentOrderNumber === null);

    /* ── The safety net ────────────────────────────────────────────────
       A rider held on an order that is over is invisible to the dispatcher for
       ever, and nothing a request does will fix it — the person who would have
       fixed it is the one who disappeared. This is the sweep that does. */
    await Driver.updateOne(
      { driverId: near.rider.driverId },
      { $set: { currentOrderNumber: orderNumber, isAvailable: false } },
    );
    const reconciled = await dispatch.reconcileDeliveries();
    const rescued = await Driver.findOne({ driverId: near.rider.driverId }).lean();
    check(
      'a rider stranded on a finished order is freed by the sweep',
      rescued.currentOrderNumber === null && rescued.isAvailable === true,
      `${reconciled.freed} freed`,
    );

    const earnings = await call('GET', '/api/v2/drivers/me/earnings', undefined, near.token);
    check('the delivery shows up in earnings', (earnings.json?.data?.today || 0) > 0, `₹${earnings.json?.data?.today}`);
    check('earnings report seven days', (earnings.json?.data?.weekly || []).length === 7);

    const tracked = await call('GET', `/api/v2/food-partners/orders/${orderNumber}`, undefined, dinerToken);
    check('the diner sees who delivered it', tracked.json?.data?.rider?.name === near.rider.name);
    check('the diner is not shown the rider shortlist', tracked.json?.data?.dispatch?.offers === undefined);
    check(
      'a delivered order stops broadcasting the rider position',
      tracked.json?.data?.rider?.location === null,
      'nothing to follow once it is done',
    );

    /* ── 13. An unpaid online order sends nobody ─────────────────────────── */

    const online = await call('POST', '/api/v2/food-partners/orders', {
      restaurantId: restaurant.restaurantId,
      lines: [{ productId: menu[0].productId, quantity: 1 }],
      fulfilment: 'delivery',
      paymentMode: 'online',
      deliveryAddress: 'Room 204 · Sunrise Hostel',
    }, dinerToken);

    if (online.status === 201) {
      const onlineNumber = online.json.data.orderNumber;
      madeOrders.push(onlineNumber);
      check('an online order is told to pay first', online.json?.nextStep === 'payment', online.json?.nextStep);

      await new Promise((resolve) => setTimeout(resolve, 300));
      const unpaid = await FoodOrder.findOne({ orderNumber: onlineNumber }).lean();
      check('no rider is sent for an unpaid order', unpaid.dispatch.state === 'idle', unpaid.dispatch.state);

      const queue = await call('GET', '/api/v2/food-partners/me/orders?status=placed', undefined, partnerToken);
      const inQueue = (queue.json?.data || []).some((o) => o.orderNumber === onlineNumber);
      check('an unpaid online order is invisible to the kitchen', !inQueue);
    } else {
      check('an online order is accepted', false, `HTTP ${online.status} ${online.json?.code}`);
    }

    /* ── 14. A rider's own decline survives somebody else's accept ───────── */

    await Driver.updateOne({ driverId: near.rider.driverId }, { $set: { isAvailable: true } });
    await Driver.updateOne({ driverId: mid.rider.driverId }, { $set: { isAvailable: true } });

    const second_ = await call('POST', '/api/v2/food-partners/orders', {
      restaurantId: restaurant.restaurantId,
      lines: [{ productId: menu[0].productId, quantity: 1 }],
      fulfilment: 'delivery',
      paymentMode: 'cod',
      deliveryAddress: 'Room 12 · Second Hostel',
    }, dinerToken);

    if (second_.status === 201) {
      const n2 = second_.json.data.orderNumber;
      madeOrders.push(n2);

      /* Same gate as order 1 — nothing goes out until the kitchen accepts.
         No quote this time, on purpose: `readyAtFor` and the radius floor
         both have to behave with nothing to work from. */
      await call(
        'PATCH', `/api/v2/food-partners/me/orders/${n2}/status`,
        { status: 'accepted' }, partnerToken,
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      const noQuoteRow = await FoodOrder.findOne({ orderNumber: n2 }).lean();
      check(
        'with no quote, the radius still floors at 2km',
        noQuoteRow.dispatch.radiusMeters === 2000,
        `${noQuoteRow.dispatch.radiusMeters}m`,
      );

      const midOffer2 = await call('GET', '/api/v2/drivers/me/offer', undefined, mid.token);
      check('the mid rider holds this second offer too', midOffer2.json?.data?.orderNumber === n2);
      check('with no quote, there is no ready time to show', midOffer2.json?.data?.readyAt === null);

      const declined = await call('POST', `/api/v2/drivers/orders/${n2}/decline`, { reason: 'Too far' }, mid.token);
      check('a rider can decline', declined.status === 200, `HTTP ${declined.status}`);

      const afterDecline = await FoodOrder.findOne({ orderNumber: n2 }).lean();
      const declinedRow = (afterDecline.dispatch.offers || []).find((o) => o.driverId === mid.rider.driverId);
      check('the decline is recorded with its reason', declinedRow?.outcome === 'declined' && declinedRow?.reason === 'Too far');

      const nearStillOpen = await call('GET', '/api/v2/drivers/me/offer', undefined, near.token);
      check('the OTHER rider can still see and take it after one declines', nearStillOpen.json?.data?.orderNumber === n2);

      const secondAccept = await call('POST', `/api/v2/drivers/orders/${n2}/accept`, {}, near.token);
      check('the rider who did not decline can accept', secondAccept.status === 200, `HTTP ${secondAccept.status}`);

      const afterAccept = await FoodOrder.findOne({ orderNumber: n2 }).lean();
      const stillDeclined = (afterAccept.dispatch.offers || []).find((o) => o.driverId === mid.rider.driverId);
      check(
        "one rider's decline is not overwritten by another rider's accept",
        stillDeclined?.outcome === 'declined',
        stillDeclined?.outcome,
      );
    }
  } catch (error) {
    check('the run completed', false, error.message);
  } finally {
    /* ── Clean up ───────────────────────────────────────────────────────── */
    dispatch.stopAllDispatch();
    try {
      if (madeOrders.length) await FoodOrder.deleteMany({ orderNumber: { $in: madeOrders } });
      if (madeDrivers.length) await Driver.deleteMany({ driverId: { $in: madeDrivers } });
      if (diner) await Customer.deleteOne({ _id: diner._id });
    } catch (error) {
      console.error('cleanup failed:', error.message);
    }

    server.close();
    await closeConnections().catch(() => {});
  }

  const line = '='.repeat(78);
  console.log(`\n${line}\n  THE DELIVERY LOOP\n${line}`);
  let failed = 0;
  for (const [ok, name, extra] of results) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? `  · ${extra}` : ''}`);
  }
  console.log(`${line}\n  ${results.length - failed}/${results.length} passed\n${line}\n`);

  process.exit(failed ? 1 : 0);
})();
