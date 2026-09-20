/* ══════════════════════════════════════════════════════════════════════════
   The Restaurant Admin console — the handlers that are its own.

   This file holds the handlers the mobile app does not already have:

     login     issues a `restaurant_admin` session rather than a
               `foodpartner` one. It has to be new: a different token type is
               the whole point, and nothing existing can be persuaded to mint
               one.
     summary   the console's opening screen. A browser has room for a figure
               the phone's dashboard never showed — how the day is going —
               and answering it from the client would mean pulling the day's
               orders across the wire to add them up.
     analytics the shape of the trade over a period: revenue by day, the
               dishes that sell, the hours that are busy, how orders end.
     earnings  what the shop has earned and what came off the top, order by
               order. See its own header on what it does NOT claim.
     payout    the owner's saved bank accounts, and which one the money goes
               to. Its own section below says what it deliberately does not
               protect.
     payouts   the balance, the "request a payout" press, and the history of
               what was asked for. The balance rule lives in
               `foodPayout.service.js`, shared with the staff queue.

   Everything else this console does — list orders, read one, move one
   forward, and the five menu handlers — is NOT here, on purpose. Those are
   the same decisions the kitchen tablet makes, they are already written in
   `foodOrder.controller.js` and `foodMenu.controller.js`, and the important
   half of them is not the database write but what follows it: accepting an
   order starts the rider search, rejecting one cancels the dispatch, frees a
   stranded rider, flags prepaid money as owed back and notifies the diner,
   marking food ready re-broadcasts an order nobody took. A second copy of
   that chain, reached only from the web, would drift from the first the day
   somebody fixed one of them — and the failure would be silent: an order
   accepted with no rider ever summoned looks exactly like an order accepted.

   So `restaurantAdmin.routes.js` mounts those handlers directly, and
   `restaurantAdmin.middleware.js` sets `req.foodPartner` so they run
   unchanged. Separate routes, separate guard, separate token, one set of
   rules. The middleware's header is where that decision is written down.

   ## Credentials are shared with the app, deliberately

   There is no second password and no second account. An owner has one set of
   credentials in `food_restaurants`, and this route verifies them exactly as
   `foodPartner.controller.js` does — same one-sentence refusal for "no such
   account" and "wrong password", same rejected-account branch. What differs
   is the token that comes out of it.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const FoodRestaurant = require('./foodRestaurant.model');
const FoodProduct = require('./foodProduct.model');
const FoodOrder = require('./foodOrder.model');
const FoodPayout = require('./foodPayout.model');
const payouts = require('./foodPayout.service');
const { normalisePhone } = require('./foodPartner.util');
const { logLogin, logError, logPayoutChange } = require('./foodPartner.log');
const { signRestaurantAdminToken } = require('./restaurantAdmin.middleware');

const { phoneKey, isOpenNow, makePayoutAccountId } = FoodRestaurant;

const fail = (res, status, code, message, extra = {}) => res.status(status).json({
  success: false, code, message, error: message, ...extra,
});

const dbDown = (res) => fail(
  res, 503, 'DB_DISCONNECTED',
  'The server is running but not connected to the database.',
);

const authNotConfigured = (res) => fail(
  res, 503, 'AUTH_NOT_CONFIGURED', 'Sign-in is unavailable right now.',
);

const isUp = () => mongoose.connection.readyState === 1;

/* ONE sentence for "no such account" and for "wrong password", copied in
   substance from the app's login for the reason given there: two would make
   this endpoint an oracle for which numbers and addresses are registered with
   Lampose, which is a list worth having and not one we hand out at a login
   screen. */
const WRONG_CREDENTIALS = 'That email or phone number and password do not match.';

/* ══════════════════════════════════════════════════════════════════════════
   Sign in
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * @route   POST /api/v1/restaurant-admin/login
 * @desc    Email-or-phone plus password → a `restaurant_admin` console session
 * @access  Public (rate-limited in the routes file)
 */
const login = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);
    if (!config.auth.configured) return authNotConfigured(res);

    const body = req.body || {};
    const identifier = String(
      body.identifier || body.email || body.ownerEmail || body.phone || body.ownerPhone || '',
    ).trim();
    const password = String(body.password || '');

    /* A malformed identifier is a 400 rather than the generic refusal: it
       depends on nothing stored, so it leaks nothing, and "enter your email
       or phone number" is more use than "those do not match". */
    if (!identifier || !password) {
      return fail(
        res, 400, 'MISSING_CREDENTIALS',
        'Enter your email address or phone number, and your password.',
      );
    }

    /* One field, two kinds of value — the console has one box and the owner
       types whichever they remember. An `@` decides; a number is matched on
       its last ten digits, because the number typed today is not necessarily
       spelled the way it was typed on the day they applied. */
    let query = null;
    if (identifier.includes('@')) {
      query = { ownerEmail: identifier.toLowerCase() };
    } else {
      const key = phoneKey(normalisePhone(identifier));
      if (key) query = { phoneKey: key };
    }

    if (!query) {
      return fail(
        res, 400, 'BAD_IDENTIFIER',
        'Enter the email address or the phone number you registered with.',
      );
    }

    /* `passwordHash` is `select: false` everywhere else, and `toJSON` deletes
       it again before this document is serialised below. */
    const restaurant = await FoodRestaurant.findOne(query).select('+passwordHash');

    const ok = restaurant ? await restaurant.verifyPassword(password) : false;
    if (!ok) {
      logLogin({
        identifier,
        ok: false,
        reason: restaurant ? 'the password did not match' : 'no account for that identifier',
        code: 'INVALID_CREDENTIALS',
        surface: 'restaurant-admin console',
      });
      return fail(res, 401, 'INVALID_CREDENTIALS', WRONG_CREDENTIALS);
    }

    /* A rejected owner is refused HERE rather than handed a session that
       `requireRestaurantAdmin` throws out on the very next call. The loop that
       would otherwise produce — sign in, get a token, be thrown out, return to
       the sign-in screen — is the one the support call opens with: "it just
       logs me out". Pending and closed accounts sign in normally: the days
       before approval are exactly when an owner types their menu. */
    if (restaurant.verificationStatus === 'rejected') {
      const message = restaurant.verificationNote
        ? `This application was not approved: ${restaurant.verificationNote}`
        : 'This application was not approved. Please contact Lampose.';
      logLogin({
        identifier,
        ok: false,
        reason: 'the application was rejected',
        code: 'ACCOUNT_REJECTED',
        restaurantId: restaurant.restaurantId,
        surface: 'restaurant-admin console',
      });
      return fail(res, 403, 'ACCOUNT_REJECTED', message, {
        data: {
          verificationStatus: restaurant.verificationStatus,
          verificationNote: restaurant.verificationNote || '',
        },
      });
    }

    const token = signRestaurantAdminToken(restaurant);
    if (!token) return authNotConfigured(res);

    logLogin({
      identifier,
      ok: true,
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.restaurantName,
      verificationStatus: restaurant.verificationStatus,
      surface: 'restaurant-admin console',
    });

    /* The console stores the token and this profile, and renders its header
       and its nav from them. Shaped rather than handed the whole document:
       the console needs a name, an id and a status, and a login response is
       not the place to ship a restaurant's entire record into `localStorage`.
       `GET /me` returns the full document for the screens that need it. */
    return res.json({
      success: true,
      message: 'Signed in.',
      data: {
        token,
        restaurant: {
          restaurantId: restaurant.restaurantId,
          restaurantName: restaurant.restaurantName,
          ownerName: restaurant.ownerName || '',
          ownerEmail: restaurant.ownerEmail || '',
          ownerPhone: restaurant.ownerPhone || '',
          logoUrl: (restaurant.logoImage && restaurant.logoImage.url) || '',
          verificationStatus: restaurant.verificationStatus,
          isActive: Boolean(restaurant.isActive),
          openState: restaurant.openState,
          isCurrentlyOpen: isOpenNow(restaurant),
        },
      },
    });
  } catch (error) {
    logError('restaurant-admin sign-in failed', error);
    return next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   The day, at a glance
   ══════════════════════════════════════════════════════════════════════════ */

/** Midnight this morning, in the server's timezone — where "today" starts. */
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * The rows a kitchen may see.
 *
 * The SAME predicate `foodOrder.controller.js` lists by, repeated here rather
 * than imported because that file does not export it — and it matters that
 * they agree: an unpaid online order is invisible in the queue (the diner
 * abandoned the UPI screen and is not coming back), so counting it on the
 * dashboard would put a number on the opening screen that the orders page
 * then refuses to show. If that file ever exports the predicate, this should
 * read it from there instead.
 */
const visibleToKitchen = (restaurantId) => ({
  restaurantId,
  $or: [
    { paymentMode: 'cod' },
    { paymentStatus: { $in: ['paid', 'refunded'] } },
  ],
});

/**
 * @route   GET /api/v1/restaurant-admin/summary
 * @desc    The console's opening screen: what needs a person right now, and
 *          how the day has gone.
 * @access  Restaurant Admin session
 *
 * Three aggregations and two counts, all on indexed fields
 * (`restaurantId + status + placedAt` is a compound index on the model), so
 * this is one cheap round trip rather than the day's orders dragged across
 * the wire to be added up in a browser.
 *
 * `earnings` is `partnerPayout`, not `grandTotal` — what the kitchen is owed
 * once commission comes off, which is the number an owner opens this screen
 * to see. It is summed over DELIVERED orders only: money is earned when the
 * food arrives, and counting an order that is still being cooked would show a
 * figure that goes DOWN when one is later rejected.
 */
const summary = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const restaurant = req.restaurantAdmin;
    const { restaurantId } = restaurant;
    const since = startOfToday();
    const visible = visibleToKitchen(restaurantId);

    const [liveGrouped, todayGrouped, todayEarnings, menuTotal, menuOutOfStock] = await Promise.all([
      /* Every open order by status — the live queue's tab badges. */
      FoodOrder.aggregate([
        { $match: visible },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      /* Today's orders by status — how the day has gone. */
      FoodOrder.aggregate([
        { $match: { ...visible, placedAt: { $gte: since } } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      FoodOrder.aggregate([
        { $match: { ...visible, status: 'delivered', placedAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            payout: { $sum: '$partnerPayout' },
            gross: { $sum: '$grandTotal' },
            orders: { $sum: 1 },
          },
        },
      ]),
      FoodProduct.countDocuments({ restaurantId }),
      FoodProduct.countDocuments({ restaurantId, isAvailable: false }),
    ]);

    const tally = (rows) => rows.reduce((acc, row) => ({ ...acc, [row._id]: row.n }), {});
    const live = tally(liveGrouped);
    const today = tally(todayGrouped);
    const earned = todayEarnings[0] || { payout: 0, gross: 0, orders: 0 };

    const at = (counts, ...states) => states.reduce((n, s) => n + (counts[s] || 0), 0);

    return res.json({
      success: true,
      data: {
        restaurant: {
          restaurantId,
          restaurantName: restaurant.restaurantName,
          logoUrl: (restaurant.logoImage && restaurant.logoImage.url) || '',
          verificationStatus: restaurant.verificationStatus,
          isActive: Boolean(restaurant.isActive),
          openState: restaurant.openState,
          /* Derived rather than stored — the schedule decides it. See the
             model. It is what the header of every screen reads. */
          isCurrentlyOpen: isOpenNow(restaurant),
        },
        /* What needs a person RIGHT NOW, across all time rather than today:
           an order placed at 11pm and never answered is still waiting at
           1am, and a dashboard that reset at midnight would hide it. */
        live: {
          newOrders: at(live, 'placed'),
          inKitchen: at(live, 'accepted', 'preparing'),
          awaitingPickup: at(live, 'ready'),
          onTheWay: at(live, 'picked_up'),
          byStatus: live,
        },
        today: {
          placed: Object.values(today).reduce((n, v) => n + v, 0),
          delivered: at(today, 'delivered'),
          rejected: at(today, 'rejected'),
          cancelled: at(today, 'cancelled'),
          byStatus: today,
          /* Both figures, because they answer different questions: `gross` is
             what diners paid, `earnings` is what reaches the kitchen. Showing
             only the first would overstate the day by the commission. */
          gross: earned.gross || 0,
          earnings: earned.payout || 0,
          /* The rate the CONTRACT was signed at, which is the one an owner
             recognises. Each delivered order also stores the rate it settled
             at (`foodOrder.commissionRate`), because a renegotiation must not
             rewrite history — `earnings` above is summed from those stored
             payouts rather than recomputed from this. */
          commissionRate: (restaurant.contract && restaurant.contract.commission) || 0,
        },
        menu: {
          total: menuTotal,
          outOfStock: menuOutOfStock,
          available: menuTotal - menuOutOfStock,
        },
        since: since.toISOString(),
      },
    });
  } catch (error) {
    logError('restaurant-admin/summary', error);
    return next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   Analytics — the shape of the trade

   A browser is the first surface with room to ask "how is this restaurant
   doing" rather than "what is happening right now", so this is new work
   rather than a second reading of `summary`.

   Six aggregations, all on `restaurantId + placedAt` or
   `restaurantId + status + placedAt`, both of which are compound indexes on
   the model. The alternative — sending a month of orders to a browser to be
   grouped there — is the same answer computed slower, over a wire, on a
   laptop in a shop office.

   ## Revenue here means PAYOUT, and only from delivered orders

   The same rule `summary` uses and for the same reason: money is earned when
   the food arrives. A chart that counted orders still being cooked would
   redraw downward when one was refused, and a figure that moves backwards is
   one nobody checks twice. `gross` travels beside it so the commission is
   visible rather than merely subtracted.

   ## The buckets are built here, not in the browser

   A period with no trade on the Tuesday must still HAVE a Tuesday, or the
   column chart closes the gap and a quiet day reads as a day that did not
   happen. Mongo returns only the buckets that have rows, so the full run of
   dates — and all twenty-four hours — is filled in below.
   ══════════════════════════════════════════════════════════════════════════ */

/** `YYYY-MM-DD` in the server's timezone, matching what `$dateToString`
 *  produces below — one spelling of a date rather than two. */
const dayKey = (date) => {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const MAX_DAYS = 365;
const DEFAULT_DAYS = 30;

/**
 * @route   GET /api/v1/restaurant-admin/analytics?days=30
 * @access  Restaurant Admin session
 */
const analytics = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const { restaurantId } = req.restaurantAdmin;

    const asked = Number(req.query.days);
    const days = Math.min(
      Math.max(Number.isFinite(asked) && asked > 0 ? Math.trunc(asked) : DEFAULT_DAYS, 1),
      MAX_DAYS,
    );

    const since = startOfToday();
    since.setDate(since.getDate() - (days - 1));

    const visible = visibleToKitchen(restaurantId);
    const inPeriod = { ...visible, placedAt: { $gte: since } };
    /* Delivered only, for every money figure. See the header. */
    const earnedInPeriod = { ...inPeriod, status: 'delivered' };

    const [byDay, byStatus, byHour, topDishes, byPayment, totals] = await Promise.all([
      FoodOrder.aggregate([
        { $match: inPeriod },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } },
            orders: { $sum: 1 },
            delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
            earnings: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$partnerPayout', 0] } },
            gross: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$grandTotal', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      FoodOrder.aggregate([
        { $match: inPeriod },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),

      FoodOrder.aggregate([
        { $match: inPeriod },
        { $group: { _id: { $hour: '$placedAt' }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),

      /* Per DISH, across every delivered order in the period. `$unwind` on
         `lines` is what makes a dish rather than an order the unit. Both
         figures are kept: the dish that sells most often and the dish that
         earns most are frequently not the same one, and an owner deciding
         what to drop needs to see that. */
      FoodOrder.aggregate([
        { $match: earnedInPeriod },
        { $unwind: '$lines' },
        {
          $group: {
            _id: '$lines.productName',
            quantity: { $sum: '$lines.quantity' },
            revenue: { $sum: '$lines.lineTotal' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 10 },
      ]),

      /* How diners paid. Not decoration: an online order was paid to Lampose
         and a cash one was collected at the door, and the two settle
         differently — see the `earnings` route below. */
      FoodOrder.aggregate([
        { $match: earnedInPeriod },
        {
          $group: {
            _id: { $cond: [{ $eq: ['$paymentMode', 'cod'] }, 'cash', 'online'] },
            orders: { $sum: 1 },
            earnings: { $sum: '$partnerPayout' },
          },
        },
      ]),

      FoodOrder.aggregate([
        { $match: earnedInPeriod },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            earnings: { $sum: '$partnerPayout' },
            gross: { $sum: '$grandTotal' },
            items: { $sum: '$itemsTotal' },
          },
        },
      ]),
    ]);

    /* Every day in the window, including the empty ones — see the header. */
    const seen = byDay.reduce((acc, row) => ({ ...acc, [row._id]: row }), {});
    const series = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = dayKey(d);
      const row = seen[key];
      series.push({
        date: key,
        orders: row ? row.orders : 0,
        delivered: row ? row.delivered : 0,
        earnings: row ? row.earnings : 0,
        gross: row ? row.gross : 0,
      });
    }

    /* All twenty-four, for the same reason the days are all present: a chart
       of trading hours with the quiet ones missing cannot be read against a
       clock. */
    const hourSeen = byHour.reduce((acc, row) => ({ ...acc, [row._id]: row.n }), {});
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: hourSeen[hour] || 0 }));

    const status = byStatus.reduce((acc, row) => ({ ...acc, [row._id]: row.n }), {});
    const placed = Object.values(status).reduce((n, v) => n + v, 0);
    const delivered = status.delivered || 0;
    const concluded = delivered + (status.rejected || 0) + (status.cancelled || 0);

    const payment = byPayment.reduce(
      (acc, row) => ({ ...acc, [row._id]: { orders: row.orders, earnings: row.earnings } }),
      {},
    );

    const sum = totals[0] || { orders: 0, earnings: 0, gross: 0, items: 0 };

    return res.json({
      success: true,
      data: {
        days,
        since: since.toISOString(),
        series,
        hours,
        status,
        totals: {
          placed,
          delivered,
          orders: sum.orders,
          earnings: sum.earnings || 0,
          gross: sum.gross || 0,
          items: sum.items || 0,
          /* What a delivered order is worth to the KITCHEN on average — the
             figure an owner compares against their cost per dish. `null`
             rather than 0 when nothing was delivered: "no orders" and "an
             average of nothing" are different statements, and only one of
             them is true. */
          averageOrder: sum.orders ? sum.earnings / sum.orders : null,
          /* Of the orders that reached a CONCLUSION. Orders still in the
             kitchen are left out of the denominator — counting them as
             failures would mean this rate fell every time trade picked up.
             `null` when nothing has concluded yet. */
          fulfilmentRate: concluded ? delivered / concluded : null,
        },
        topDishes: topDishes.map((row) => ({
          productName: row._id,
          quantity: row.quantity,
          revenue: row.revenue,
          orders: row.orders,
        })),
        payment: {
          cash: payment.cash || { orders: 0, earnings: 0 },
          online: payment.online || { orders: 0, earnings: 0 },
        },
      },
    });
  } catch (error) {
    logError('restaurant-admin/analytics', error);
    return next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   Earnings — what the shop has made, order by order

   ## What this is NOT

   It is not a payout statement, and the route is called `earnings` rather
   than `payouts` so that nothing downstream can mistake it for one.

   There is no food settlement ledger in this system. Nothing anywhere
   records that a restaurant was actually paid: no `food_settlements`
   collection, no `payoutStatus` on an order, no transfer reference. The STAY
   side has one — `partner_payouts`, dispatched through RazorpayX from
   `partnerPayout.admin.routes.js` — and the food side does not.

   So this answers the question it can answer truthfully: what has this
   kitchen EARNED, what came off the top, and which orders make up the
   figure. It deliberately never says "paid" or "pending", because this
   server does not know, and a screen that guessed would be read as a
   statement of account by the one person who cannot check it.

   ## Why cash and online are separated rather than summed

   They are owed in opposite directions, and netting them hides that.

     online  the diner paid Lampose. Lampose owes the kitchen `partnerPayout`.
     cash    a rider collected `grandTotal` at the door on a delivery, or the
             diner paid the counter on a pickup. Who is holding that money
             depends on which, so the two are reported apart and the
             delivery/pickup split is given with them.

   One net number would be arithmetic nobody could check against anything.
   ══════════════════════════════════════════════════════════════════════════ */

const LEDGER_LIMIT = 200;

/**
 * @route   GET /api/v1/restaurant-admin/earnings?from=&to=
 * @access  Restaurant Admin session
 */
const earnings = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const { restaurantId } = req.restaurantAdmin;

    /* A date that cannot be read is a 400 rather than a silent fallback to
       "everything": a statement covering a period nobody asked for is worse
       than an error, because it looks right. */
    const readDate = (value, fallback) => {
      if (value === undefined || value === null || String(value).trim() === '') return fallback;
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const defaultFrom = startOfToday();
    defaultFrom.setDate(defaultFrom.getDate() - 29);

    const from = readDate(req.query.from, defaultFrom);
    const toRaw = readDate(req.query.to, new Date());
    if (!from || !toRaw) {
      return fail(res, 400, 'BAD_RANGE', 'Those dates could not be read. Use YYYY-MM-DD.');
    }
    /* Inclusive of the whole day somebody named — a range ending "today" that
       stopped at midnight would omit today's trade. */
    const to = new Date(toRaw);
    to.setHours(23, 59, 59, 999);

    if (from > to) {
      return fail(res, 400, 'BAD_RANGE', 'The start of the period is after its end.');
    }

    const match = {
      ...visibleToKitchen(restaurantId),
      status: 'delivered',
      placedAt: { $gte: from, $lte: to },
    };

    const [rows, split, totals] = await Promise.all([
      FoodOrder.find(match)
        .sort({ placedAt: -1 })
        .limit(LEDGER_LIMIT)
        .select('orderNumber placedAt itemsTotal deliveryFee packagingCharge grandTotal partnerPayout commissionRate paymentMode paymentStatus fulfilment')
        .lean(),

      FoodOrder.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              paidBy: { $cond: [{ $eq: ['$paymentMode', 'cod'] }, 'cash', 'online'] },
              fulfilment: '$fulfilment',
            },
            orders: { $sum: 1 },
            earnings: { $sum: '$partnerPayout' },
            collected: { $sum: '$grandTotal' },
          },
        },
      ]),

      FoodOrder.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            items: { $sum: '$itemsTotal' },
            gross: { $sum: '$grandTotal' },
            earnings: { $sum: '$partnerPayout' },
          },
        },
      ]),
    ]);

    const sum = totals[0] || { orders: 0, items: 0, gross: 0, earnings: 0 };

    /* Commission is charged on the ITEMS, not on the bill — the delivery fee
       and the packaging charge are not the kitchen's revenue and are not
       commissioned (see `foodCustomerOrder.controller.js`, which computes
       `partnerPayout` from `itemsTotal`). Derived from the two STORED figures
       rather than recomputed from a rate, because a renegotiated rate must
       not rewrite what an old order actually settled at. */
    const commission = Math.max(0, (sum.items || 0) - (sum.earnings || 0));

    const bucket = (paidBy) => split
      .filter((row) => row._id.paidBy === paidBy)
      .reduce(
        (acc, row) => ({
          orders: acc.orders + row.orders,
          earnings: acc.earnings + row.earnings,
          collected: acc.collected + row.collected,
          delivery: acc.delivery + (row._id.fulfilment === 'pickup' ? 0 : row.orders),
          pickup: acc.pickup + (row._id.fulfilment === 'pickup' ? row.orders : 0),
        }),
        { orders: 0, earnings: 0, collected: 0, delivery: 0, pickup: 0 },
      );

    return res.json({
      success: true,
      data: {
        from: from.toISOString(),
        to: to.toISOString(),
        totals: {
          orders: sum.orders,
          /* The kitchen's own revenue, before commission. */
          items: sum.items || 0,
          /* What diners paid in total, fees included. */
          gross: sum.gross || 0,
          commission,
          earnings: sum.earnings || 0,
          effectiveRate: sum.items ? (commission / sum.items) * 100 : null,
        },
        /* Reported apart, never netted — see the header. */
        paidBy: { online: bucket('online'), cash: bucket('cash') },
        ledger: rows.map((row) => ({
          orderNumber: row.orderNumber,
          placedAt: row.placedAt,
          itemsTotal: row.itemsTotal,
          deliveryFee: row.deliveryFee,
          packagingCharge: row.packagingCharge,
          grandTotal: row.grandTotal,
          partnerPayout: row.partnerPayout,
          commissionRate: row.commissionRate,
          commission: Math.max(0, (row.itemsTotal || 0) - (row.partnerPayout || 0)),
          paidBy: row.paymentMode === 'cod' ? 'cash' : 'online',
          fulfilment: row.fulfilment || 'delivery',
        })),
        /* Capped, and the caller is TOLD it is capped rather than left to
           notice that a long period's total does not match its rows. */
        ledgerLimit: LEDGER_LIMIT,
        ledgerTruncated: sum.orders > rows.length,
        /* Said in the payload as well as on the screen, so a second client
           built against this route cannot quietly present it as a statement
           of what has been transferred. */
        note: 'These are earnings, not a payout statement. Lampose does not record food settlement transfers in this system.',
      },
    });
  } catch (error) {
    logError('restaurant-admin/earnings', error);
    return next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   Payout accounts — where this restaurant's money goes

   ## This is a deliberate exception to a rule, and the rule is still right

   `PATCH /me` refuses `payout` outright. `RE_VERIFICATION_FIELDS` in
   `foodPartner.controller.js` puts it beside the trading name and the FSSAI
   licence, with the reason written down: "it is where the settlement money
   goes, and a session that can repoint it is the whole of that attack."

   These routes let an owner repoint it anyway, because an owner who changes
   bank cannot be made to telephone Lampose and wait. That was asked for and
   decided; it is recorded here so the next person to read this file knows it
   was a choice and not an oversight.

   What that choice costs: anybody holding an owner's session can add an
   account and make it active, and the next settlement goes to them. Nothing
   below stops that. What is here instead is a RECORD — every add, switch and
   removal is logged with the last four digits, so the change can be found
   afterwards even though it was not prevented.

   If that trade is ever revisited, the smallest fix is to gate ACTIVATION
   (not adding) behind a Lampose approval, the way the restaurant application
   itself is gated. Saving a dormant account moves no money; only the switch
   does.

   ## Nothing here goes through `PATCH /me`

   Separate routes with separate handlers, so the whitelist on that route
   keeps refusing `payout` exactly as it does today. A caller that tries the
   old way still gets NEEDS_REVERIFICATION. The exception lives in one place
   and is reachable only by asking for it by name.

   ## `payout` stays the single source of "where the money goes"

   Activating an account copies it into `payout`. The staff approval queue
   and the completeness tally read that field and were not touched. The array
   is an address book; `payout` is the address.

   ## The full number is written once and never read back

   `bankAccountNumber` is `select: false` on both the array and `payout`, and
   `toJSON` deletes it again. Every response here carries `accountLast4` and
   nothing more. The logger prints "ending NNNN" for the same reason.
   ══════════════════════════════════════════════════════════════════════════ */

/** 11 characters: four letters, a zero, then six alphanumerics. */
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** Deliberately loose — a UPI handle's suffix list is not ours to police. */
const UPI = /^[\w.\-]{2,60}@[a-zA-Z]{2,30}$/;

const MAX_ACCOUNTS = 8;

/** What a screen may see: everything except the number itself. */
const publicAccount = (entry) => ({
  accountId: entry.accountId,
  label: entry.label || '',
  accountHolderName: entry.accountHolderName || '',
  accountLast4: entry.accountLast4 || '',
  ifscCode: entry.ifscCode || '',
  accountType: entry.accountType || 'current',
  upiId: entry.upiId || '',
  isActive: Boolean(entry.isActive),
  addedAt: entry.addedAt || null,
});

/**
 * Read and check a submitted account.
 *
 * Every problem is collected rather than the first one thrown, matching
 * `readMenuFields`: somebody who mistyped the IFSC and left the holder's name
 * blank should learn both at once rather than one save at a time.
 */
const readAccount = (body) => {
  const source = body && typeof body === 'object' ? body : {};
  const problems = [];
  const str = (v) => String(v === undefined || v === null ? '' : v).trim();

  const accountHolderName = str(source.accountHolderName);
  if (!accountHolderName) problems.push('The account holder’s name is required.');
  else if (accountHolderName.length > 120) problems.push('That account holder’s name is too long.');

  /* Spaces are how bank statements print an account number, so they are
     stripped rather than refused — somebody copying from a passbook should
     not be told their own number is invalid. */
  const digits = str(source.bankAccountNumber).replace(/\s/g, '');
  if (!digits) problems.push('The bank account number is required.');
  else if (!/^\d+$/.test(digits)) problems.push('A bank account number is digits only.');
  else if (digits.length < 9 || digits.length > 18) {
    problems.push('A bank account number is between 9 and 18 digits.');
  }

  /* Asked for twice and compared, because a mistyped account number is not
     refused by anything downstream — it is money sent to a stranger, or to
     nobody, and discovered a week later. The second box costs one field. */
  if (source.confirmAccountNumber !== undefined) {
    const confirm = str(source.confirmAccountNumber).replace(/\s/g, '');
    if (confirm !== digits) problems.push('The two account numbers do not match.');
  }

  const ifscCode = str(source.ifscCode).toUpperCase();
  if (!ifscCode) problems.push('The IFSC is required.');
  else if (!IFSC.test(ifscCode)) {
    problems.push('That IFSC does not look right — 11 characters, like HDFC0001234.');
  }

  const accountType = str(source.accountType).toLowerCase() || 'current';
  if (!['savings', 'current'].includes(accountType)) {
    problems.push('The account type is either savings or current.');
  }

  /* Optional. An empty box clears it rather than failing. */
  const upiId = str(source.upiId);
  if (upiId && !UPI.test(upiId)) problems.push('That UPI ID does not look right — like name@bank.');

  const label = str(source.label).slice(0, 60);

  return {
    problems,
    account: {
      label,
      accountHolderName,
      bankAccountNumber: digits,
      accountLast4: digits.slice(-4),
      ifscCode,
      accountType,
      upiId,
    },
  };
};

/**
 * Copy one entry into `payout`, which is what the rest of the platform reads.
 *
 * Called on every change that could alter WHICH account is active — adding an
 * active one, switching, and removing the active one. Doing it in one place
 * is what stops `payout` and the array's `isActive` flag from drifting into
 * two different answers.
 */
const syncActiveToPayout = (restaurant) => {
  const active = (restaurant.payoutAccounts || []).find((entry) => entry.isActive);
  if (!active) return;
  restaurant.payout = {
    accountHolderName: active.accountHolderName,
    bankAccountNumber: active.bankAccountNumber,
    accountLast4: active.accountLast4,
    ifscCode: active.ifscCode,
    accountType: active.accountType,
    upiId: active.upiId,
  };
};

/**
 * Restaurants onboarded before this screen existed have a `payout` and no
 * array. Rather than a migration — which either runs everywhere at once or
 * leaves half the estate in each state — the first entry is created from
 * `payout` the first time an owner looks.
 *
 * Only when `payout` actually holds an account. A half-filled one (an IFSC
 * and no number) is left alone: it would become an entry nobody could be
 * paid through, sitting at the top of the list marked active.
 *
 * Returns true when it wrote something, so the caller knows to save.
 */
const backfillFromPayout = (restaurant) => {
  if ((restaurant.payoutAccounts || []).length) return false;
  const payout = restaurant.payout || {};
  const number = String(payout.bankAccountNumber || '').replace(/\s/g, '');
  if (!number || !payout.ifscCode) return false;

  restaurant.payoutAccounts = [{
    accountId: makePayoutAccountId(),
    label: 'Account on file',
    accountHolderName: payout.accountHolderName || '',
    bankAccountNumber: number,
    accountLast4: payout.accountLast4 || number.slice(-4),
    ifscCode: payout.ifscCode,
    accountType: payout.accountType || 'current',
    upiId: payout.upiId || '',
    isActive: true,
    addedAt: restaurant.createdAt || new Date(),
  }];
  return true;
};

/**
 * The restaurant WITH the account numbers selected.
 *
 * `requireRestaurantAdmin` loaded the document without them — correctly, for
 * every other route in this file. These handlers need them: the backfill
 * reads `payout.bankAccountNumber`, and `syncActiveToPayout` has to carry the
 * number across or `payout` would end up holding an IFSC and no account.
 */
const loadWithNumbers = (restaurantId) => FoodRestaurant
  .findOne({ restaurantId })
  .select('+payout.bankAccountNumber +payoutAccounts.bankAccountNumber');

/**
 * @route   GET /api/v1/restaurant-admin/payout-accounts
 * @access  Restaurant Admin session. Reads `req.foodPartner` rather than
 *          `req.restaurantAdmin` (both point at the same document under this
 *          guard) purely for consistency with every other handler in this
 *          file — not yet mounted anywhere else. See `listPayouts`/
 *          `requestPayout` below, which ARE also mounted on the mobile app's
 *          router.
 */
const listPayoutAccounts = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const restaurant = await loadWithNumbers(req.foodPartner.restaurantId);
    if (!restaurant) return fail(res, 404, 'NOT_FOUND', 'This account no longer exists.');

    if (backfillFromPayout(restaurant)) await restaurant.save();

    const accounts = (restaurant.payoutAccounts || []).map(publicAccount);
    return res.json({
      success: true,
      count: accounts.length,
      /* Sorted so the one being paid is first, then newest. A list that put
         the active account third is a list somebody has to read before they
         can answer the only question they came with. */
      data: accounts.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
      }),
      maxAccounts: MAX_ACCOUNTS,
    });
  } catch (error) {
    logError('restaurant-admin/payout-accounts', error);
    return next(error);
  }
};

/**
 * @route   POST /api/v1/restaurant-admin/payout-accounts
 * @desc    Save a bank account. The first one saved becomes the active one.
 * @access  Restaurant Admin session. See the note on `listPayoutAccounts`.
 */
const addPayoutAccount = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const { problems, account } = readAccount(req.body);
    if (problems.length) {
      return fail(res, 400, 'BAD_INPUT', problems.join(' '), { fields: ['payoutAccount'] });
    }

    const restaurant = await loadWithNumbers(req.foodPartner.restaurantId);
    if (!restaurant) return fail(res, 404, 'NOT_FOUND', 'This account no longer exists.');

    /* Saved immediately rather than relying on the save at the end of this
       handler: every early return below (too many accounts, duplicate) would
       otherwise discard the backfill, and the next handler to run would mint
       a different id for the same bank account. Uniform across all four
       handlers for that reason. */
    if (backfillFromPayout(restaurant)) await restaurant.save();
    const existing = restaurant.payoutAccounts || [];

    if (existing.length >= MAX_ACCOUNTS) {
      return fail(
        res, 409, 'TOO_MANY_ACCOUNTS',
        `You can keep ${MAX_ACCOUNTS} accounts. Remove one you no longer use first.`,
      );
    }

    /* The same account twice is a list nobody can read and a switch nobody
       can make confidently. Matched on the pair that identifies a bank
       account — the number and the branch — not on the nickname. */
    const duplicate = existing.find(
      (entry) => entry.bankAccountNumber === account.bankAccountNumber
        && entry.ifscCode === account.ifscCode,
    );
    if (duplicate) {
      return fail(
        res, 409, 'DUPLICATE_ACCOUNT',
        `That account is already saved, ending ${duplicate.accountLast4}.`,
      );
    }

    /* The FIRST account saved is active by definition — a shop with one
       account and nothing marked active would be a shop that cannot be paid.
       After that, the owner asks. */
    const makeActive = existing.length === 0 || req.body.makeActive === true;
    if (makeActive) existing.forEach((entry) => { entry.isActive = false; });

    const entry = {
      ...account,
      accountId: makePayoutAccountId(),
      isActive: makeActive,
      addedAt: new Date(),
    };
    restaurant.payoutAccounts = [...existing, entry];
    syncActiveToPayout(restaurant);
    await restaurant.save();

    /* Logged with four digits and never the number — see the section header.
       This is the record that exists in place of the gate. */
    logPayoutChange({
      action: 'added',
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.restaurantName,
      accountLast4: entry.accountLast4,
      ifscCode: entry.ifscCode,
      isActive: makeActive,
    });

    return res.status(201).json({ success: true, data: publicAccount(entry) });
  } catch (error) {
    logError('restaurant-admin/payout-accounts add', error);
    return next(error);
  }
};

/**
 * @route   PATCH /api/v1/restaurant-admin/payout-accounts/:accountId/activate
 * @desc    Send future settlements to this account instead.
 * @access  Restaurant Admin session. See the note on `listPayoutAccounts`.
 */
const activatePayoutAccount = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const restaurant = await loadWithNumbers(req.foodPartner.restaurantId);
    if (!restaurant) return fail(res, 404, 'NOT_FOUND', 'This account no longer exists.');

    if (backfillFromPayout(restaurant)) await restaurant.save();
    const accountId = String(req.params.accountId || '').trim();
    const wanted = (restaurant.payoutAccounts || []).find((e) => e.accountId === accountId);
    if (!wanted) return fail(res, 404, 'NOT_FOUND', 'We could not find that account.');

    const previous = (restaurant.payoutAccounts || []).find((e) => e.isActive);
    /* Idempotent: activating the account that is already active changes
       nothing and says so, rather than writing a second identical log line
       every time somebody double-clicks. */
    if (previous && previous.accountId === accountId) {
      return res.json({ success: true, data: publicAccount(wanted), changed: false });
    }

    restaurant.payoutAccounts.forEach((entry) => { entry.isActive = entry.accountId === accountId; });
    syncActiveToPayout(restaurant);
    await restaurant.save();

    logPayoutChange({
      action: 'switched',
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.restaurantName,
      accountLast4: wanted.accountLast4,
      ifscCode: wanted.ifscCode,
      previousLast4: previous ? previous.accountLast4 : '',
      isActive: true,
    });

    return res.json({ success: true, data: publicAccount(wanted), changed: true });
  } catch (error) {
    logError('restaurant-admin/payout-accounts activate', error);
    return next(error);
  }
};

/**
 * @route   DELETE /api/v1/restaurant-admin/payout-accounts/:accountId
 * @access  Restaurant Admin session. See the note on `listPayoutAccounts`.
 */
const removePayoutAccount = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const restaurant = await loadWithNumbers(req.foodPartner.restaurantId);
    if (!restaurant) return fail(res, 404, 'NOT_FOUND', 'This account no longer exists.');

    if (backfillFromPayout(restaurant)) await restaurant.save();
    const accountId = String(req.params.accountId || '').trim();
    const list = restaurant.payoutAccounts || [];
    const target = list.find((e) => e.accountId === accountId);
    if (!target) return fail(res, 404, 'NOT_FOUND', 'We could not find that account.');

    /*
     * The active account cannot be removed while another could take its
     * place: deleting it would leave `payout` pointing at a bank account the
     * owner has just said they no longer use, and nothing downstream would
     * notice. Switching first is one extra click and makes the owner name the
     * replacement.
     *
     * Removing the LAST account is allowed — a shop is entitled to withdraw
     * its details — and `payout` is cleared with it, so the platform is left
     * saying "we have no account for this restaurant" rather than quietly
     * keeping the one that was deleted.
     */
    if (target.isActive && list.length > 1) {
      return fail(
        res, 409, 'ACCOUNT_IS_ACTIVE',
        'This is the account you are being paid into. Make another one active first, then remove it.',
      );
    }

    restaurant.payoutAccounts = list.filter((e) => e.accountId !== accountId);

    if (target.isActive) {
      /* It was the last one. Clear `payout` rather than leaving it pointing
         at an account that no longer exists in the list. */
      restaurant.payout = {
        accountHolderName: '', bankAccountNumber: '', accountLast4: '',
        ifscCode: '', accountType: 'current', upiId: '',
      };
    } else {
      syncActiveToPayout(restaurant);
    }

    await restaurant.save();

    logPayoutChange({
      action: 'removed',
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.restaurantName,
      accountLast4: target.accountLast4,
      ifscCode: target.ifscCode,
      note: target.isActive
        ? 'it was the last one — this shop now has no payout account'
        : '',
    });

    return res.json({
      success: true,
      data: { accountId, accountLast4: target.accountLast4 },
      hasPayoutAccount: restaurant.payoutAccounts.length > 0,
    });
  } catch (error) {
    logError('restaurant-admin/payout-accounts remove', error);
    return next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   Payouts — asking to be paid

   The balance and the claim are in `foodPayout.service.js`, shared with the
   staff queue so that what a kitchen is told it is owed and what a member of
   staff is asked to transfer are one number computed once.

   These two routes are the owner's half: see the balance, and press the
   button. Nothing here moves money or touches a gateway — a request is a row
   put in front of a person.

   Mounted twice — once here for the web console, once in
   `foodPartner.routes.js` under `/me/payouts` for the mobile app, behind
   `requireFoodPartner` — the same handler both times, because the balance a
   kitchen sees on its phone and the balance it sees in a browser must be one
   number computed once. The bank account is not: these two routes rely on
   `payoutAccounts` already holding one (backfilled from the restaurant's own
   `payout` object the first time any payout route runs — see
   `backfillFromPayout`), so a restaurant that only ever used the mobile app's
   onboarding bank-details step still has an active account to request into
   without ever visiting the accounts screen. Adding, switching or removing a
   SAVED account is still console-only for now — see `listPayoutAccounts`.
   ══════════════════════════════════════════════════════════════════════════ */

const PAYOUT_HISTORY_LIMIT = 50;

/**
 * @route   GET /api/v1/restaurant-admin/payouts (also GET /api/v2/food-partners/me/payouts)
 * @desc    What can be requested, what is already asked for, and the history.
 * @access  Restaurant Admin session, or the Food-Partner mobile app's own
 *          session — reads `req.foodPartner`, which both guards set to the
 *          same document, so the balance and history one console reads are
 *          the same numbers the other reads. See `foodPartner.routes.js`.
 */
const listPayouts = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const { restaurantId } = req.foodPartner;

    const [balance, rows] = await Promise.all([
      payouts.availableFor(restaurantId),
      FoodPayout.find({ restaurantId })
        .sort({ requestedAt: -1 })
        .limit(PAYOUT_HISTORY_LIMIT)
        .lean(),
    ]);

    return res.json({
      success: true,
      data: {
        balance,
        /* The floor, sent rather than hardcoded in the client, so the button
           and the server cannot disagree about when it is pressable. */
        minimum: payouts.MIN_REQUEST,
        history: rows.map(payouts.present),
      },
    });
  } catch (error) {
    logError('restaurant-admin/payouts', error);
    return next(error);
  }
};

/**
 * @route   POST /api/v1/restaurant-admin/payouts/request (also POST /api/v2/food-partners/me/payouts/request)
 * @desc    Ask Lampose for the balance. Optionally names which saved account.
 * @access  Restaurant Admin session, or the Food-Partner mobile app's own
 *          session. See `foodPartner.routes.js`.
 */
const requestPayout = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    /* The account numbers are needed because the snapshot written onto the
       payout row is taken from the saved account, and `requireRestaurantAdmin`
       loaded the document without them. */
    const restaurant = await loadWithNumbers(req.foodPartner.restaurantId);
    if (!restaurant) return fail(res, 404, 'NOT_FOUND', 'This account no longer exists.');

    /*
     * Persisted, not merely computed.
     *
     * An owner whose first action is "Request payout" — before they have
     * ever opened the accounts screen — backfills here. Leaving that in
     * memory would put a snapshot on the payout row naming an `accountId`
     * that was never written, and the accounts screen would then backfill
     * AGAIN and mint a different id for the same bank account. The row would
     * point at an account that does not exist, which is exactly the kind of
     * dangling reference nobody notices until they are reconciling a
     * transfer.
     */
    if (backfillFromPayout(restaurant)) await restaurant.save();

    const list = restaurant.payoutAccounts || [];
    /*
     * Which account this payout goes to.
     *
     * The body may name one — the request dialog lets an owner pick without
     * first changing their standing preference. Naming an account that is
     * not theirs is a 404 rather than a silent fall back to the active one:
     * falling back would pay the RIGHT owner at the WRONG account and tell
     * them it went where they asked.
     */
    const askedFor = String((req.body || {}).accountId || '').trim();
    const account = askedFor
      ? list.find((entry) => entry.accountId === askedFor)
      : list.find((entry) => entry.isActive);

    if (askedFor && !account) {
      return fail(res, 404, 'NOT_FOUND', 'We could not find that account.');
    }

    const payout = await payouts.requestPayout(restaurant, account);

    logPayoutChange({
      action: 'requested',
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.restaurantName,
      accountLast4: payout.account.accountLast4,
      ifscCode: payout.account.ifscCode,
      note: `₹${payout.amount} across ${payout.orderCount} orders · ${payout.payoutId}`,
    });

    return res.status(201).json({ success: true, data: payouts.present(payout) });
  } catch (error) {
    /* The service raises named refusals — nothing to pay out, below the
       floor, one already open. They are the answer, not a fault. */
    if (error instanceof payouts.PayoutError) {
      return fail(res, error.status || 400, error.code, error.message);
    }
    logError('restaurant-admin/payouts request', error);
    return next(error);
  }
};

module.exports = {
  login,
  summary,
  analytics,
  earnings,
  listPayoutAccounts,
  addPayoutAccount,
  activatePayoutAccount,
  removePayoutAccount,
  listPayouts,
  requestPayout,
};
