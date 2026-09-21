/* ══════════════════════════════════════════════════════════════════════════
   Food favourites — the heart on a dish and on a kitchen.

     GET    /api/v2/customers/food-favourites
     POST   /api/v2/customers/food-favourites        { kind, id }
     DELETE /api/v2/customers/food-favourites/:kind/:id

   Until this landed the app kept favourites in React state: they did not
   survive backgrounding, let alone a reinstall or a second handset, and
   nothing was ever sent anywhere.

   The assertions that matter are the ones that would otherwise fail silently,
   because a favourites screen that is quietly short looks like a favourites
   screen:

     · the list comes back HYDRATED — a name, a price and an open state, not
       ids the app has to resolve against a feed that may not contain them
     · a dish's `restaurantId` is taken from the DISH, never from the request
       body, so one kitchen's name cannot be drawn over another's food
     · hearting twice is a 200 and does not duplicate the row — the caller is
       a button on a scrolling list and double taps are ordinary
     · un-hearting something that is not there is a 200, not a 404
     · a favourite whose kitchen has been suspended is WITHHELD from the
       response and KEPT in the record, and the count says how many
     · one diner cannot see another's favourites
     · a dish that does not exist cannot be hearted, so the screen never grows
       a permanently invisible row

   Cleans up after itself: the throwaway diners are removed and the borrowed
   restaurant is put back exactly as it was found.

   Run with: npm run verify:food-favourites
   ══════════════════════════════════════════════════════════════════════════ */
require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
const createApp = require('../app');

/* Refuse to run against production. See src/infrastructure/database/guard.js */
require('../src/infrastructure/database/guard').assertDevTargetOrExit();


const results = [];
const check = (name, ok, extra = '') => results.push([!!ok, name, extra]);

(async () => {
  await connectDB().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));

  if (!isLamposeUp()) { console.log('\nMongoDB is not reachable.\n'); process.exit(2); }
  if (!process.env.JWT_SECRET) { console.log('\nJWT_SECRET is not set.\n'); process.exit(2); }

  const app = createApp({});
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'favourites-verify',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body is fine */ }
    return { status: res.status, json };
  };

  const Customer = require('../src/modules/customers/customer.model');
  const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
  const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
  const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');

  const stamp = String(Date.now()).slice(-6);
  let diner = null;
  let stranger = null;
  let restoreRestaurant = null;

  try {
    /* A real listed restaurant with a real menu — borrowed, not invented, so
       the serialisers are exercised against a document the app would actually
       receive. */
    const restaurant = await FoodRestaurant.findOne({
      verificationStatus: 'approved', isActive: true,
    }).lean();

    if (!restaurant) {
      check('an approved restaurant exists to favourite', false,
        'run `npm run seed:food-menu` first');
      throw new Error('no approved restaurant');
    }

    const products = await FoodProduct.find({ restaurantId: restaurant.restaurantId })
      .limit(2).lean();
    check('an approved restaurant with a menu exists', products.length >= 1,
      `${restaurant.restaurantId} · ${products.length} dishes`);
    if (!products.length) throw new Error('the restaurant has no products');

    const dish = products[0];

    diner = await Customer.create({
      customerId: `FAV-${stamp}`, phone: `+9194${stamp}`, name: 'Favourite Diner',
    });
    const token = signCustomerToken(diner);

    stranger = await Customer.create({
      customerId: `FAV-X${stamp}`, phone: `+9193${stamp}`, name: 'Somebody Else',
    });
    const strangerToken = signCustomerToken(stranger);

    /* ── 1. Empty to begin with ──────────────────────────────────────── */
    const empty = await call('GET', '/api/v2/customers/food-favourites', undefined, token);
    check(
      'a new diner has no favourites, and the shape is still right',
      empty.status === 200 && Array.isArray(empty.json?.dishes) && Array.isArray(empty.json?.kitchens)
        && empty.json.dishes.length === 0,
      `${empty.json?.dishes?.length} dishes`,
    );

    /* ── 2. Heart a dish ─────────────────────────────────────────────── */
    const hearted = await call('POST', '/api/v2/customers/food-favourites', {
      kind: 'dish', id: dish.productId,
    }, token);
    check('a dish can be hearted', hearted.status === 200, hearted.json?.message);

    const row = (hearted.json?.dishes || [])[0];
    check(
      'and comes back HYDRATED — not an id the app has to resolve',
      !!row && row.productId === dish.productId && typeof row.productName === 'string'
        && row.productName.length > 0 && typeof row.price === 'number',
      row ? `${row.productName} · ₹${row.price}` : 'no row',
    );
    check(
      'carrying the kitchen that actually owns it',
      row?.restaurantId === restaurant.restaurantId && !!row?.restaurantName,
      `${row?.restaurantName}`,
    );
    check(
      'and the WHOLE kitchen nested, so the app can derive the dish meal windows',
      !!row?.restaurant && row.restaurant.restaurantId === restaurant.restaurantId
        && Array.isArray(row.restaurant.openingHours),
      `${row?.restaurant?.openingHours?.length} opening-hour rows`,
    );
    check(
      'including whether it is open — so no screen offers an Add button for food nobody is cooking',
      typeof row?.restaurant?.isCurrentlyOpen === 'boolean',
      `open: ${row?.restaurant?.isCurrentlyOpen}`,
    );

    /* ── 3. The restaurant is decided by the DISH, not the caller ────── */
    const lied = await call('POST', '/api/v2/customers/food-favourites', {
      kind: 'dish', id: products[products.length - 1].productId, restaurantId: 'NOT-A-REAL-KITCHEN',
    }, token);
    const lieRow = (lied.json?.dishes || []).find(
      (d) => d.productId === products[products.length - 1].productId,
    );
    check(
      "a restaurantId in the body is ignored — the dish decides its own kitchen",
      lied.status === 200 && lieRow?.restaurantId === restaurant.restaurantId,
      lieRow?.restaurantId,
    );

    /* ── 4. Idempotence, in both directions ──────────────────────────── */
    const again = await call('POST', '/api/v2/customers/food-favourites', {
      kind: 'dish', id: dish.productId,
    }, token);
    const copies = (again.json?.dishes || []).filter((d) => d.productId === dish.productId).length;
    check(
      'hearting twice is fine and does not duplicate the row',
      again.status === 200 && copies === 1,
      `${copies} copies`,
    );

    const removeTwice = await call(
      'DELETE', '/api/v2/customers/food-favourites/dish/NEVER-HEARTED-THIS', undefined, token,
    );
    check(
      'un-hearting something that was never hearted is a 200, not a 404',
      removeTwice.status === 200,
      `${removeTwice.status}`,
    );

    /* ── 5. Heart a kitchen ──────────────────────────────────────────── */
    const kitchen = await call('POST', '/api/v2/customers/food-favourites', {
      kind: 'kitchen', id: restaurant.restaurantId,
    }, token);
    check(
      'a kitchen can be hearted, and comes back with its name',
      kitchen.status === 200 && kitchen.json?.kitchens?.[0]?.restaurantName === restaurant.restaurantName,
      kitchen.json?.kitchens?.[0]?.restaurantName,
    );

    /* ── 6. Refusals ─────────────────────────────────────────────────── */
    const ghostDish = await call('POST', '/api/v2/customers/food-favourites', {
      kind: 'dish', id: 'NO-SUCH-DISH',
    }, token);
    check(
      'a dish that does not exist cannot be hearted',
      ghostDish.status === 404,
      `${ghostDish.status}`,
    );

    const ghostKitchen = await call('POST', '/api/v2/customers/food-favourites', {
      kind: 'kitchen', id: 'NO-SUCH-KITCHEN',
    }, token);
    check('nor a kitchen that does not exist', ghostKitchen.status === 404);

    const badKind = await call('POST', '/api/v2/customers/food-favourites', {
      kind: 'planet', id: dish.productId,
    }, token);
    check('an unknown kind is refused', badKind.status === 400, badKind.json?.code);

    const noToken = await call('GET', '/api/v2/customers/food-favourites');
    check('favourites are not readable with no session', noToken.status === 401);

    /* ── 7. One diner cannot see another's ───────────────────────────── */
    const theirs = await call('GET', '/api/v2/customers/food-favourites', undefined, strangerToken);
    check(
      "another diner's list is empty, not this one",
      theirs.status === 200 && theirs.json.dishes.length === 0 && theirs.json.kitchens.length === 0,
      `${theirs.json?.dishes?.length}/${theirs.json?.kitchens?.length}`,
    );

    /* ── 8. A suspended kitchen: WITHHELD, not deleted ───────────────── *
     * The case that would otherwise be discovered by a student whose
     * favourites quietly emptied themselves. Suspend the restaurant, confirm
     * the rows disappear from the RESPONSE and are counted, then restore it
     * and confirm they come back — proving the record was never touched.
     */
    restoreRestaurant = {
      _id: restaurant._id,
      isActive: restaurant.isActive,
    };
    await FoodRestaurant.updateOne({ _id: restaurant._id }, { $set: { isActive: false } });

    const suspended = await call('GET', '/api/v2/customers/food-favourites', undefined, token);
    check(
      'a favourite whose kitchen is suspended is withheld from the response',
      suspended.json?.dishes?.length === 0 && suspended.json?.kitchens?.length === 0,
      `${suspended.json?.dishes?.length} dishes shown`,
    );
    check(
      'and the screen is told how many, rather than just being short',
      (suspended.json?.unavailable || 0) >= 3,
      `${suspended.json?.unavailable} withheld`,
    );

    await FoodRestaurant.updateOne({ _id: restaurant._id }, { $set: { isActive: true } });
    restoreRestaurant = null;

    const restored = await call('GET', '/api/v2/customers/food-favourites', undefined, token);
    check(
      'and the favourites come BACK when it is listed again — the record was never deleted',
      restored.json?.dishes?.length === 2 && restored.json?.kitchens?.length === 1,
      `${restored.json?.dishes?.length} dishes, ${restored.json?.kitchens?.length} kitchens`,
    );

    /* ── 9. Un-hearting actually removes ─────────────────────────────── */
    const removed = await call(
      'DELETE', `/api/v2/customers/food-favourites/dish/${encodeURIComponent(dish.productId)}`,
      undefined, token,
    );
    check(
      'un-hearting a dish removes exactly that one',
      removed.status === 200
        && !(removed.json?.dishes || []).some((d) => d.productId === dish.productId)
        && removed.json.dishes.length === 1,
      `${removed.json?.dishes?.length} left`,
    );

    const removedKitchen = await call(
      'DELETE', `/api/v2/customers/food-favourites/kitchen/${encodeURIComponent(restaurant.restaurantId)}`,
      undefined, token,
    );
    check('and a kitchen can be un-hearted too', removedKitchen.json?.kitchens?.length === 0);

    /* ── 10. It survives the session ─────────────────────────────────── */
    const persisted = await Customer.findOne({ customerId: diner.customerId })
      .select('foodFavourites').lean();
    check(
      'the favourite is on the ACCOUNT, so it survives a reinstall',
      persisted?.foodFavourites?.dishes?.length === 1,
      `${persisted?.foodFavourites?.dishes?.length} stored`,
    );
  } catch (error) {
    check('the run completed', false, error.message);
  } finally {
    try {
      /* Put the borrowed restaurant back if a check threw between suspending
         and restoring it — leaving a real kitchen switched off would take the
         whole food feed down. */
      if (restoreRestaurant) {
        await FoodRestaurant.updateOne(
          { _id: restoreRestaurant._id },
          { $set: { isActive: restoreRestaurant.isActive } },
        );
      }
      if (diner) await Customer.deleteOne({ _id: diner._id });
      if (stranger) await Customer.deleteOne({ _id: stranger._id });
    } catch (error) {
      console.error('cleanup failed:', error.message);
    }
    server.close();
    await closeConnections().catch(() => {});
  }

  const line = '='.repeat(78);
  console.log(`\n${line}\n  FOOD FAVOURITES\n${line}`);
  let failed = 0;
  for (const [ok, name, extra] of results) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? `  · ${extra}` : ''}`);
  }
  console.log(`${line}\n  ${results.length - failed}/${results.length} passed\n${line}\n`);

  process.exit(failed ? 1 : 0);
})();
