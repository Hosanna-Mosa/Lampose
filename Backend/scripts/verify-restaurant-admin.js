/* ══════════════════════════════════════════════════════════════════════════
   The Restaurant Admin console, end to end.

     npm run verify:restaurant-admin

   The admin panel has two front doors now. This walks the second one: a
   restaurant OWNER signing in at `/api/v1/restaurant-admin/login` with the
   same credentials the Food-Partner app uses, and working their own orders
   and their own menu from the browser.

   ## It brings its own database

   `mongodb-memory-server`, started here and thrown away at the end. Nothing
   touches a real deployment — the same rule `verify-partner-login.js` states
   and for the same reason: provisioning an owner is a WRITE, and a verify
   script that performed it against production would leave a live restaurant
   with a known password behind every time somebody ran it.

   ## What it asserts

   Three things, and the middle one is why this file exists.

   1. THE DOOR OPENS. The route is mounted at v1, the right password is
      accepted, the wrong one is refused with the same sentence as an unknown
      account, and a rejected application is turned away at sign-in rather
      than handed a token the next request would throw out.

   2. THE SIX IDENTITIES STAY APART. Every identity in this process signs
      with one `JWT_SECRET`, so a token from any of them verifies against the
      others — what keeps them apart is the `typ` claim and nothing else.
      This asserts it in BOTH directions that matter: the app's
      `foodpartner` token cannot reach the console, and the console's
      `restaurant_admin` token cannot reach the app's own routes or the
      STAFF console at `/api/v1/admin/*`. If somebody later widens a guard
      "just to make it work", this is the file that fails.

   3. ONE SHOP SEES ONE SHOP. A second restaurant is created with its own
      order and its own dish, and the first restaurant's session is pointed
      at both. Neither is visible to it, and the miss is a 404 rather than a
      403 — for the reason `foodOrder.controller.js` gives: an order number
      is six digits read down a phone line, and "403" on a number you guessed
      confirms the order exists.

   4. THE MONEY ADDS UP. Analytics and Earnings are aggregations, and an
      aggregation that is subtly wrong looks exactly like one that is right.
      So the sums are asserted against each other rather than eyeballed:
      food sales minus commission equals earnings, the cash and online
      buckets add back to the total, and the ledger's rows add to the
      headline. One order is given a delivery fee and a packaging charge on
      purpose, because commission is charged on the FOOD and not on the bill
      — with fee-free orders the two are the same number and the distinction
      that matters is never tested.

   5. THE BANK ACCOUNT NEVER COMES BACK OUT. An owner may add payout accounts
      and switch between them — a deliberate exception to `PATCH /me`, which
      still refuses `payout`. Two things are asserted about it: that the
      exception is narrow (the old route is still shut), and that the full
      account number never appears in any response, on any route, including
      the one that just accepted it. `select: false` and the `toJSON`
      transform are two independent guards and this checks the result rather
      than either mechanism.

   6. NO ORDER IS PAID TWICE. An owner requests a payout, staff settle it,
      and the money must leave the balance exactly once. Two requests fired
      CONCURRENTLY are asserted to produce one payout and one refusal, not
      two claims on the same orders — that is the failure this system exists
      to prevent and the only one that cannot be noticed by looking. A
      refused request is asserted to give the money back, because the
      opposite bug is just as bad and completely silent.
   ══════════════════════════════════════════════════════════════════════════ */

const { MongoMemoryServer } = require('mongodb-memory-server');

const results = [];
const check = (name, ok, extra = '') => results.push([!!ok, name, extra]);

const PASSWORD = 'verify-restaurant-1234';

const OWNER = {
  name: 'Verify Kitchen',
  owner: 'Verify Owner',
  phone: '+919876500101',
  email: 'verify-restaurant-admin@example.test',
};

const OTHER = {
  name: 'Someone Else’s Kitchen',
  owner: 'Other Owner',
  phone: '+919876500102',
  email: 'verify-restaurant-other@example.test',
};

(async () => {
  const mongo = await MongoMemoryServer.create();

  /* Both BEFORE config/env is required — it reads the environment once. */
  process.env.MONGO_URI = mongo.getUri('lampose-verify');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'verify-only-secret-not-a-credential';

  require('../src/config/env');
  const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
  const createApp = require('../app');
  const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
  const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');
  const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
  const FoodPayout = require('../src/modules/foodpartners/foodPayout.model');
  const {
    signFoodPartnerToken,
  } = require('../src/modules/foodpartners/foodPartnerAuth.middleware');

  await connectDB().catch(() => {});
  for (let i = 0; i < 40 && !isLamposeUp(); i += 1) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!isLamposeUp()) { console.log('\nin-memory MongoDB did not come up\n'); process.exit(2); }

  const app = createApp({});
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'restaurant-admin-verify',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* an empty body is fine */ }
    return { status: res.status, json };
  };

  /** A shop, provisioned the way an approved application leaves one. */
  const makeShop = async (who, status = 'approved') => {
    const shop = new FoodRestaurant({
      restaurantId: FoodRestaurant.makeRestaurantId(),
      restaurantName: who.name,
      ownerName: who.owner,
      ownerPhone: who.phone,
      ownerEmail: who.email,
      fssaiLicenseNumber: '12345678901234',
      verificationStatus: status,
      isActive: status === 'approved',
      openState: 'open',
    });
    shop.passwordHash = await FoodRestaurant.hashPassword(PASSWORD);
    await shop.save();
    return shop;
  };

  /**
   * An order, with the money spelled out.
   *
   * `itemsTotal` is the food; `grandTotal` adds the fees a diner also pays.
   * `partnerPayout` is 85% of the FOOD, never of the bill — that is how
   * `foodCustomerOrder.controller.js` computes it, and the earnings route
   * derives commission by subtracting the two, so a fixture that set payout
   * against `grandTotal` would make a broken route look correct.
   */
  const makeOrder = async (shop, opts = {}) => {
    const {
      status = 'placed', items = 100, deliveryFee = 0, packagingCharge = 0,
      paymentMode = 'cod', fulfilment = 'delivery', dish = 'Verify Dish',
    } = opts;
    const order = new FoodOrder({
      orderNumber: FoodOrder.makeOrderNumber(),
      restaurantId: shop.restaurantId,
      customerId: 'cust_verify',
      customerName: 'A Diner',
      customerPhone: '+919876500999',
      lines: [{ productId: 'FPI-VERIFY', productName: dish, quantity: 2, unitPrice: items / 2, lineTotal: items }],
      itemsTotal: items,
      deliveryFee,
      packagingCharge,
      grandTotal: items + deliveryFee + packagingCharge,
      partnerPayout: items * 0.85,
      commissionRate: 15,
      paymentMode,
      paymentStatus: paymentMode === 'cod' ? 'pending' : 'paid',
      fulfilment,
      status,
    });
    await order.save();
    return order;
  };

  /* A console administrator, for the staff half of the payout flow. The
     capability table gates on `role`, so the role is the whole fixture. */
  const Admin = require('../src/modules/admins/admin.model');
  const { signAdminToken } = require('../src/modules/admins/adminToken');
  let adminSeq = 0;
  const makeAdmin = async (role) => {
    adminSeq += 1;
    return Admin.create({
      name: `Verify ${role}`,
      email: `verify-${role.toLowerCase().replace(/ /g, '-')}-${adminSeq}@example.test`,
      password: 'verify-admin-1234',
      role,
      status: 'Active',
    });
  };

  try {
    const mine = await makeShop(OWNER);
    const theirs = await makeShop(OTHER);

    /* ── 1. The door ──────────────────────────────────────────────────── */

    const bad = await call('POST', '/api/v1/restaurant-admin/login', {
      identifier: OWNER.email, password: 'not-the-password',
    });
    check('a wrong password → 401', bad.status === 401, `got ${bad.status}`);

    const unknown = await call('POST', '/api/v1/restaurant-admin/login', {
      identifier: 'nobody@example.test', password: PASSWORD,
    });
    check('an unknown account → 401', unknown.status === 401, `got ${unknown.status}`);
    /* The SAME sentence for both, or this endpoint becomes a way to ask which
       restaurants Lampose has. */
    check(
      'both refusals read identically — no account enumeration',
      bad.json?.message === unknown.json?.message,
      `${bad.json?.message} vs ${unknown.json?.message}`,
    );

    const ok = await call('POST', '/api/v1/restaurant-admin/login', {
      identifier: OWNER.email, password: PASSWORD,
    });
    check('POST /api/v1/restaurant-admin/login → 200', ok.status === 200, `got ${ok.status}`);
    check('a token comes back', Boolean(ok.json?.data?.token));
    check('the shop comes back', ok.json?.data?.restaurant?.restaurantId === mine.restaurantId);
    check(
      'the response carries no passwordHash',
      !JSON.stringify(ok.json || {}).includes('passwordHash'),
    );

    const token = ok.json?.data?.token;

    /* The phone is the other half of "one field, two kinds of value". */
    const byPhone = await call('POST', '/api/v1/restaurant-admin/login', {
      identifier: '9876500101', password: PASSWORD,
    });
    check('signing in by phone number works too', byPhone.status === 200, `got ${byPhone.status}`);

    const rejected = await makeShop(
      { ...OWNER, phone: '+919876500103', email: 'verify-rejected@example.test' },
      'rejected',
    );
    rejected.verificationNote = 'The licence did not match the address.';
    await rejected.save();
    const dead = await call('POST', '/api/v1/restaurant-admin/login', {
      identifier: 'verify-rejected@example.test', password: PASSWORD,
    });
    check('a rejected application → 403 at sign-in, not a doomed token', dead.status === 403, `got ${dead.status}`);
    check('…and it says why', dead.json?.code === 'ACCOUNT_REJECTED', dead.json?.code);
    check('no token is issued to it', !dead.json?.data?.token);

    /* ── 2. Six identities, six doors ─────────────────────────────────── */

    const none = await call('GET', '/api/v1/restaurant-admin/summary');
    check('no token → 401', none.status === 401, `got ${none.status}`);

    const works = await call('GET', '/api/v1/restaurant-admin/summary', undefined, token);
    check('the token is a real session, not just a signed string', works.status === 200, `got ${works.status}`);

    /* The app's own token must NOT open the console. */
    const mobileToken = signFoodPartnerToken(mine);
    const crossIn = await call('GET', '/api/v1/restaurant-admin/summary', undefined, mobileToken);
    check(
      "the app's foodpartner token cannot open the console",
      crossIn.status === 401 && crossIn.json?.code === 'WRONG_TOKEN_TYPE',
      `${crossIn.status} ${crossIn.json?.code}`,
    );

    /* …and the console's token must NOT open the app. */
    const crossOut = await call('GET', '/api/v2/food-partners/me', undefined, token);
    check(
      "the console's token cannot open the app's own routes",
      crossOut.status === 401 && crossOut.json?.code === 'WRONG_TOKEN_TYPE',
      `${crossOut.status} ${crossOut.json?.code}`,
    );

    /* …nor the STAFF console, which is the one that matters most: those
       routes see every restaurant, every order and every payout. */
    for (const staffPath of [
      '/api/v1/admin/food-orders',
      '/api/v1/admin/food-restaurants',
      '/api/v1/admin/users',
      '/api/v1/admin/stats',
    ]) {
      const staff = await call('GET', staffPath, undefined, token);
      check(`the console's token cannot reach ${staffPath}`, staff.status === 401, `got ${staff.status}`);
    }

    /* ── 3. One shop sees one shop ────────────────────────────────────── */

    const myOrder = await makeOrder(mine, { status: 'placed' });
    const theirOrder = await makeOrder(theirs, { status: 'placed' });

    await FoodProduct.create({
      productId: 'FPI-MINE0001', restaurantId: mine.restaurantId,
      productName: 'My Dish', category: 'Mains', price: 100,
    });
    await FoodProduct.create({
      productId: 'FPI-THEIRS01', restaurantId: theirs.restaurantId,
      productName: 'Their Dish', category: 'Mains', price: 100,
    });

    const orders = await call('GET', '/api/v1/restaurant-admin/orders', undefined, token);
    check('the queue lists my order', orders.json?.data?.some((o) => o.orderNumber === myOrder.orderNumber));
    check(
      "the queue does NOT list another shop's order",
      !orders.json?.data?.some((o) => o.orderNumber === theirOrder.orderNumber),
    );

    const peek = await call('GET', `/api/v1/restaurant-admin/orders/${theirOrder.orderNumber}`, undefined, token);
    check(
      "another shop's order reads as 404, never 403",
      peek.status === 404,
      `got ${peek.status} — a 403 would confirm the order exists`,
    );

    const menu = await call('GET', '/api/v1/restaurant-admin/menu', undefined, token);
    check('the menu lists my dish', menu.json?.data?.some((p) => p.productId === 'FPI-MINE0001'));
    check(
      "the menu does NOT list another shop's dish",
      !menu.json?.data?.some((p) => p.productId === 'FPI-THEIRS01'),
    );

    const steal = await call(
      'PATCH', '/api/v1/restaurant-admin/menu/FPI-THEIRS01',
      { price: 1 }, token,
    );
    check("another shop's dish cannot be edited", steal.status === 404, `got ${steal.status}`);

    /* ── The orders a kitchen may actually move ───────────────────────── */

    const accept = await call(
      'PATCH', `/api/v1/restaurant-admin/orders/${myOrder.orderNumber}/status`,
      { status: 'accepted', promisedMinutes: 25 }, token,
    );
    check('placed → accepted is allowed', accept.status === 200, `got ${accept.status}`);
    check('the quoted time is kept', accept.json?.data?.promisedMinutes === 25);

    const illegal = await call(
      'PATCH', `/api/v1/restaurant-admin/orders/${myOrder.orderNumber}/status`,
      { status: 'delivered' }, token,
    );
    check(
      'a kitchen cannot mark an order delivered — that is the rider’s move',
      illegal.status === 409 && illegal.json?.code === 'INVALID_TRANSITION',
      `${illegal.status} ${illegal.json?.code}`,
    );

    const alsoIllegal = await call(
      'PATCH', `/api/v1/restaurant-admin/orders/${myOrder.orderNumber}/status`,
      { status: 'picked_up' }, token,
    );
    check(
      'nor picked_up',
      alsoIllegal.status === 409,
      `got ${alsoIllegal.status}`,
    );

    /* ── The menu, in full ────────────────────────────────────────────── */

    const created = await call('POST', '/api/v1/restaurant-admin/menu', {
      productName: 'Verify Biryani', category: 'Mains', price: 180, isVeg: 'veg',
    }, token);
    check('a dish can be added', created.status === 201 || created.status === 200, `got ${created.status}`);
    const newId = created.json?.data?.productId;

    const patched = await call('PATCH', `/api/v1/restaurant-admin/menu/${newId}`, {
      price: 200, discountedPrice: 150,
    }, token);
    check('a dish can be edited', patched.status === 200, `got ${patched.status}`);
    check('the offer price is stored', patched.json?.data?.discountedPrice === 150);

    const badOffer = await call('PATCH', `/api/v1/restaurant-admin/menu/${newId}`, {
      discountedPrice: 500,
    }, token);
    check('an offer above the price is refused', badOffer.status === 400, `got ${badOffer.status}`);

    const off = await call('PATCH', `/api/v1/restaurant-admin/menu/${newId}/availability`, {
      isAvailable: false,
    }, token);
    check('a dish can be switched out of stock', off.json?.data?.isAvailable === false);

    const soldOut = await call('GET', '/api/v1/restaurant-admin/menu', undefined, token);
    check(
      'a sold-out dish is still LISTED — switching it back on is the point',
      soldOut.json?.data?.some((p) => p.productId === newId),
    );
    check('…and counted', soldOut.json?.unavailable === 1, `unavailable = ${soldOut.json?.unavailable}`);

    const toggleless = await call(
      'PATCH', `/api/v1/restaurant-admin/menu/${newId}/availability`, {}, token,
    );
    check('availability demands a state, never a toggle', toggleless.status === 400, `got ${toggleless.status}`);

    const removed = await call('DELETE', `/api/v1/restaurant-admin/menu/${newId}`, undefined, token);
    check('a dish can be removed', removed.status === 200, `got ${removed.status}`);

    /* ── The shop record ──────────────────────────────────────────────── */

    const settings = await call('PATCH', '/api/v1/restaurant-admin/me', {
      description: 'Changed by the verify script', minOrderValue: 99,
    }, token);
    check('an owner may change their own settings', settings.status === 200, `got ${settings.status}`);

    const locked = await call('PATCH', '/api/v1/restaurant-admin/me', {
      restaurantName: 'Renamed Without Anybody Looking',
    }, token);
    check(
      'an owner may NOT rename the verified business',
      locked.status === 403,
      `got ${locked.status} — the licence names this business at this address`,
    );

    const payout = await call('PATCH', '/api/v1/restaurant-admin/me', {
      payout: { bankAccountNumber: '000000000000' },
    }, token);
    check(
      'an owner may NOT repoint the payout account',
      payout.status === 403,
      `got ${payout.status}`,
    );

    /* ── The summary ──────────────────────────────────────────────────── */

    const summary = await call('GET', '/api/v1/restaurant-admin/summary', undefined, token);
    check('the summary answers', summary.status === 200, `got ${summary.status}`);
    check(
      'it counts only this shop',
      summary.json?.data?.restaurant?.restaurantId === mine.restaurantId,
    );
    check(
      'the accepted order shows as in the kitchen',
      summary.json?.data?.live?.inKitchen === 1,
      `inKitchen = ${summary.json?.data?.live?.inKitchen}`,
    );

    /* ── Analytics and Earnings ───────────────────────────────────────── */

    /*
     * Three delivered orders with DIFFERENT money, so the sums have something
     * to be wrong about:
     *
     *   food 200, ₹30 delivery + ₹10 packaging, paid online
     *   food 100, no fees, cash at the door
     *   food 400, ₹20 packaging, cash at the counter on a pickup
     *
     * Food totals 700, so commission is 105 and earnings 595. The bill totals
     * 760. A route that charged commission on the BILL would report 114 and
     * 646, and the assertions below would catch it.
     */
    await makeOrder(mine, {
      status: 'delivered', items: 200, deliveryFee: 30, packagingCharge: 10,
      paymentMode: 'online', dish: 'Paneer Butter Masala',
    });
    await makeOrder(mine, {
      status: 'delivered', items: 100, paymentMode: 'cod', dish: 'Veg Biryani',
    });
    await makeOrder(mine, {
      status: 'delivered', items: 400, packagingCharge: 20,
      paymentMode: 'cod', fulfilment: 'pickup', dish: 'Paneer Butter Masala',
    });
    /* One refused, so the fulfilment rate has a denominator worth dividing. */
    await makeOrder(mine, { status: 'rejected', items: 100 });
    /* And one for the OTHER shop, large enough that leaking it would show. */
    await makeOrder(theirs, { status: 'delivered', items: 9999 });

    const an = await call('GET', '/api/v1/restaurant-admin/analytics?days=30', undefined, token);
    check('GET /analytics → 200', an.status === 200, `got ${an.status}`);
    const a = an.json?.data || {};
    check('every day in the window is present, gaps included', a.series?.length === 30, `${a.series?.length} buckets`);
    check('all twenty-four hours are present', a.hours?.length === 24, `${a.hours?.length} buckets`);
    check('it counts only this shop', a.totals?.earnings === 595, `earnings ${a.totals?.earnings}`);
    check('delivered is counted', a.totals?.delivered === 3, `delivered ${a.totals?.delivered}`);
    check(
      'the average order is per DELIVERED order',
      a.totals?.averageOrder === 595 / 3,
      `${a.totals?.averageOrder}`,
    );
    /* 3 delivered, 1 rejected — the order still sitting in the kitchen is not
       in the denominator. 3/4, not 3/5. */
    check(
      'the fulfilment rate excludes orders still in the kitchen',
      a.totals?.fulfilmentRate === 0.75,
      `${a.totals?.fulfilmentRate}`,
    );
    check(
      'the dish that sells most is ranked first',
      a.topDishes?.[0]?.productName === 'Paneer Butter Masala',
      a.topDishes?.[0]?.productName,
    );
    check(
      'the payment split adds back to the delivered count',
      (a.payment?.online?.orders || 0) + (a.payment?.cash?.orders || 0) === 3,
    );
    check(
      "another shop's ₹9999 order is nowhere in it",
      !JSON.stringify(a).includes('9999') && a.totals?.gross === 760,
      `gross ${a.totals?.gross}`,
    );

    const ea = await call(
      'GET', '/api/v1/restaurant-admin/earnings?from=2020-01-01&to=2099-12-31', undefined, token,
    );
    check('GET /earnings → 200', ea.status === 200, `got ${ea.status}`);
    const e = ea.json?.data || {};
    check('food sales are the FOOD, not the bill', e.totals?.items === 700, `items ${e.totals?.items}`);
    check('the bill is reported separately', e.totals?.gross === 760, `gross ${e.totals?.gross}`);
    /* The assertion this whole fixture exists for. */
    check(
      'commission is charged on food, not on the bill',
      e.totals?.commission === 105,
      `${e.totals?.commission} — 114 would mean it was charged on the bill`,
    );
    check('earnings = food − commission', e.totals?.earnings === 595, `${e.totals?.earnings}`);
    check(
      'the effective rate is the one that actually applied',
      Math.round((e.totals?.effectiveRate || 0) * 100) / 100 === 15,
      `${e.totals?.effectiveRate}`,
    );

    const online = e.paidBy?.online || {};
    const cash = e.paidBy?.cash || {};
    check('the online bucket is right', online.orders === 1 && online.earnings === 170, `${online.orders} / ${online.earnings}`);
    check('the cash bucket is right', cash.orders === 2 && cash.earnings === 425, `${cash.orders} / ${cash.earnings}`);
    check(
      'the two buckets add back to the total — nothing is lost between them',
      online.earnings + cash.earnings === e.totals?.earnings,
    );
    check(
      'a pickup is counted as a pickup, not a delivery',
      cash.pickup === 1 && cash.delivery === 1,
      `pickup ${cash.pickup} delivery ${cash.delivery}`,
    );

    check('the ledger lists every delivered order', e.ledger?.length === 3, `${e.ledger?.length} rows`);
    check('the ledger is not truncated at this size', e.ledgerTruncated === false);
    check(
      'the ledger rows add up to the headline',
      e.ledger?.reduce((n, row) => n + row.partnerPayout, 0) === e.totals?.earnings,
    );
    check(
      'each row subtracts its own commission correctly',
      e.ledger?.every((row) => row.itemsTotal - row.commission === row.partnerPayout),
    );
    /*
     * The thing this page must never do. There is no food settlement ledger,
     * so nothing in the payload may imply money has moved — if somebody later
     * adds a `paid` or `settled` field without building the ledger behind it,
     * this is the assertion that stops it.
     */
    check(
      'nothing in the payload claims money was PAID',
      !/"(paid|settled|transferred)(At|On|Status)?":/i.test(
        JSON.stringify(e).replace(/"paidBy":/g, '""'),
      ),
    );
    check('…and it says so in words', /not a payout statement/i.test(e.note || ''), e.note);

    const backwards = await call(
      'GET', '/api/v1/restaurant-admin/earnings?from=2026-06-01&to=2026-01-01', undefined, token,
    );
    check('a backwards range is refused', backwards.status === 400, `got ${backwards.status}`);
    const nonsense = await call(
      'GET', '/api/v1/restaurant-admin/earnings?from=the-first-of-never', undefined, token,
    );
    check(
      'an unreadable date is refused, not silently widened to everything',
      nonsense.status === 400,
      `got ${nonsense.status}`,
    );

    /* Both are behind the same guard as everything else. */
    for (const path of ['/api/v1/restaurant-admin/analytics', '/api/v1/restaurant-admin/earnings']) {
      const anon = await call('GET', path);
      check(`${path} needs a session`, anon.status === 401, `got ${anon.status}`);
      const wrongDoor = await call('GET', path, undefined, mobileToken);
      check(`${path} refuses the app's token`, wrongDoor.status === 401, `got ${wrongDoor.status}`);
    }

    /* ── Payout accounts ──────────────────────────────────────────────── */

    const ACCOUNT_A = '000111222333';
    const ACCOUNT_B = '999888777666';

    /* Nothing saved yet, and this shop was created without a `payout`, so
       the backfill has nothing to find either. */
    const empty = await call('GET', '/api/v1/restaurant-admin/payout-accounts', undefined, token);
    check('GET /payout-accounts → 200 with nothing saved', empty.status === 200 && empty.json?.count === 0,
      `${empty.status} / ${empty.json?.count}`);

    const noName = await call('POST', '/api/v1/restaurant-admin/payout-accounts', {
      bankAccountNumber: ACCOUNT_A, confirmAccountNumber: ACCOUNT_A, ifscCode: 'HDFC0001234',
    }, token);
    check('an account with no holder name is refused', noName.status === 400, `got ${noName.status}`);

    const badIfsc = await call('POST', '/api/v1/restaurant-admin/payout-accounts', {
      accountHolderName: 'Verify Owner', bankAccountNumber: ACCOUNT_A,
      confirmAccountNumber: ACCOUNT_A, ifscCode: 'NOTANIFSC',
    }, token);
    check('a malformed IFSC is refused', badIfsc.status === 400, `got ${badIfsc.status}`);

    /* The check the second box exists for. A mistyped account number is not
       caught by anything downstream — it is money sent to a stranger. */
    const mismatch = await call('POST', '/api/v1/restaurant-admin/payout-accounts', {
      accountHolderName: 'Verify Owner', bankAccountNumber: ACCOUNT_A,
      confirmAccountNumber: '000111222334', ifscCode: 'HDFC0001234',
    }, token);
    check('two different account numbers are refused', mismatch.status === 400, `got ${mismatch.status}`);

    const tooShort = await call('POST', '/api/v1/restaurant-admin/payout-accounts', {
      accountHolderName: 'Verify Owner', bankAccountNumber: '12345',
      confirmAccountNumber: '12345', ifscCode: 'HDFC0001234',
    }, token);
    check('a five-digit account number is refused', tooShort.status === 400, `got ${tooShort.status}`);

    const first = await call('POST', '/api/v1/restaurant-admin/payout-accounts', {
      accountHolderName: 'Verify Owner', bankAccountNumber: ACCOUNT_A,
      confirmAccountNumber: ACCOUNT_A, ifscCode: 'hdfc0001234',
      accountType: 'current', label: 'HDFC current',
    }, token);
    check('the first account saves', first.status === 201, `got ${first.status}`);
    /* Not asked for, but true by necessity: a shop with one account and none
       active could not be paid at all. */
    check('…and is active without being asked to be', first.json?.data?.isActive === true);
    check('the IFSC is upper-cased', first.json?.data?.ifscCode === 'HDFC0001234', first.json?.data?.ifscCode);
    check('only the last four digits come back', first.json?.data?.accountLast4 === '2333',
      first.json?.data?.accountLast4);
    /* The assertion that matters most on this whole route. */
    check(
      'the full account number is NOT in the response that just accepted it',
      !JSON.stringify(first.json || {}).includes(ACCOUNT_A),
    );

    const accountA = first.json?.data?.accountId;

    const dupe = await call('POST', '/api/v1/restaurant-admin/payout-accounts', {
      accountHolderName: 'Verify Owner', bankAccountNumber: ACCOUNT_A,
      confirmAccountNumber: ACCOUNT_A, ifscCode: 'HDFC0001234',
    }, token);
    check('the same account twice is refused', dupe.status === 409 && dupe.json?.code === 'DUPLICATE_ACCOUNT',
      `${dupe.status} ${dupe.json?.code}`);

    const second = await call('POST', '/api/v1/restaurant-admin/payout-accounts', {
      accountHolderName: 'Verify Owner', bankAccountNumber: ACCOUNT_B,
      confirmAccountNumber: ACCOUNT_B, ifscCode: 'SBIN0005678',
      accountType: 'savings', label: 'SBI savings',
    }, token);
    check('a second account saves', second.status === 201, `got ${second.status}`);
    check('…and does NOT take over on its own', second.json?.data?.isActive === false);
    const accountB = second.json?.data?.accountId;

    const both = await call('GET', '/api/v1/restaurant-admin/payout-accounts', undefined, token);
    check('both are listed', both.json?.count === 2, `${both.json?.count}`);
    check('the active one is listed first', both.json?.data?.[0]?.accountId === accountA);
    check(
      'no account number appears anywhere in the list',
      !JSON.stringify(both.json || {}).includes(ACCOUNT_A)
        && !JSON.stringify(both.json || {}).includes(ACCOUNT_B),
    );

    /*
     * `payout` is what the rest of the platform reads — the staff approval
     * queue and the completeness tally both look at it, not at this array.
     * If activating stopped writing it, the array would say one thing and
     * the money would go somewhere else, silently.
     */
    const afterFirst = await FoodRestaurant.findOne({ restaurantId: mine.restaurantId })
      .select('+payout.bankAccountNumber');
    check(
      'saving the first account wrote it into `payout`, which is what pays',
      afterFirst.payout.bankAccountNumber === ACCOUNT_A,
      afterFirst.payout.accountLast4,
    );

    const switched = await call(
      'PATCH', `/api/v1/restaurant-admin/payout-accounts/${accountB}/activate`, {}, token,
    );
    check('switching the active account works', switched.status === 200, `got ${switched.status}`);
    check('…and reports that something changed', switched.json?.changed === true);

    const afterSwitch = await FoodRestaurant.findOne({ restaurantId: mine.restaurantId })
      .select('+payout.bankAccountNumber');
    check(
      'the switch moved `payout` too — the array and the money agree',
      afterSwitch.payout.bankAccountNumber === ACCOUNT_B
        && afterSwitch.payout.ifscCode === 'SBIN0005678',
      afterSwitch.payout.accountLast4,
    );

    const again = await call(
      'PATCH', `/api/v1/restaurant-admin/payout-accounts/${accountB}/activate`, {}, token,
    );
    check('activating the already-active account is a no-op, not a second write',
      again.status === 200 && again.json?.changed === false, `changed ${again.json?.changed}`);

    /* Removing the account being paid into, while another exists, would leave
       the platform paying an account the owner just disowned. */
    const removeActive = await call(
      'DELETE', `/api/v1/restaurant-admin/payout-accounts/${accountB}`, undefined, token,
    );
    check(
      'the ACTIVE account cannot be removed while another could take over',
      removeActive.status === 409 && removeActive.json?.code === 'ACCOUNT_IS_ACTIVE',
      `${removeActive.status} ${removeActive.json?.code}`,
    );

    const removeIdle = await call(
      'DELETE', `/api/v1/restaurant-admin/payout-accounts/${accountA}`, undefined, token,
    );
    check('an idle account can be removed', removeIdle.status === 200, `got ${removeIdle.status}`);

    const afterRemove = await call('GET', '/api/v1/restaurant-admin/payout-accounts', undefined, token);
    check('one account is left', afterRemove.json?.count === 1, `${afterRemove.json?.count}`);
    check('and it is still the active one', afterRemove.json?.data?.[0]?.isActive === true);

    /* THE narrow-exception assertion: the old door is still shut. */
    const oldWay = await call('PATCH', '/api/v1/restaurant-admin/me', {
      payout: { bankAccountNumber: '123456789012' },
    }, token);
    check(
      'PATCH /me still refuses `payout` — the exception is these routes only',
      oldWay.status === 403 && oldWay.json?.code === 'NEEDS_REVERIFICATION',
      `${oldWay.status} ${oldWay.json?.code}`,
    );

    /* One shop's accounts are not another's. */
    const theirToken = (await call('POST', '/api/v1/restaurant-admin/login', {
      identifier: OTHER.email, password: PASSWORD,
    })).json?.data?.token;
    const theirList = await call('GET', '/api/v1/restaurant-admin/payout-accounts', undefined, theirToken);
    check("another shop sees none of this shop's accounts", theirList.json?.count === 0,
      `${theirList.json?.count}`);
    const steal2 = await call(
      'PATCH', `/api/v1/restaurant-admin/payout-accounts/${accountB}/activate`, {}, theirToken,
    );
    check("another shop cannot activate this shop's account", steal2.status === 404, `got ${steal2.status}`);

    /* The backfill: a shop onboarded before this screen existed has a
       `payout` and no array, and must not be asked to type it again. */
    const legacy = await makeShop(
      { ...OWNER, phone: '+919876500104', email: 'verify-legacy@example.test' },
    );
    legacy.payout = {
      accountHolderName: 'Legacy Owner', bankAccountNumber: '555444333222',
      accountLast4: '3222', ifscCode: 'ICIC0009999', accountType: 'current', upiId: '',
    };
    await legacy.save();
    const legacyToken = (await call('POST', '/api/v1/restaurant-admin/login', {
      identifier: 'verify-legacy@example.test', password: PASSWORD,
    })).json?.data?.token;
    const backfilled = await call('GET', '/api/v1/restaurant-admin/payout-accounts', undefined, legacyToken);
    check(
      'an older shop’s existing payout becomes its first saved account',
      backfilled.json?.count === 1 && backfilled.json?.data?.[0]?.accountLast4 === '3222',
      `${backfilled.json?.count} / ${backfilled.json?.data?.[0]?.accountLast4}`,
    );
    check('…marked active, because it is the one being paid',
      backfilled.json?.data?.[0]?.isActive === true);
    check(
      '…and the backfill did not leak the number either',
      !JSON.stringify(backfilled.json || {}).includes('555444333222'),
    );

    /* A shop with a HALF-filled payout (IFSC, no number) must not be given a
       phantom account nobody could be paid through. */
    const halfShop = await makeShop(
      { ...OWNER, phone: '+919876500105', email: 'verify-half@example.test' },
    );
    halfShop.payout = {
      accountHolderName: 'Half Owner', bankAccountNumber: '', accountLast4: '',
      ifscCode: 'ICIC0009999', accountType: 'current', upiId: '',
    };
    await halfShop.save();
    const halfToken = (await call('POST', '/api/v1/restaurant-admin/login', {
      identifier: 'verify-half@example.test', password: PASSWORD,
    })).json?.data?.token;
    const half = await call('GET', '/api/v1/restaurant-admin/payout-accounts', undefined, halfToken);
    check('a half-filled payout is NOT backfilled into a phantom account',
      half.json?.count === 0, `${half.json?.count}`);

    /* And the routes are behind the same guard as everything else. */
    const anonPayout = await call('GET', '/api/v1/restaurant-admin/payout-accounts');
    check('/payout-accounts needs a session', anonPayout.status === 401, `got ${anonPayout.status}`);
    const appTokenPayout = await call(
      'GET', '/api/v1/restaurant-admin/payout-accounts', undefined, mobileToken,
    );
    check("/payout-accounts refuses the app's token", appTokenPayout.status === 401,
      `got ${appTokenPayout.status}`);

    /* ── Requesting a payout ──────────────────────────────────────────── */

    /*
     * The shop currently has three delivered orders worth ₹595 in total:
     *
     *   ₹200 food, paid online, delivered      → payable  (we hold it)
     *   ₹100 food, cash, delivered             → payable  (the rider holds it)
     *   ₹400 food, cash, PICKED UP at counter  → NOT payable
     *
     * That third one is the rule worth testing. The diner paid the
     * restaurant's own till; paying `partnerPayout` on it would hand the
     * kitchen the same money twice. ₹170 + ₹85 = ₹255 is payable, and the
     * ₹340 from the counter order is reported separately so the owner can
     * see why their earnings and their balance differ.
     */
    const bal = await call('GET', '/api/v1/restaurant-admin/payouts', undefined, token);
    check('GET /payouts → 200', bal.status === 200, `got ${bal.status}`);
    check(
      'the balance excludes cash collected at the counter',
      bal.json?.data?.balance?.available === 255,
      `available ${bal.json?.data?.balance?.available} — 595 would mean the pickup order was counted`,
    );
    check(
      '…and says how much that was, rather than silently dropping it',
      bal.json?.data?.balance?.collectedByYou === 340,
      `${bal.json?.data?.balance?.collectedByYou}`,
    );
    check('nothing has been requested yet', bal.json?.data?.history?.length === 0);

    /*
     * THE test. Two presses at the same instant.
     *
     * Without the claim being a scoped write, both would read the same three
     * orders and both would create a payout for ₹255 — ₹510 owed on ₹255 of
     * trade, and nothing in any log to show why.
     */
    const [raceA, raceB] = await Promise.all([
      call('POST', '/api/v1/restaurant-admin/payouts/request', {}, token),
      call('POST', '/api/v1/restaurant-admin/payouts/request', {}, token),
    ]);
    const won = [raceA, raceB].filter((r) => r.status === 201);
    const lost = [raceA, raceB].filter((r) => r.status !== 201);
    check(
      'two simultaneous requests create exactly ONE payout',
      won.length === 1,
      `${won.length} created, ${lost.length} refused`,
    );
    check('…and the other is refused, not silently dropped', lost.length === 1
      && [409, 429].includes(lost[0].status), `got ${lost[0]?.status}`);

    const payoutId = won[0]?.json?.data?.payoutId;
    check('the payout claims the whole payable balance', won[0]?.json?.data?.amount === 255,
      `${won[0]?.json?.data?.amount}`);
    check('…across the two payable orders only', won[0]?.json?.data?.orderCount === 2,
      `${won[0]?.json?.data?.orderCount}`);
    check(
      'it records which account it is going to',
      won[0]?.json?.data?.account?.accountLast4 === '7666',
      won[0]?.json?.data?.account?.accountLast4,
    );

    /* Belt and braces on the race: count the rows, not the responses. */
    const rowCount = await FoodPayout.countDocuments({ restaurantId: mine.restaurantId });
    check('exactly one payout row exists in the database', rowCount === 1, `${rowCount} rows`);

    const afterRequest = await call('GET', '/api/v1/restaurant-admin/payouts', undefined, token);
    check('the balance is now zero — the money is claimed',
      afterRequest.json?.data?.balance?.available === 0,
      `${afterRequest.json?.data?.balance?.available}`);
    check('…and shows as pending instead, so it has not simply vanished',
      afterRequest.json?.data?.balance?.pending === 255,
      `${afterRequest.json?.data?.balance?.pending}`);

    const whileOpen = await call('POST', '/api/v1/restaurant-admin/payouts/request', {}, token);
    check('a second request while one is open is refused',
      whileOpen.status === 409 && whileOpen.json?.code === 'REQUEST_ALREADY_OPEN',
      `${whileOpen.status} ${whileOpen.json?.code}`);

    /* ── The staff side ───────────────────────────────────────────────── */

    const staff = await makeAdmin('Super Admin');
    const staffToken = signAdminToken(staff);
    const viewer = await makeAdmin('Viewer');
    const viewerToken = signAdminToken(viewer);

    const queue = await call('GET', '/api/v1/admin/food-payouts', undefined, staffToken);
    check('staff see the request in their queue', queue.status === 200
      && queue.json?.data?.some((row) => row.payoutId === payoutId), `got ${queue.status}`);
    check('the queue totals what is owed', queue.json?.owed === 255, `${queue.json?.owed}`);

    const viewerRead = await call('GET', '/api/v1/admin/food-payouts', undefined, viewerToken);
    check('any administrator may READ the queue', viewerRead.status === 200, `got ${viewerRead.status}`);

    const viewerPay = await call(
      'POST', `/api/v1/admin/food-payouts/${payoutId}/paid`, { reference: 'X' }, viewerToken,
    );
    check('a Viewer may NOT mark one paid', viewerPay.status === 403, `got ${viewerPay.status}`);

    const ownerPay = await call(
      'POST', `/api/v1/admin/food-payouts/${payoutId}/paid`, { reference: 'X' }, token,
    );
    check("a restaurant's own token cannot reach the staff queue", ownerPay.status === 401,
      `got ${ownerPay.status}`);

    const noRef = await call(
      'POST', `/api/v1/admin/food-payouts/${payoutId}/paid`, {}, staffToken,
    );
    check('marking paid without a bank reference is refused', noRef.status === 400,
      `got ${noRef.status}`);

    const paid = await call(
      'POST', `/api/v1/admin/food-payouts/${payoutId}/paid`,
      { reference: 'UTR123456789' }, staffToken,
    );
    check('a Super Admin can mark it paid', paid.status === 200, `got ${paid.status}`);
    check('the reference is kept', paid.json?.data?.reference === 'UTR123456789');
    check('who paid it is kept', paid.json?.data?.paidByAdminName === staff.name,
      paid.json?.data?.paidByAdminName);

    const twice = await call(
      'POST', `/api/v1/admin/food-payouts/${payoutId}/paid`,
      { reference: 'UTR999' }, staffToken,
    );
    check('it cannot be marked paid twice', twice.status === 409
      && twice.json?.code === 'ALREADY_SETTLED', `${twice.status} ${twice.json?.code}`);

    /* The orders stay claimed after payment. Releasing them would put money
       that HAS been sent back into the shop's balance. */
    const afterPaid = await call('GET', '/api/v1/restaurant-admin/payouts', undefined, token);
    check('paid money does NOT return to the balance',
      afterPaid.json?.data?.balance?.available === 0,
      `${afterPaid.json?.data?.balance?.available}`);
    check('…and nothing is left pending', afterPaid.json?.data?.balance?.pending === 0,
      `${afterPaid.json?.data?.balance?.pending}`);
    check('the owner sees it as paid, with the reference',
      afterPaid.json?.data?.history?.[0]?.status === 'paid'
      && afterPaid.json?.data?.history?.[0]?.reference === 'UTR123456789');

    /* ── A refused request gives the money back ───────────────────────── */

    await makeOrder(mine, { status: 'delivered', items: 1000, paymentMode: 'online', dish: 'Feast' });
    const afterSettle = await call('POST', '/api/v1/restaurant-admin/payouts/request', {}, token);
    check('a new request can be made once the last is settled', afterSettle.status === 201,
      `got ${afterSettle.status}`);
    const rejectId = afterSettle.json?.data?.payoutId;
    check('it is worth the new order only', afterSettle.json?.data?.amount === 850,
      `${afterSettle.json?.data?.amount}`);

    const noReason = await call(
      'POST', `/api/v1/admin/food-payouts/${rejectId}/reject`, {}, staffToken,
    );
    check('refusing without a reason is refused', noReason.status === 400, `got ${noReason.status}`);

    const refusal = await call(
      'POST', `/api/v1/admin/food-payouts/${rejectId}/reject`,
      { reason: 'Bank details need checking.' }, staffToken,
    );
    check('a Super Admin can refuse a request', refusal.status === 200, `got ${refusal.status}`);

    /* The bug on the other side of the one above: money claimed by a refused
       request must not stay claimed, or it disappears for ever. */
    const afterReject = await call('GET', '/api/v1/restaurant-admin/payouts', undefined, token);
    check(
      'a refused request gives the money BACK to the balance',
      afterReject.json?.data?.balance?.available === 850,
      `${afterReject.json?.data?.balance?.available} — 0 would mean it was lost`,
    );
    check('the owner is shown why', afterReject.json?.data?.history?.[0]?.rejectionReason
      === 'Bank details need checking.');

    /*
     * The backfill must SURVIVE a request made before the accounts screen
     * was ever opened.
     *
     * The bug this catches: backfilling in memory, writing the snapshot onto
     * the payout row, and never saving the array — so the accounts screen
     * later backfills again with a DIFFERENT accountId and the payout points
     * at an account that never existed. Found live, and invisible until
     * somebody reconciles a transfer.
     */
    const freshShop = await makeShop(
      { ...OWNER, phone: '+919876500106', email: 'verify-backfill-payout@example.test' },
    );
    freshShop.payout = {
      accountHolderName: 'Backfill Owner', bankAccountNumber: '111222333444',
      accountLast4: '3444', ifscCode: 'HDFC0002222', accountType: 'current', upiId: '',
    };
    await freshShop.save();
    await makeOrder(freshShop, { status: 'delivered', items: 500, paymentMode: 'online' });

    const freshToken = (await call('POST', '/api/v1/restaurant-admin/login', {
      identifier: 'verify-backfill-payout@example.test', password: PASSWORD,
    })).json?.data?.token;

    /* The very first thing this shop does is ask for money. */
    const firstAsk = await call('POST', '/api/v1/restaurant-admin/payouts/request', {}, freshToken);
    check('a shop can request before ever opening the accounts screen',
      firstAsk.status === 201, `got ${firstAsk.status}`);
    const snapshotId = firstAsk.json?.data?.account?.accountId;
    check('the payout names an account', Boolean(snapshotId), String(snapshotId));

    const nowSaved = await call(
      'GET', '/api/v1/restaurant-admin/payout-accounts', undefined, freshToken,
    );
    check('…and that account was actually SAVED, not just computed',
      nowSaved.json?.count === 1, `${nowSaved.json?.count} saved`);
    check(
      '…with the same id the payout points at — no dangling reference',
      nowSaved.json?.data?.[0]?.accountId === snapshotId,
      `${nowSaved.json?.data?.[0]?.accountId} vs ${snapshotId}`,
    );

    /* ── Nothing to pay out ───────────────────────────────────────────── */

    const brokeToken = (await call('POST', '/api/v1/restaurant-admin/login', {
      identifier: OTHER.email, password: PASSWORD,
    })).json?.data?.token;
    const nothing = await call('POST', '/api/v1/restaurant-admin/payouts/request', {}, brokeToken);
    check(
      'a shop with no payable orders is told so, not given an empty payout',
      [409].includes(nothing.status),
      `got ${nothing.status} ${nothing.json?.code}`,
    );
    const strayRows = await FoodPayout.countDocuments({ restaurantId: theirs.restaurantId });
    check('…and no empty row is left behind', strayRows === 0, `${strayRows} rows`);

    /* ── The v1/v2 split is deliberate ────────────────────────────────── */

    const v2 = await call('POST', '/api/v2/restaurant-admin/login', {
      identifier: OWNER.email, password: PASSWORD,
    });
    check('/api/v2/restaurant-admin stays 404', v2.status === 404, `got ${v2.status}`);
  } finally {
    server.close();
    await closeConnections().catch(() => {});
    await mongo.stop().catch(() => {});
  }

  const failed = results.filter(([ok]) => !ok);
  console.log('');
  results.forEach(([ok, name, extra]) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && extra ? `  — ${extra}` : ''}`);
  });
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error('\nverify:restaurant-admin blew up:', error);
  process.exit(2);
});
