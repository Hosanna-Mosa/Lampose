/* ══════════════════════════════════════════════════════════════════════════
   The food-order desk, as the console works it — and the one place a diner's
   prepaid money can actually be sent back.

   ## Why this file exists

   `markForRefund` in `foodPayment.controller.js` does three things when a paid
   order is cancelled or rejected: it sets `paymentStatus: 'refunded'`, it
   writes a "Refund owed" line into `statusHistory`, and it prints a warning
   ending "refund this in the dashboard". There was no dashboard. The warning
   scrolled past in a log nobody greps, and a student's ₹320 stopped at a
   status word — a word that claims the money went back when it has not moved
   at all.

   The decision that put it there was right in its own terms: a refund moves
   real money, and an automatic one fired from a cancel button is how a bug
   becomes a bank statement. What was missing was the other half of it — a
   person, a screen, and a button that records who pressed it. This is that
   half, and `paymentStatus: 'refunded'` finally means what a reader assumes it
   means, because something now closes the loop behind it.

   ## A SECOND admin router in this module, not a new pattern

   `foodAdmin.controller.js` is the restaurant approval queue and this sits
   beside it: the same v1 admin identity (`admins` + `verifyAdminToken`), the
   same `requireLamposeDb`, the same 🍽️ badge on every line it prints, the
   same `{ success, code, message, error }` refusal envelope. Pagination
   follows `supportAdmin.controller.js` — `page`/`pages`/`total` — rather than
   the approval queue's bare `limit`, because `food_orders` grows by the day
   and a queue with no page two is a queue that silently stops showing work.

   The one thing this file does NOT copy is the role set. See the router.

   ## The refund record lives on the ORDER, and nothing decides from text

   It did not always. For one release `foodOrder.model.js` had nowhere to put a
   refund — its `razorpay` sub-document held the four facts of money arriving
   and said nothing about money leaving — so the refund was written where there
   was room, as a `statusHistory` note in a fixed shape, and read back by
   matching on that text.

   That was a hole, and it was this file's hole. `statusHistory` is not an
   admin-only array: `foodCustomerOrder.cancelMyOrder` pushes the DINER's own
   cancellation reason into it verbatim. Matching on `note` without asking who
   wrote it meant a diner who typed a reason shaped like the settled line made
   their own order read as already refunded — and dropped it straight out of
   the queue whose entire purpose is making sure they get their money back. The
   debtor could strike their own debt off the books, in one text field, from a
   phone.

   The refund now lives in `razorpay.refundId` / `refundAmountPaise` /
   `refundedAt` / `refundedBy` / `refundChannel` / `refundStatus`, and every
   question this file asks — is it owed, may it be sent, has it already gone —
   is answered by `refundRecordOf` and `refundNotRecordedFilter` from the model,
   which read those fields and nothing else. Orders written before the fields
   existed still answer, from their old note, and ONLY when that note's author
   is `admin`; the model's comment sets out why that fallback rather than a
   backfill, and why `by` is the part that makes it safe.

   The human sentence is still written, in the same three shapes:

     Refund sent: rfnd_ABC · ₹320.00 · processed · by Meera Nair
     Refund settled outside the app: rfnd_ABC · by Meera Nair · bank transfer
     Refund attempt failed: <Razorpay's own words> · by Meera Nair

   Because an order's story is worth reading. But it is now a RECORD OF a
   decision rather than the thing a decision is read from, and the difference is
   the whole of this change.

   ## What an administrator is shown that a diner is not

   `partnerPayout` and `commissionRate` are stripped from `customerView`
   because what a restaurant nets is a commercial term between them and us.
   They are not stripped here: reconciling one order is exactly the question
   "the diner paid ₹320 — where did it go", and that question cannot be
   answered without them. `deliveryOtp` IS withheld, and that is not an
   oversight — it is the only evidence an order reached a door, and a console
   that can read it out to a rider can manufacture a delivery.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const razorpay = require('../../infrastructure/razorpay/razorpay');
const FoodOrder = require('./foodOrder.model');
const FoodRestaurant = require('./foodRestaurant.model');
const { BADGE, logError } = require('./foodPartner.log');
const foodDelivery = require('./foodDelivery.service');

const {
  ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_MODES, DISPATCH_STATES,
  refundRecordOf, refundNotRecordedFilter, isWebDelivery,
} = FoodOrder;

const PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

/** Statuses where the order is still somebody's problem. */
const OPEN_STATUSES = ['placed', 'accepted', 'preparing', 'ready', 'picked_up'];

/** The two ways an order ends without food, and the only two that owe money. */
const ABORTED_STATUSES = ['cancelled', 'rejected'];

/*
 * How long an open order may sit before a human should look at it.
 *
 * Forty-five minutes is a cooked-and-delivered order's whole life plus a
 * margin, not a service-level promise — the point of the number is that
 * anything past it is either forgotten or broken, and both want a person.
 * Deliberately one threshold rather than one per status: a queue that needs a
 * lookup table to explain why a row is in it is a queue people stop reading.
 */
const STUCK_MINUTES = 45;

/*
 * How far back the two shape-of-the-day tallies look.
 *
 * `byStatus` and `byPaymentStatus` were a `$group` over the WHOLE collection
 * with no `$match` in front of them — an unconditional scan of every food order
 * ever placed, on the one endpoint the console polls for its sidebar badge, and
 * the cost of it grows by the day for a chip row that answers "what does
 * today's trade look like".
 *
 * Thirty days rather than a day, because the question is a shape and a shape
 * needs enough rows to have one; and a window rather than an index, because
 * there is no index that makes counting everything cheap — a scan of a month is
 * a scan that stops growing, which is the actual fix. It rides `{ placedAt: -1 }`.
 *
 * Nothing else on this payload is windowed. The four "needs a human" counts are
 * the work queue and must be complete — a refund owed since March is exactly
 * the row a window would hide, and hiding it is the failure this desk was built
 * to end. `tallyWindowDays` goes out with the numbers so the two that ARE
 * bounded say so.
 */
const TALLY_WINDOW_DAYS = 30;

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const dbDown = (res) => fail(
  res, 503, 'DB_DISCONNECTED', 'The server is running but not connected to the database.',
);

const isUp = () => mongoose.connection.readyState === 1;

/** A user-supplied string going into a regex unescaped is a denial of service. */
const literal = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rupees, to the paisa, and never a float printed at seventeen digits. */
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Who pressed it, from the token — never from the request body. */
const adminName = (req) => String(
  (req.admin && (req.admin.name || req.admin.email)) || 'an administrator',
).trim();

/* ── The refund record ────────────────────────────────────────────────────
 *
 * `refundRecordOf` and `refundNotRecordedFilter` come from the model, which is
 * where they belong: whoever owns the shape owns how it is read, and the
 * in-memory reader and the Mongo filter have to be exact complements or the
 * badge counts eleven over a list that shows nine. They are imported rather
 * than reimplemented here for the same reason there is one `SETTLED_NOTE`
 * below and not three — except that now there is a field to read instead of a
 * sentence to parse.
 *
 * These three sentences are still WRITTEN, because an order's history is worth
 * reading by a person. Nothing branches on them.
 */
const settledNote = (refund, rupees, who, reason) => `Refund sent: ${refund.id} · `
  + `₹${rupees.toFixed(2)} · ${refund.status || 'requested'} · by ${who}${reason ? ` · ${reason}` : ''}`;

const byHandNote = (reference, who, note) => `Refund settled outside the app: ${reference} · `
  + `by ${who}${note ? ` · ${note}` : ''}`;

const FAILURE_NOTE_PREFIX = 'Refund attempt failed:';

/**
 * The most recent failed attempt, so the console can say why it did not go.
 *
 * Display only — nothing decides anything from it, and an order with a failed
 * attempt is still owed and still refundable, which is the point of recording
 * it. It is nonetheless read only off an ADMIN-authored line, on the same
 * reasoning as the ledger itself: a diner who typed "Refund attempt failed:
 * the gateway is down" as their cancellation reason would be putting words in
 * Razorpay's mouth on a console screen, and a support call about a refund that
 * never failed is a real cost even when no money moves.
 */
const lastRefundFailureOf = (order) => {
  const history = (order && order.statusHistory) || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const event = history[i] || {};
    const note = String(event.note || '');
    if (event.by === 'admin' && note.startsWith(FAILURE_NOTE_PREFIX)) {
      return { note, at: event.at || null };
    }
  }
  return null;
};

/**
 * Is this order genuinely owed money back?
 *
 * Two shapes qualify, and the first is the one `markForRefund` leaves behind:
 *
 *   online + `refunded`   flagged as owed, nothing sent. This is the queue.
 *   online + `paid`, cancelled or rejected
 *                         the same debt with the flag missing — an order
 *                         closed by a path that did not call `markForRefund`,
 *                         or one closed before that function existed.
 *
 * A paid online order that is still RUNNING is refused on purpose. "Paid" is
 * not "owed": refunding an order the kitchen is cooking leaves a restaurant
 * out of pocket for food that is about to walk out of the door, and a console
 * that will do it on one click will eventually do it by accident. Cancel it
 * first — cancelling is what makes the money owed, and it is one screen away.
 *
 * Returns the refusal sentence rather than a bare boolean, because an admin
 * looking at a greyed-out button deserves to be told which of the four reasons
 * applies to the order in front of them.
 */
const owedState = (order) => {
  if (order.paymentMode !== 'online') {
    return {
      owed: false,
      why: 'That order was paid in cash. There is nothing at the gateway to send back.',
    };
  }
  if (order.paymentStatus === 'refunded') return { owed: true, why: '' };
  if (order.paymentStatus !== 'paid') {
    return {
      owed: false,
      why: 'That order was never paid, so no money has left anybody\'s account.',
    };
  }
  if (!ABORTED_STATUSES.includes(order.status)) {
    return {
      owed: false,
      why: 'That order is still running. Cancel or reject it first — a refund on a live order '
        + 'leaves the restaurant out of pocket for food that is about to leave the kitchen.',
    };
  }
  return { owed: true, why: '' };
};

/* ── "Needs a human" — the same three questions, asked twice ──────────────
 *
 * Once as a Mongo filter, for the queue and the badge, and once in JavaScript,
 * for the flags drawn on a row that is already in memory. The pair MUST agree,
 * which is why they are written side by side rather than one at each call
 * site: a badge that counts eleven over a list that shows nine is a badge
 * nobody trusts twice.
 */

/**
 * Money owed and not yet sent.
 *
 * The two branches of `owedState` written as Mongo, and written so that each
 * one is a complete prefix of `{ paymentStatus, paymentMode, status, placedAt }`
 * rather than a filter the planner has to assemble. `paymentMode: 'online'` is
 * repeated INSIDE both branches rather than hoisted out beside the `$or`, which
 * looks like duplication and is the opposite: a hoisted clause leaves each
 * branch of the `$or` with only `paymentStatus` to bound on, and an `$or` runs
 * at the speed of its slowest branch. Spelled out, the first branch bounds on
 * two fields and the second on three, and this endpoint stops reading rows it
 * is going to throw away.
 *
 * `refundNotRecordedFilter()` is the part that cannot be indexed — it is a
 * negation, and one of its two branches is over an array. It does not need to
 * be: by the time it is applied, the index has already reduced the collection
 * to online orders that were cancelled, rejected or flagged, which is the
 * handful this desk exists to work.
 */
const refundOwedFilter = () => ({
  $and: [
    {
      $or: [
        { paymentStatus: 'refunded', paymentMode: 'online' },
        { paymentStatus: 'paid', paymentMode: 'online', status: { $in: ABORTED_STATUSES } },
      ],
    },
    refundNotRecordedFilter(),
  ],
});

const isRefundOwed = (order) => owedState(order).owed && !refundRecordOf(order);

/** Every rider said no, or dropped it, and the order is still live. */
const dispatchFailedFilter = () => ({
  'dispatch.state': 'unassigned',
  status: { $in: OPEN_STATUSES },
});

const isDispatchFailed = (order) => (
  ((order.dispatch && order.dispatch.state) === 'unassigned')
  && OPEN_STATUSES.includes(order.status)
);

/**
 * Open far too long.
 *
 * An unpaid ONLINE order is excluded, and that is not a blind spot:
 * `foodPayment.controller.js` says plainly that an abandoned checkout leaves a
 * `pending` row, that this is honest, and that it is what actually happened.
 * Those rows would be most of this filter and none of its point.
 */
const stuckFilter = (now = Date.now()) => ({
  status: { $in: OPEN_STATUSES },
  placedAt: { $lt: new Date(now - STUCK_MINUTES * 60 * 1000) },
  $nor: [{ paymentMode: 'online', paymentStatus: 'pending' }],
});

const isStuck = (order, now = Date.now()) => (
  OPEN_STATUSES.includes(order.status)
  && new Date(order.placedAt || order.createdAt || now).getTime() < now - STUCK_MINUTES * 60 * 1000
  && !(order.paymentMode === 'online' && order.paymentStatus === 'pending')
);

const needsHumanFilter = (now = Date.now()) => ({
  $or: [refundOwedFilter(), dispatchFailedFilter(), stuckFilter(now)],
});

/* ── What a row and a page look like ──────────────────────────────────────*/

/** The columns the console's table draws, and nothing it does not. */
const queueRow = (order, { restaurantName = '', now = Date.now() } = {}) => {
  const record = refundRecordOf(order);
  const owed = isRefundOwed(order);
  const dispatch = order.dispatch || {};
  const delivery = order.delivery || {};
  const flags = {
    refundOwed: owed,
    dispatchFailed: isDispatchFailed(order),
    stuck: isStuck(order, now),
  };

  return {
    orderNumber: order.orderNumber,
    placedAt: order.placedAt || null,
    ageMinutes: Math.max(
      0,
      Math.round((now - new Date(order.placedAt || order.createdAt || now).getTime()) / 60000),
    ),
    status: order.status,
    dispatchState: dispatch.state || 'idle',
    dispatchFailureReason: dispatch.failureReason || '',
    fulfilment: order.fulfilment || 'delivery',
    restaurantId: order.restaurantId,
    /* The snapshot on the order first, the live row second, and an empty
       string rather than a guess when neither has one. Orders written before
       `restaurant` existed have an empty snapshot, and the console draws the
       id in that case rather than a name nobody wrote down. */
    restaurantName: (order.restaurant && order.restaurant.name) || restaurantName || '',
    customerName: order.customerName || '',
    customerPhone: order.customerPhone || '',
    grandTotal: money(order.grandTotal),
    paymentMode: order.paymentMode,
    paymentStatus: order.paymentStatus,
    refund: {
      state: record ? 'settled' : (owed ? 'owed' : 'none'),
      channel: record ? record.channel : '',
      reference: record ? record.reference : '',
      at: record ? record.at : null,
      by: record ? record.by : '',
    },
    rider: delivery.driverId
      ? {
        driverId: delivery.driverId,
        name: delivery.driverName || '',
        phone: delivery.driverPhone || '',
      }
      : null,
    flags: { ...flags, needsHuman: flags.refundOwed || flags.dispatchFailed || flags.stuck },
  };
};

/**
 * Look the kitchens on THIS PAGE up, once.
 *
 * Only ever for rows whose snapshot is empty — an order placed before
 * `restaurant.name` was written onto the row. One `$in` for a page of at most
 * a hundred, rather than a join per row for a column that is usually already
 * there. The same shape `foodAdmin.controller.js` uses for its menu counts.
 */
const restaurantNamesFor = async (rows) => {
  const missing = [...new Set(
    rows.filter((row) => !(row.restaurant && row.restaurant.name)).map((row) => row.restaurantId),
  )].filter(Boolean);
  if (!missing.length) return {};
  const found = await FoodRestaurant.find({ restaurantId: { $in: missing } })
    .select('restaurantId restaurantName')
    .lean();
  return found.reduce((acc, row) => ({ ...acc, [row.restaurantId]: row.restaurantName }), {});
};

/* ── GET / ─────────────────────────────────────────────────────────────────*/

/**
 * Turn the query string into a Mongo filter.
 *
 * Every clause is validated against a list the model exports rather than
 * passed through — a filter assembled from raw query parameters is a filter
 * somebody can send `{ $ne: null }` to. Clauses are collected into `$and`
 * rather than merged into one object because three of them (`needs`, the
 * refund-owed branch and `q`) each carry their own `$or`, and two `$or` keys
 * in one object silently keep only the last.
 *
 * The filters are chosen to sit on the indexes that exist:
 * `{ restaurantId, status, placedAt }`, `{ dispatch.state, placedAt }` and the
 * unique index on `orderNumber`, which is why the search is ANCHORED.
 */
/* The model's own enum, restated rather than imported: `foodOrder.model.js`
   declares it inline on the field and exports no list. Two words that have
   not changed since the collection existed. */
const FULFILMENTS = ['delivery', 'pickup'];

const filterFrom = (query, now) => {
  const and = [];
  const invalid = (message) => ({ error: message });

  const needs = String(query.needs || '').trim();
  if (needs && needs !== 'any') {
    if (needs === 'human') and.push(needsHumanFilter(now));
    else if (needs === 'refund') and.push(refundOwedFilter());
    else if (needs === 'dispatch') and.push(dispatchFailedFilter());
    else if (needs === 'stuck') and.push(stuckFilter(now));
    else return invalid('"needs" must be one of: human, refund, dispatch, stuck, any.');
  }

  const status = String(query.status || '').trim();
  if (status && status !== 'all') {
    const wanted = status.split(',').map((s) => s.trim()).filter((s) => ORDER_STATUSES.includes(s));
    if (!wanted.length) return invalid(`"status" must be one of: ${ORDER_STATUSES.join(', ')}.`);
    and.push({ status: { $in: wanted } });
  }

  const paymentStatus = String(query.paymentStatus || '').trim();
  if (paymentStatus && paymentStatus !== 'all') {
    const wanted = paymentStatus.split(',').map((s) => s.trim())
      .filter((s) => PAYMENT_STATUSES.includes(s));
    if (!wanted.length) {
      return invalid(`"paymentStatus" must be one of: ${PAYMENT_STATUSES.join(', ')}.`);
    }
    and.push({ paymentStatus: { $in: wanted } });
  }

  const paymentMode = String(query.paymentMode || '').trim();
  if (paymentMode && paymentMode !== 'all') {
    if (!PAYMENT_MODES.includes(paymentMode)) {
      return invalid(`"paymentMode" must be one of: ${PAYMENT_MODES.join(', ')}.`);
    }
    and.push({ paymentMode });
  }

  /*
   * Delivery or pickup.
   *
   * Pickup is no longer offered — `foodCustomerOrder.controller.js` refuses
   * one — so in practice this filter now finds the handful of orders placed
   * for collection before that, and nothing else. Kept for exactly that: they
   * are still open, they still need working, and they are the hardest orders
   * on this screen to reason about precisely because no rider is coming.
   */
  const fulfilment = String(query.fulfilment || '').trim();
  if (fulfilment && fulfilment !== 'all') {
    if (!FULFILMENTS.includes(fulfilment)) {
      return invalid(`"fulfilment" must be one of: ${FULFILMENTS.join(', ')}.`);
    }
    and.push({ fulfilment });
  }

  const dispatchState = String(query.dispatchState || '').trim();
  if (dispatchState && dispatchState !== 'all') {
    if (!DISPATCH_STATES.includes(dispatchState)) {
      return invalid(`"dispatchState" must be one of: ${DISPATCH_STATES.join(', ')}.`);
    }
    and.push({ 'dispatch.state': dispatchState });
  }

  const restaurantId = String(query.restaurantId || '').trim();
  if (restaurantId) and.push({ restaurantId });

  /* A shift runs on a calendar, so a bare `to` date covers the whole of that
     day — an operator asking for "the 3rd" means the 3rd, not the instant it
     began. A full ISO timestamp is taken exactly as given. */
  const range = {};
  if (String(query.from || '').trim()) {
    const from = new Date(String(query.from).trim());
    if (Number.isNaN(from.getTime())) {
      return invalid('"from" is not a date I can read. Use YYYY-MM-DD.');
    }
    range.$gte = from;
  }
  if (String(query.to || '').trim()) {
    const raw = String(query.to).trim();
    const to = new Date(raw);
    if (Number.isNaN(to.getTime())) {
      return invalid('"to" is not a date I can read. Use YYYY-MM-DD.');
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) to.setHours(23, 59, 59, 999);
    range.$lte = to;
  }
  if (Object.keys(range).length) and.push({ placedAt: range });

  /*
   * What somebody actually types into the box: an order number off a phone
   * call, a diner's number, or a gateway reference off a Razorpay row they are
   * trying to match to an order.
   *
   * Every one of the four branches is an index seek, and that is not a detail —
   * an `$or` where ONE branch cannot use an index makes the planner scan the
   * collection for all four, so a search box is only as fast as its worst
   * clause. Three things had to be true for that, and only the third was:
   *
   *   · the field is indexed. `customerPhone`, `razorpay.paymentId` and
   *     `razorpay.orderId` now are; `orderNumber` always was.
   *   · a regex is ANCHORED. An unanchored `/9111/` has to look inside every
   *     stored string and cannot use bounds at all. The phone is now a prefix
   *     match — which is how a number is read out and how it is pasted — and a
   *     search for the last four digits is deliberately not offered rather than
   *     offered as a table scan.
   *   · a regex is CASE-SENSITIVE. This is the one that surprised: `/^LO12/i`
   *     reads like the anchored index seek it was documented as being, and is
   *     not one — a case-insensitive regex cannot take index bounds either. An
   *     order number is minted uppercase and a phone number has no case, so the
   *     input is upper-cased for the one and taken as typed for the other, and
   *     both are exact.
   *
   * The two gateway ids stay exact equality, because half a payment id matches
   * nothing worth having.
   */
  const q = String(query.q || query.search || '').trim();
  if (q) {
    and.push({
      $or: [
        { orderNumber: new RegExp(`^${literal(q.toUpperCase())}`) },
        { customerPhone: new RegExp(`^${literal(q)}`) },
        { 'razorpay.paymentId': q },
        { 'razorpay.orderId': q },
      ],
    });
  }

  return { filter: and.length ? { $and: and } : {}, needs };
};

// @route   GET /api/v1/admin/food-orders
// @desc    The order queue, filtered the way a shift actually asks about it
// @access  Admin console (any signed-in administrator)
const listOrders = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const now = Date.now();
    const built = filterFrom(req.query, now);
    if (built.error) return fail(res, 400, 'BAD_INPUT', built.error);

    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit) || PAGE_SIZE));
    const page = Math.max(1, Number(req.query.page) || 1);

    /*
     * Oldest first when looking at work, newest first when browsing.
     *
     * The same reasoning `supportAdmin.controller.js` gives for its queue: the
     * question a working list answers is "who has been waiting longest", and
     * newest-first buries the student whose refund has been owed since Tuesday
     * under everybody who ordered lunch today.
     *
     * Both directions come off `{ placedAt: -1 }`, which exists for this line.
     * Before it did, the console's OWN first screen — no filter, newest first —
     * had nothing to sort on: every other index on `food_orders` carries
     * `placedAt` as a trailing field behind a partner, diner or rider id, and
     * the console supplies none of those. An index is walked either way, so one
     * declaration serves the browse and the queue.
     */
    const asked = String(req.query.sort || '').trim();
    const oldestFirst = asked === 'oldest' || (asked !== 'newest' && Boolean(built.needs));
    const sort = { placedAt: oldestFirst ? 1 : -1 };

    const [rows, total] = await Promise.all([
      FoodOrder.find(built.filter)
        /* `razorpay` is here for the refund record and `statusHistory` for the
           legacy fallback behind it — a row read without them would show every
           already-settled order as still owed. */
        .select('orderNumber placedAt createdAt status dispatch delivery fulfilment restaurantId '
          + 'restaurant customerName customerPhone grandTotal paymentMode paymentStatus '
          + 'razorpay statusHistory')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      FoodOrder.countDocuments(built.filter),
    ]);

    const names = await restaurantNamesFor(rows);

    return res.json({
      success: true,
      count: rows.length,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: rows.map((row) => queueRow(row, { restaurantName: names[row.restaurantId] || '', now })),
    });
  } catch (error) {
    logError('admin/food-orders', error);
    return next(error);
  }
};

/* ── GET /counts ──────────────────────────────────────────────────────────*/

// @route   GET /api/v1/admin/food-orders/counts
// @desc    The queue badge: how many orders need a human right now
// @access  Admin console (any signed-in administrator)
const getCounts = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const now = Date.now();
    const since = new Date(now - TALLY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [
      needsHuman, refundOwed, dispatchFailed, stuck, owedValue, byStatus, byPayment, open,
    ] = await Promise.all([
      FoodOrder.countDocuments(needsHumanFilter(now)),
      FoodOrder.countDocuments(refundOwedFilter()),
      FoodOrder.countDocuments(dispatchFailedFilter()),
      FoodOrder.countDocuments(stuckFilter(now)),
      /* What is actually owed, in rupees, summed off the same rows the badge
         counts. A number with a source: it is the diners' own grand totals,
         not an estimate of them. */
      FoodOrder.aggregate([
        { $match: refundOwedFilter() },
        { $group: { _id: null, total: { $sum: '$grandTotal' } } },
      ]),
      /* The two shape-of-the-day tallies, over a WINDOW. See `TALLY_WINDOW_DAYS`. */
      FoodOrder.aggregate([
        { $match: { placedAt: { $gte: since } } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      FoodOrder.aggregate([
        { $match: { placedAt: { $gte: since } } },
        { $group: { _id: '$paymentStatus', n: { $sum: 1 } } },
      ]),
      /* Deliberately NOT windowed. An order that has been open since Tuesday is
         exactly the one somebody has to see, and a window would be the thing
         that hid it. It rides `{ status, placedAt }` and the statuses it counts
         are the live ones, which is a small share of the collection — an
         all-time count here is cheap in a way an all-time GROUP is not. */
      FoodOrder.countDocuments({ status: { $in: OPEN_STATUSES } }),
    ]);

    /* Zero-filled from the model's own lists so the console draws a stable row
       of chips rather than one that changes width as orders arrive — the same
       reason `supportAdmin.controller.js` fills its audiences in. */
    const tally = (rows, keys) => {
      const acc = Object.fromEntries(keys.map((key) => [key, 0]));
      rows.forEach((row) => { acc[row._id || 'unknown'] = row.n; });
      return acc;
    };

    return res.json({
      success: true,
      data: {
        needsHuman,
        refundOwed,
        refundOwedValue: money(owedValue.length ? owedValue[0].total : 0),
        dispatchFailed,
        stuck,
        stuckAfterMinutes: STUCK_MINUTES,
        openOrders: open,
        byStatus: tally(byStatus, ORDER_STATUSES),
        byPaymentStatus: tally(byPayment, PAYMENT_STATUSES),
        /* Sent so the two tallies above can never be read as all-time by
           somebody who did not come here to check. Every other number on this
           payload is. */
        tallyWindowDays: TALLY_WINDOW_DAYS,
        tallySince: since,
      },
    });
  } catch (error) {
    logError('admin/food-orders/counts', error);
    return next(error);
  }
};

/* ── GET /:orderNumber ────────────────────────────────────────────────────*/

/**
 * One order, reconciled.
 *
 * The question this answers is the one nobody could answer this morning: the
 * diner paid ₹320 — where did it go? So every component is named and the
 * arithmetic is shown, rather than a single "revenue" figure that has to be
 * taken on trust.
 *
 * `commissionAmount` and `lamposeNet` are null, not zero, when `partnerPayout`
 * was never written. An order from before the payout settled onto the row has
 * no answer to "what did the restaurant net", and a zero there would read as
 * "nothing" — a different claim, and a false one.
 */
const detailOf = (order, { restaurant = null, now = Date.now() } = {}) => {
  const record = refundRecordOf(order);
  const owed = owedState(order);
  const dispatch = order.dispatch || {};
  const delivery = order.delivery || {};
  const rp = order.razorpay || {};

  const itemsTotal = money(order.itemsTotal);
  const grandTotal = money(order.grandTotal);
  const partnerPayout = money(order.partnerPayout);
  const riderEarnings = money(delivery.earnings);
  const hasPayout = partnerPayout > 0;

  const flags = {
    refundOwed: isRefundOwed(order),
    dispatchFailed: isDispatchFailed(order),
    stuck: isStuck(order, now),
  };

  return {
    orderNumber: order.orderNumber,
    placedAt: order.placedAt || null,
    status: order.status,
    fulfilment: order.fulfilment || 'delivery',
    /* Where it was placed, and how the restaurant said it travels — what decides
       whether "Mark delivered" is on offer. The server decides that too, and the
       console does not second-guess it. */
    channel: order.channel || 'app',
    deliveryMethod: (order.delivery && order.delivery.method) || '',
    canMarkDelivered: canBeMarkedDelivered(order) === null,
    promisedMinutes: order.promisedMinutes || 0,
    rejectionReason: order.rejectionReason || '',
    ageMinutes: Math.max(
      0,
      Math.round((now - new Date(order.placedAt || order.createdAt || now).getTime()) / 60000),
    ),

    customer: {
      customerId: order.customerId || '',
      name: order.customerName || '',
      phone: order.customerPhone || '',
      deliveryAddress: order.deliveryAddress || '',
    },

    restaurant: {
      restaurantId: order.restaurantId,
      name: (order.restaurant && order.restaurant.name)
        || (restaurant && restaurant.restaurantName) || '',
      address: (order.restaurant && order.restaurant.address) || '',
      phone: (order.restaurant && order.restaurant.phone)
        || (restaurant && restaurant.contactNumber) || '',
      ownerName: restaurant ? (restaurant.ownerName || '') : '',
      ownerPhone: restaurant ? (restaurant.ownerPhone || '') : '',
    },

    /* Every line the diner was charged for, exactly as it was snapshotted. */
    lines: (order.lines || []).map((line) => ({
      productId: line.productId || '',
      productName: line.productName,
      variantName: line.variantName || '',
      addOns: (line.addOns || []).map((add) => ({ name: add.name, price: money(add.price) })),
      quantity: line.quantity,
      unitPrice: money(line.unitPrice),
      lineTotal: money(line.lineTotal),
      isVeg: line.isVeg,
      note: line.note || '',
    })),

    money: {
      itemsTotal,
      /* 0 on everything placed since it was dropped, and a real figure on the
         orders that were charged one — see `foodCharges.util.js`. */
      packagingCharge: money(order.packagingCharge),
      gst: money(order.gst),
      gstRate: Number(order.gstRate) || 0,
      platformFee: money(order.platformFee),
      deliveryFee: money(order.deliveryFee),
      discount: money(order.discount),
      grandTotal,
      partnerPayout,
      commissionRate: Number(order.commissionRate) || 0,
      commissionAmount: hasPayout ? money(itemsTotal - partnerPayout) : null,
      riderEarnings,
      /* What is left once the kitchen and the rider are paid. Derived from
         three stored figures and nothing else — no rate is applied here that
         the order does not already carry. */
      lamposeNet: hasPayout ? money(grandTotal - partnerPayout - riderEarnings) : null,
    },

    payment: {
      mode: order.paymentMode,
      status: order.paymentStatus,
      razorpayOrderId: rp.orderId || '',
      razorpayPaymentId: rp.paymentId || '',
      amountPaise: rp.amountPaise || 0,
      paidAt: rp.paidAt || null,
      refundable: owed.owed && !record,
      refundBlockedReason: record
        ? `Already refunded — ${record.reference || 'reference not recorded'}.`
        : owed.why,
      /* Spelled out key by key rather than spread, so that a field added to the
         stored record does not silently become part of what the console is
         served. The six the console reads are the six it has always read;
         `amountPaise` and `gatewayStatus` are new and are here because "how
         much actually went back" is the first question anybody reconciling one
         of these rows asks, and until now the row could not answer it. */
      refund: record
        ? {
          state: 'settled',
          channel: record.channel,
          reference: record.reference,
          at: record.at,
          by: record.by,
          note: record.note,
          amountPaise: record.amountPaise,
          gatewayStatus: record.gatewayStatus,
        }
        : {
          state: owed.owed ? 'owed' : 'none',
          channel: '',
          reference: '',
          at: null,
          by: '',
          note: '',
          amountPaise: 0,
          gatewayStatus: '',
        },
      lastFailure: lastRefundFailureOf(order),
    },

    dispatch: {
      state: dispatch.state || 'idle',
      candidateCount: dispatch.candidateCount || 0,
      attempts: dispatch.attempts || 0,
      startedAt: dispatch.startedAt || null,
      failureReason: dispatch.failureReason || '',
      /* Every rider who was asked and what they said. Stripped from the diner's
         view and the kitchen's, and kept here because it is the only answer to
         "why did nobody come" — see the note on `offerSchema`. */
      offers: (dispatch.offers || []).map((offer) => ({
        driverId: offer.driverId,
        distanceMeters: offer.distanceMeters || 0,
        offeredAt: offer.offeredAt || null,
        respondedAt: offer.respondedAt || null,
        outcome: offer.outcome,
        reason: offer.reason || '',
      })),
    },

    rider: delivery.driverId
      ? {
        driverId: delivery.driverId,
        name: delivery.driverName || '',
        phone: delivery.driverPhone || '',
        vehicle: delivery.vehicle || {},
        assignedAt: delivery.assignedAt || null,
        pickedUpAt: delivery.pickedUpAt || null,
        deliveredAt: delivery.deliveredAt || null,
        earnings: riderEarnings,
        acceptedFromMeters: delivery.acceptedFromMeters || 0,
      }
      : null,

    /* The kitchen's hand-over code, and NOT the diner's PIN. See the header. */
    pickupCode: order.pickupCode || '',

    statusHistory: (order.statusHistory || []).map((event) => ({
      status: event.status, at: event.at, by: event.by || 'system', note: event.note || '',
    })),

    flags: { ...flags, needsHuman: flags.refundOwed || flags.dispatchFailed || flags.stuck },
  };
};

const loadOrder = async (req) => FoodOrder.findOne({
  orderNumber: String(req.params.orderNumber || '').trim().toUpperCase(),
});

/* ── POST /:orderNumber/delivered ─────────────────────────────────────────*/

/**
 * Why this order cannot be marked delivered from here — or null when it can.
 *
 * WEBSITE orders only, and only once the food has left the restaurant's hands
 * (`ready` or `picked_up`). An app order has a real rider whose own app closes
 * it with the diner's code, and an admin button that closed it underneath them
 * would strand their earnings and their "busy" flag. This exists for the order
 * the diner never confirmed: the food arrived, nobody pressed the button, and the
 * restaurant is waiting to be paid.
 */
const canBeMarkedDelivered = (order) => {
  if (order.status === 'delivered') return 'This order is already delivered.';
  if (!isWebDelivery(order)) {
    return order.fulfilment === 'pickup'
      ? 'A counter-pickup order is collected by the customer, not delivered.'
      : 'This order was placed in the app. Its rider closes it with the customer\'s code.';
  }
  if (!['ready', 'picked_up'].includes(order.status)) {
    return 'It can be marked delivered once the food is ready and has gone out for delivery.';
  }
  return null;
};

// @route   POST /api/v1/admin/food-orders/:orderNumber/delivered
// @desc    The Lampose admin says a website order has been delivered
// @access  Admin console (`food.complete`: Super Admin, Admin)
//
// The other way a website order reaches Delivered — the diner presses the button
// on the tracking page, or this. Recorded against the admin's name, so the history
// says who closed it and it can never be mistaken for the diner's word.
const markDelivered = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const order = await loadOrder(req);
    if (!order) return fail(res, 404, 'NOT_FOUND', 'No order with that number.');

    const refusal = canBeMarkedDelivered(order);
    if (refusal) {
      return fail(res, 409, order.status === 'delivered' ? 'ALREADY_DELIVERED' : 'NOT_MARKABLE', refusal);
    }

    const who = adminName(req);
    const reason = String((req.body || {}).note || '').trim().slice(0, 150);
    foodDelivery.markDelivered(order, {
      by: 'admin',
      note: `Marked delivered by ${who}${reason ? `: ${reason}` : ''}`,
    });
    await order.save();

    // eslint-disable-next-line global-require
    const dispatch = require('../drivers/foodDispatch.service');
    // eslint-disable-next-line global-require
    const realtime = require('../../infrastructure/realtime/realtime');
    realtime.toOrderParties(order, 'dispatch_update', dispatch.dispatchUpdate(order));

    console.log(`${BADGE} [Order Delivered] ${order.orderNumber} marked by ${who}`);

    const restaurant = await FoodRestaurant.findOne({ restaurantId: order.restaurantId })
      .select('restaurantId restaurantName contactNumber ownerName ownerPhone')
      .lean();
    return res.json({ success: true, data: detailOf(order.toObject(), { restaurant }) });
  } catch (error) {
    logError('admin/food-orders/:orderNumber/delivered', error);
    return next(error);
  }
};

// @route   GET /api/v1/admin/food-orders/:orderNumber
// @desc    One order in full: the money, the dispatch, the history, the gateway
// @access  Admin console (any signed-in administrator)
const getOrder = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const order = await loadOrder(req);
    if (!order) return fail(res, 404, 'NOT_FOUND', 'No order with that number.');

    /* Looked up only for the fields the order does not snapshot — the owner's
       own line, which is who somebody rings when a kitchen has gone quiet. */
    const restaurant = await FoodRestaurant.findOne({ restaurantId: order.restaurantId })
      .select('restaurantId restaurantName contactNumber ownerName ownerPhone')
      .lean();

    return res.json({ success: true, data: detailOf(order.toObject(), { restaurant }) });
  } catch (error) {
    logError('admin/food-orders/:orderNumber', error);
    return next(error);
  }
};

/* ── POST /:orderNumber/refund ────────────────────────────────────────────*/

/*
 * The double-click guard, in this process.
 *
 * Three things stop an order being refunded twice, and this is the weakest and
 * the fastest of them. The real guards are the settled note already in
 * `statusHistory` — durable, checked below — and the idempotency key
 * `refundPayment` sends to Razorpay, which collapses two calls into one refund
 * at the gateway. This Set only closes the window between those two: the
 * second of an admin's two clicks arriving while the first is still in the air,
 * before there is a note to find. It is per-process and makes no claim beyond
 * that, which is exactly why it is not the thing being relied on.
 */
const inFlight = new Set();

/**
 * Write the refund onto the order, and ONLY if it has none.
 *
 * One conditional update, shared by both refund routes, and the shape matters
 * more than the saving. Read-then-write — load the order, check it has no
 * refund, save one onto it — is two round trips with a gap in the middle, and
 * two requests that both land in that gap both read null and both write. The
 * `inFlight` Set above closes that gap in THIS process and says so; it says
 * nothing about the next one, and this codebase runs behind a load balancer in
 * every deployment that is not one box.
 *
 * So the condition travels WITH the write: `refundNotRecordedFilter()` is part
 * of the query, MongoDB evaluates it against the document as it updates it, and
 * of two concurrent posts exactly one matches. The loser gets null back, which
 * is not an error — it is the answer, and each caller says what it means.
 *
 * The structured record and the human note go in the same update. They have to:
 * a row carrying a settled note and no `refundId` reads as owed and would be
 * paid twice, and one carrying a `refundId` and no note is a refund with no
 * story. Neither half is worth writing without the other.
 *
 * @param {string} orderNumber
 * @param {object} order the loaded row, for the status the history line carries
 * @param {{ reference, amountPaise, channel, gatewayStatus, by, note }} record
 * @returns {Promise<object|null>} the updated order, or null if it lost
 */
const recordRefund = async (orderNumber, order, record) => FoodOrder.findOneAndUpdate(
  { orderNumber, ...refundNotRecordedFilter() },
  {
    $set: {
      paymentStatus: 'refunded',
      'razorpay.refundId': record.reference,
      'razorpay.refundAmountPaise': record.amountPaise,
      'razorpay.refundedAt': record.at,
      'razorpay.refundedBy': record.by,
      'razorpay.refundChannel': record.channel,
      'razorpay.refundStatus': record.gatewayStatus,
      'razorpay.refundNote': record.note,
    },
    $push: {
      statusHistory: {
        status: order.status, at: record.at, by: 'admin', note: record.note,
      },
    },
  },
  { new: true },
);

/** Recorded, best effort. A failure to write the note must not hide the cause. */
const recordFailure = async (order, message, who) => {
  const note = `${FAILURE_NOTE_PREFIX} ${message} · by ${who}`.slice(0, 200);
  const last = order.statusHistory[order.statusHistory.length - 1];
  /* An admin clicking four times at a dead gateway should leave one line, not
     four identical ones. */
  if (last && last.note === note) return;
  try {
    order.statusHistory.push({ status: order.status, at: new Date(), by: 'admin', note });
    await order.save();
  } catch (error) {
    logError('recording a failed refund attempt', error);
  }
};

// @route   POST /api/v1/admin/food-orders/:orderNumber/refund
// @desc    Send the money back through Razorpay, and record who pressed it
// @access  Admin console — Super Admin / Admin only
const issueRefund = async (req, res, next) => {
  const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();
  const who = adminName(req);

  try {
    if (!isUp()) return dbDown(res);
    if (!razorpay.isConfigured()) {
      return fail(
        res, 503, 'PAYMENTS_NOT_CONFIGURED',
        'Razorpay is not configured on this server, so nothing can be refunded from here.',
      );
    }

    if (inFlight.has(orderNumber)) {
      return fail(
        res, 409, 'REFUND_IN_FLIGHT',
        'That refund is already going through. Give it a moment and reload the order.',
      );
    }

    const order = await loadOrder(req);
    if (!order) return fail(res, 404, 'NOT_FOUND', 'No order with that number.');

    /* The durable guard, and the first thing checked. A refund reference
       already on the row means the money has gone — whoever sent it, and
       however long ago. */
    const already = refundRecordOf(order);
    if (already) {
      return fail(
        res, 409, 'ALREADY_REFUNDED',
        `${orderNumber} was already refunded — ${already.reference || 'no reference recorded'}`
        + `${already.by ? `, by ${already.by}` : ''}. Nothing has been sent a second time.`,
      );
    }

    const owed = owedState(order);
    if (!owed.owed) return fail(res, 409, 'NOT_OWED', owed.why);

    if (!order.razorpay.paymentId) {
      return fail(
        res, 409, 'NO_PAYMENT_ID',
        'That order has no Razorpay payment id on it, so there is nothing to refund against. '
        + 'Find the payment in the Razorpay dashboard, refund it there, and record it here.',
      );
    }

    const reason = String((req.body || {}).reason || '').trim().slice(0, 200);

    /* Held across BOTH the gateway call and the save, and released only in the
       `finally` at the bottom. Releasing it after the call would leave open the
       one window that matters: the money has moved and the note is not written
       yet, which is exactly when a second click would send it again. */
    inFlight.add(orderNumber);
    try {
      let refund;
      try {
        /* Straight at the gateway client now, rather than through a wrapper in
           `foodPayment.controller.js` — see the signpost there. The idempotency
           key is the same string it has always been, built here because the
           order number is this module's fact and a key derived from anything
           less stable would be a key that stopped collapsing two clicks into
           one refund. */
        refund = await razorpay.refundPayment({
          paymentId: order.razorpay.paymentId,
          idempotencyKey: `food-refund-${order.orderNumber}`,
          notes: {
            foodOrderNumber: order.orderNumber,
            purpose: 'food_order_refund',
            reason: reason.slice(0, 200),
            by: String(who || '').slice(0, 100),
          },
        });
      } catch (error) {
        /* Razorpay's OWN words, verbatim. "Something went wrong" tells an
           admin holding somebody's ₹320 nothing about whether to try again,
           ring the bank, or fix a key — and those are three different
           afternoons. The order itself is untouched apart from this note, so
           the retry the message asks for is a retry that can happen. */
        await recordFailure(order, error.message, who);
        console.error(
          `${BADGE} [Refund failed] ${orderNumber} · ${error.message} · attempted by ${who}`,
        );
        const status = error.code === 'RAZORPAY_NOT_CONFIGURED' ? 503 : 502;
        return fail(res, status, 'REFUND_FAILED', error.message);
      }

      const rupees = money((Number(refund.amount) || 0) / 100);
      const note = settledNote(refund, rupees, who, reason).slice(0, 200);

      let saved = null;
      try {
        saved = await recordRefund(orderNumber, order, {
          reference: refund.id,
          /* Razorpay's own figure out of Razorpay's own response. The order's
             `grandTotal` is what we think it charged; this is what it actually
             sent back, and where those two ever disagree the second one is the
             true one. */
          amountPaise: Number(refund.amount) || 0,
          at: new Date(),
          by: who,
          channel: 'razorpay',
          gatewayStatus: refund.status || 'requested',
          note,
        });
      } catch (error) {
        /*
         * The money HAS moved and we could not write it down.
         *
         * Answered as a success with `recorded: false` rather than as a 500,
         * because a 500 here reads as "the refund failed" and the one thing
         * that must not happen next is somebody sending it again. The refund
         * id is in the payload and in the log, and the settle-by-hand route
         * below exists precisely so it can be put back onto the row.
         */
        logError('recording a completed refund', error);
        console.error(
          `${BADGE} [Refund UNRECORDED] ${orderNumber} · refund ${refund.id} · ₹${rupees} · `
          + `by ${who} — the money moved and the order was NOT updated. Record it by hand.`,
        );
        return res.json({
          success: true,
          recorded: false,
          warning: 'The refund went through but the order could not be updated. '
            + `Record refund ${refund.id} against ${orderNumber} by hand before anybody `
            + 'retries it.',
          data: {
            orderNumber,
            refund: {
              state: 'settled', channel: 'razorpay', reference: refund.id, at: null, by: who, note,
            },
          },
        });
      }

      /*
       * The conditional update matched nothing, which here means one thing: in
       * the moment this refund was in the air, another process wrote a refund
       * onto the same order. That is not a failure and must not be reported as
       * one — the idempotency key means the gateway moved the money exactly
       * once however many callers asked — so the order is re-read and answered
       * as the settled row it now is. `recorded: true` is the truth: it IS
       * recorded, just not by this request.
       *
       * If it somehow comes back with no refund on it at all, the row has
       * changed under us in a way nothing here can explain, and the honest
       * answer is the same one a save failure gets: say the money moved, say it
       * is not written down, and name the reference.
       */
      if (!saved) {
        const fresh = await loadOrder(req);
        const record = fresh && refundRecordOf(fresh);
        if (record) {
          console.log(
            `${BADGE} [Refunded] ${orderNumber} · ₹${rupees} · ${refund.id} · recorded by `
            + `another writer as ${record.reference} · attempted by ${who}`,
          );
          return res.json({
            success: true,
            recorded: true,
            message: `₹${rupees.toFixed(2)} is on its way back to ${order.customerName || 'the diner'}.`,
            data: detailOf(fresh.toObject()),
          });
        }
        console.error(
          `${BADGE} [Refund UNRECORDED] ${orderNumber} · refund ${refund.id} · ₹${rupees} · `
          + `by ${who} — the money moved and the order would not take the record. By hand.`,
        );
        return res.json({
          success: true,
          recorded: false,
          warning: 'The refund went through but the order could not be updated. '
            + `Record refund ${refund.id} against ${orderNumber} by hand before anybody `
            + 'retries it.',
          data: {
            orderNumber,
            refund: {
              state: 'settled', channel: 'razorpay', reference: refund.id, at: null, by: who, note,
            },
          },
        });
      }

      console.log(
        `${BADGE} [Refunded] ${orderNumber} · ₹${rupees} · ${refund.id} · `
        + `${refund.status || 'requested'} · by ${who}${reason ? ` — "${reason}"` : ''}`,
      );

      return res.json({
        success: true,
        recorded: true,
        message: `₹${rupees.toFixed(2)} is on its way back to ${order.customerName || 'the diner'}.`,
        data: detailOf(saved.toObject()),
      });
    } finally {
      inFlight.delete(orderNumber);
    }
  } catch (error) {
    logError('admin/food-orders/:orderNumber/refund', error);
    return next(error);
  }
};

/* ── POST /:orderNumber/refund/settled ────────────────────────────────────*/

/**
 * Somebody refunded it in the Razorpay dashboard. Say so, here.
 *
 * This will happen — it is what everybody has been doing since `markForRefund`
 * was written, and it is what somebody will do the next time this server
 * cannot reach the gateway. Without a way to record it the queue never empties:
 * the row stays "refund owed" for ever, the badge counts money that is already
 * back in a student's account, and the first person to trust the badge sends it
 * a second time.
 *
 * A reference is REQUIRED. A note saying money moved without saying where is
 * not a record, and this row is the only reconciliation the order will ever
 * have.
 *
 * ## As safe as the gateway path, and it was not
 *
 * This route makes no network call, which made it look like the harmless half
 * of the pair. It is not: it is a CLAIM that money moved, it takes an order out
 * of the queue, and it is believed by everybody afterwards. It used to read the
 * order, check it had no refund, then save one — three statements with two gaps
 * in them — and it took neither the `inFlight` guard the refund button takes
 * nor any condition on the write. Two posts landing together both read null and
 * both wrote, and the order ended up carrying two settlements naming two
 * references, which is worse than carrying none: the second one is somebody
 * asserting a refund that may never have happened, and now nobody looks again.
 *
 * It now takes the same two guards, in the same order, for the same reasons:
 * `inFlight` closes the same-process double-click before anything is read, and
 * `recordRefund` carries the "only if it has none" condition into the write
 * itself, which is the one that holds across processes.
 */
// @route   POST /api/v1/admin/food-orders/:orderNumber/refund/settled
// @desc    Record a refund that was made by hand, outside this app
// @access  Admin console — Super Admin / Admin only
const recordSettledRefund = async (req, res, next) => {
  const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();

  try {
    if (!isUp()) return dbDown(res);

    if (inFlight.has(orderNumber)) {
      return fail(
        res, 409, 'REFUND_IN_FLIGHT',
        'That refund is already going through. Give it a moment and reload the order.',
      );
    }

    const order = await loadOrder(req);
    if (!order) return fail(res, 404, 'NOT_FOUND', 'No order with that number.');

    const already = refundRecordOf(order);
    if (already) {
      return fail(
        res, 409, 'ALREADY_REFUNDED',
        `${order.orderNumber} is already recorded as refunded — `
        + `${already.reference || 'no reference'}${already.by ? `, by ${already.by}` : ''}.`,
      );
    }

    const owed = owedState(order);
    if (!owed.owed) return fail(res, 409, 'NOT_OWED', owed.why);

    const body = req.body || {};
    /* No `·` in either field — it is the separator the human note is built on,
       and a reference carrying one would split its own sentence in half. The
       record itself no longer depends on that, but the line a person reads
       does. */
    const reference = String(body.reference || '').trim().replace(/·/g, ' ').slice(0, 64);
    if (!reference) {
      return fail(
        res, 400, 'BAD_INPUT',
        'Give the reference this was refunded under — the Razorpay refund id, or the bank '
        + 'reference. It is the only thing that lets anybody match this order to the money later.',
      );
    }
    const note = String(body.note || '').trim().replace(/·/g, ' ').slice(0, 80);
    const who = adminName(req);

    /*
     * How much went back, if whoever did it knows.
     *
     * Optional, and 0 when it is not given — which the record documents as
     * "nobody wrote it down", not as "nothing". The tempting default is the
     * order's own `grandTotal`, and it is exactly the wrong one: this route
     * exists because the money moved somewhere this server cannot see, so a
     * figure filled in from our side of the ledger would be a guess wearing the
     * clothes of a fact. Nothing here invents a number, for the same reason the
     * gateway call does not send one.
     */
    const rawAmount = body.amount;
    let amountPaise = 0;
    if (rawAmount !== undefined && rawAmount !== null && String(rawAmount).trim() !== '') {
      const rupees = Number(rawAmount);
      if (!Number.isFinite(rupees) || rupees < 0) {
        return fail(
          res, 400, 'BAD_INPUT',
          'The amount refunded has to be a number of rupees, or left out entirely.',
        );
      }
      amountPaise = Math.round(rupees * 100);
    }

    const line = byHandNote(reference, who, note).slice(0, 200);

    inFlight.add(orderNumber);
    let saved;
    try {
      saved = await recordRefund(orderNumber, order, {
        reference,
        amountPaise,
        at: new Date(),
        by: who,
        channel: 'manual',
        /* No gateway was involved, so there is no gateway status to report.
           Empty rather than a word of our own invention — `channel` already
           says this one was settled by hand. */
        gatewayStatus: '',
        note: line,
      });
    } finally {
      inFlight.delete(orderNumber);
    }

    /*
     * The condition refused it, so between the read above and this write
     * somebody else recorded a refund on this order. Answered as the same 409
     * the read-side check answers, off the row as it actually now stands —
     * a claim that lost a race is not a claim that gets written down.
     */
    if (!saved) {
      const fresh = await loadOrder(req);
      const record = fresh && refundRecordOf(fresh);
      return fail(
        res, 409, 'ALREADY_REFUNDED',
        `${orderNumber} is already recorded as refunded — `
        + `${(record && record.reference) || 'no reference'}`
        + `${record && record.by ? `, by ${record.by}` : ''}. `
        + `Nothing was recorded against ${reference}.`,
      );
    }

    console.log(
      `${BADGE} [Refund settled by hand] ${saved.orderNumber} · ₹${money(saved.grandTotal)} · `
      + `${reference} · by ${who}${note ? ` — "${note}"` : ''}`,
    );

    return res.json({
      success: true,
      message: `${saved.orderNumber} is recorded as refunded under ${reference}.`,
      data: detailOf(saved.toObject()),
    });
  } catch (error) {
    logError('admin/food-orders/:orderNumber/refund/settled', error);
    return next(error);
  }
};

module.exports = {
  listOrders,
  getCounts,
  getOrder,
  markDelivered,
  issueRefund,
  recordSettledRefund,
  /* Exported so anything that later needs to ask the badge's own question asks
     it the same way, rather than writing a fourth copy of the filter. */
  needsHumanFilter,
  refundOwedFilter,
  STUCK_MINUTES,
};
