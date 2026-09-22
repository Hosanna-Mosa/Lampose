/* ══════════════════════════════════════════════════════════════════════════
   The `food_orders` collection — a diner's order at a partner restaurant.

   ## One row, read by three apps

   This is the only place the food-delivery loop meets. A diner writes it from
   the User App, a kitchen moves it forward from the Food-Partner app, and a
   rider moves it forward from the Driver app — three identity systems, three
   controllers, one document. There is deliberately no second collection for
   the delivery: a "deliveries" table alongside this one would be two rows that
   can disagree about whether an order was delivered, and the one that was
   wrong would be the one the settlement report read.

   The prefix follows the same rule as `food_restaurants` and `food_products`:
   `orders` unprefixed is exactly the sort of name a second feature collides
   with a year later.

   ## Status is a one-way street, and each party may only take some of it

   The lifecycle below runs forwards. `ALLOWED_PARTNER_TRANSITIONS` is what a
   restaurant may do from each state and `ALLOWED_RIDER_TRANSITIONS` is what a
   rider may do, and both are enforced in the controllers rather than trusted
   from the request: a kitchen marking an order `delivered` before a rider has
   it, or reopening a `cancelled` order, is how a settlement report stops
   adding up.

   `placed -> accepted -> preparing -> ready -> picked_up -> delivered`
   with `cancelled` and `rejected` reachable only from the early states.

   ## Two tracks run in parallel, and only one of them is `status`

   `status` is the KITCHEN's track: placed, accepted, preparing, ready. The
   rider's track is `dispatch.state` — searching, assigned, unassigned — and
   it advances independently, because a restaurant is cooking at the same
   moment a rider is being found. Folding the search into `status` would mean
   an order could not be both "being cooked" and "looking for a rider", which
   is what every order is for its first two minutes.

   The two tracks MEET at `picked_up`: that is the hand-over, it needs both a
   cooked order and a rider holding it, and it is the rider who sets it. Which
   is why `picked_up` and `delivered` were already absent from the partner's
   allowed moves before there was a rider to take them.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const mongoose = require('mongoose');

const { addressLine } = require('../../shared/utils/address');

const ORDER_STATUSES = [
  'placed',
  'accepted',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'rejected',
  'cancelled',
];

/**
 * What the RESTAURANT is allowed to move an order to, from each state.
 *
 * Deliberately narrower than the full status list. `picked_up` and `delivered`
 * belong to the rider, and a kitchen that could set them would be reporting a
 * hand-over that never happened; `cancelled` belongs to the customer. A
 * restaurant rejects, it does not cancel — the two words mean different things
 * to whoever reads the report afterwards.
 */
const ALLOWED_PARTNER_TRANSITIONS = {
  placed: ['accepted', 'rejected'],
  accepted: ['preparing', 'rejected'],
  preparing: ['ready'],
  ready: [],
  picked_up: [],
  delivered: [],
  rejected: [],
  cancelled: [],
};

/**
 * What the RIDER is allowed to move an order to, from each state.
 *
 * Two moves, both of them hand-overs, both of them gated on a code the other
 * party reads out — see `pickupCode` and `deliveryOtp` below. `ready` is the
 * only state a pickup can start from: a rider who could mark `picked_up` while
 * the kitchen is still cooking would be starting the delivery clock on food
 * that does not exist, and the diner's ETA is derived from that moment.
 */
const ALLOWED_RIDER_TRANSITIONS = {
  placed: [],
  accepted: [],
  preparing: [],
  ready: ['picked_up'],
  picked_up: ['delivered'],
  delivered: [],
  rejected: [],
  cancelled: [],
};

/**
 * Where an order was placed. See `channel` below.
 *
 *   web   the website (lampose.com). The restaurant says who delivers — its own
 *         person, or a Lampose driver asked for on WhatsApp — and the diner
 *         confirms the hand-over with a button.
 *   app   the mobile app. Unchanged: once the restaurant accepts, the system
 *         searches for a real driver in the driver app, and the driver confirms
 *         the hand-over with the diner's code.
 */
const CHANNELS = ['web', 'app'];

/**
 * How a restaurant can say an order travels. See `delivery.method` below.
 * (The empty string — "not decided" — is the schema's default, not a choice.)
 */
const DELIVERY_METHODS = ['self', 'driver'];

/**
 * Is this a delivery order that came from the website — so the restaurant is
 * the one who arranges how it travels?
 *
 * A pickup order has nobody to arrange. An order that already has a delivery
 * method counts as a website order whatever its `channel` says: the method can
 * only have been set through the website's flow, and orders written before
 * `channel` existed must not lose it.
 */
const isWebDelivery = (order) => Boolean(
  order
  && order.fulfilment !== 'pickup'
  && (order.channel === 'web' || (order.delivery && DELIVERY_METHODS.includes(order.delivery.method))),
);

/** Did the restaurant itself decide who brings this — its own person, or the desk's driver? */
const restaurantArrangedDelivery = (order) => Boolean(
  order
  && order.fulfilment !== 'pickup'
  && order.delivery
  && DELIVERY_METHODS.includes(order.delivery.method),
);

/**
 * May the diner be told "a driver has been assigned"?
 *
 *   self     yes, the moment the restaurant says so — nobody else has to agree.
 *   driver   only once the WhatsApp to the desk has actually gone out. Telling
 *            a diner a driver is coming on the strength of a message that
 *            bounced is the one thing this must never do; until it has gone the
 *            diner sees "arranging a driver" and the restaurant sees why.
 */
const driverAssigned = (order) => {
  if (!restaurantArrangedDelivery(order)) return false;
  const { method, request } = order.delivery;
  return method === 'self' || Boolean(request && request.ok === true);
};

/**
 * The moves a RESTAURANT may make on this order right now.
 *
 * `ALLOWED_PARTNER_TRANSITIONS` is the rule for every order, and it stops at
 * `ready` because the rest belongs to a rider. An order the restaurant is
 * delivering — or has handed to the desk's driver, who is not in this system —
 * has no rider account to say the delivery boy has taken it, so the restaurant
 * does: `picked_up`, and the diner is told.
 *
 * And NOTHING after that. "Delivered" is not the restaurant's to say on these
 * orders: it is the DINER who received the food, so it is the diner's button on
 * the website (or the Lampose admin's, for one the diner never closed). A
 * restaurant that could mark its own order delivered would be reporting a
 * hand-over it cannot see, and it is paid when that word is written. See
 * `confirmMyDelivery` in `foodCustomerOrder.controller.js` and `markDelivered`
 * in `foodOrderAdmin.controller.js`.
 */
const partnerMovesFor = (order) => {
  const base = ALLOWED_PARTNER_TRANSITIONS[order && order.status] || [];
  if (!restaurantArrangedDelivery(order)) return base;
  if (order.status === 'ready') return ['picked_up'];
  if (order.status === 'picked_up') return [];
  return base;
};

const PAYMENT_MODES = ['online', 'cod'];
const PAYMENT_STATUSES = ['pending', 'paid', 'refunded', 'failed'];

/**
 * How the money got back, once it has.
 *
 * `razorpay` is a refund the gateway actually processed and gave us an id for.
 * `manual` is one a person made somewhere else — the Razorpay dashboard, a bank
 * transfer — and then wrote down here. The empty string is "no refund", and it
 * is a member of the enum rather than an absent field because every other
 * `razorpay.*` key on this document is a present-but-empty default too, and one
 * field that answers "missing" while its neighbours answer "" is a field every
 * reader has to special-case.
 */
const REFUND_CHANNELS = ['', 'razorpay', 'manual'];

/**
 * The rider track, which runs beside `status` rather than inside it.
 *
 *   idle        nothing has been asked for yet. A pickup order stays here for
 *               its whole life, and so does an online order that has not been
 *               paid — no rider is sent for food nobody has paid for.
 *   searching   offers are going out, one rider at a time, nearest first.
 *   assigned    a rider accepted and is carrying it.
 *   unassigned  every candidate declined or timed out, or the assigned rider
 *               dropped it. NOT a failure state: it is re-enterable, and the
 *               dispatcher retries from it when the kitchen marks the order
 *               ready. The distinction matters because the diner is told
 *               something different — "still looking" rather than "no luck".
 */
const DISPATCH_STATES = ['idle', 'searching', 'assigned', 'unassigned'];

/**
 * How an offer ended. Recorded per rider so a pattern is visible later.
 *
 * `timeout` is a fossil now — dispatch broadcasts to everyone in range at
 * once rather than offering one rider a fifteen-second turn, so nothing
 * individually times out any more. Left in the enum rather than removed: an
 * order placed before the broadcast rewrite may still carry rows written
 * with it, and a schema that can no longer represent its own history is
 * worse than one carrying an outcome nothing writes any more.
 *
 * `superseded` is the new one: this rider's offer was still open when
 * somebody else accepted the order. Different from `cancelled` (the ORDER
 * stopped needing a rider at all) and from `declined` (THIS rider said no) —
 * neither is true here, and folding this into either would misreport why an
 * order that got delivered fine shows up against this rider's record.
 */
const OFFER_OUTCOMES = ['offered', 'accepted', 'declined', 'timeout', 'cancelled', 'superseded'];

const ALPHABET = '0123456789';

/** Short, readable down a phone line, and unique enough for a day's volume. */
const makeOrderNumber = () => {
  let tail = '';
  for (let i = 0; i < 6; i += 1) {
    tail += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `LO${tail}`;
};

/**
 * A four-digit hand-over code.
 *
 * `crypto.randomInt` rather than `Math.random`: this one is read out to decide
 * whether food changes hands, and a predictable sequence would let somebody
 * holding one order's code guess the next order's. Four digits is only 10,000
 * values, so it is not a secret — it is a check that two people are standing
 * in the same place, and it is checked against ONE order rather than looked up.
 */
const makeHandoverCode = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

/**
 * A `food_restaurants` row, reduced to the three things a rider needs.
 *
 * One definition, here rather than at each call site, because it is written at
 * placement and filled in again for orders older than the field — and two
 * hand-rolled versions of "what the kitchen is called" would be two answers to
 * the same question on two screens of the same app.
 *
 * `addressLine` is the shared one from `shared/utils/address.js`, so what a
 * rider is told to find is assembled exactly the way the diner's own address
 * is. Anything missing comes back as an empty string; nothing here guesses.
 */
const restaurantSnapshot = (restaurant) => ({
  name: String((restaurant && restaurant.restaurantName) || '').trim(),
  address: addressLine(restaurant && restaurant.address),
  phone: String((restaurant && restaurant.contactNumber) || '').trim(),
});

/*
 * A line is a SNAPSHOT, not a reference.
 *
 * The product it came from can be renamed, repriced or deleted the same
 * afternoon, and an order has to keep saying what was actually bought for what
 * it was actually charged. `productId` is kept for reconciliation and is
 * deliberately not a populated ref.
 */
const orderLineSchema = new mongoose.Schema(
  {
    productId: { type: String, default: '' },
    productName: { type: String, required: true, trim: true },
    variantName: { type: String, default: '', trim: true },
    addOns: [{ name: { type: String, trim: true }, price: { type: Number, min: 0, default: 0 } }],
    quantity: { type: Number, required: true, min: 1, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    isVeg: { type: String, enum: ['veg', 'non-veg', 'egg'], default: 'veg' },
    note: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    /** Who moved it: 'partner', 'customer', 'rider', 'system', 'admin'. */
    by: { type: String, default: 'system' },
    note: { type: String, default: '', trim: true },
  },
  { _id: false },
);

/*
 * The three authors whose notes are somebody else's words.
 *
 * `system` and `admin` notes are written by this server, in sentences it chose.
 * These three are not: a diner's cancellation reason, a kitchen's, and a
 * rider's release reason all arrive in a request body and are stored verbatim.
 * They are the ones that get stamped below.
 *
 * The label is what a person reading the history sees, not the token: "Customer"
 * rather than "customer", because this line is read on a screen.
 */
const QUOTED_NOTE_AUTHORS = { customer: 'Customer', partner: 'Restaurant', rider: 'Rider' };

/*
 * GeoJSON, [LONGITUDE, LATITUDE] — the same shape and the same warning as
 * `foodRestaurant.model.js` and `driver.model.js`. Swapping the pair does not
 * throw; it puts the pickup 500km out to sea and the dispatcher reports "no
 * riders nearby" rather than a fault.
 *
 * Defaults to `undefined` rather than to an empty object, because a document
 * carrying `{ type: 'Point' }` and no coordinates is rejected by the 2dsphere
 * index at insert time — which would refuse every order placed by a diner who
 * declined location access, and those are ordinary orders.
 */
const orderPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (pair) => Array.isArray(pair) && pair.length === 2
          && Number.isFinite(pair[0]) && Number.isFinite(pair[1])
          && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90,
        message: 'coordinates must be [longitude, latitude] and in range.',
      },
    },
  },
  { _id: false },
);

/*
 * One offer, to one rider.
 *
 * Kept as a list rather than as "the last rider we asked", because the
 * questions worth answering later are about the sequence: how many riders were
 * asked before one accepted, whether one rider declines everything, whether an
 * area is running out of candidates at 9pm. A single field answers none of
 * them, and the row is written once per offer either way.
 */
const offerSchema = new mongoose.Schema(
  {
    driverId: { type: String, required: true },
    /* Metres, at the moment of the offer. Not recomputed later — it is what
       the dispatcher decided on, and a rider who has since moved does not
       change what the decision was. */
    distanceMeters: { type: Number, default: 0 },
    offeredAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
    outcome: { type: String, enum: OFFER_OUTCOMES, default: 'offered' },
    reason: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const foodOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },

    /* The restaurantId STRING, matching every other id this module hands out.
       Mixing a string id and an ObjectId ref is how a join quietly returns
       nothing — see the same note on foodProduct.model.js. */
    restaurantId: { type: String, required: true, index: true },

    /* The `app_customers` id, NOT the Mongo _id — the same string-id rule the
       rest of this module follows. Indexed because "my orders" is the query a
       diner runs most, and unset only for an order placed before accounts
       were required. */
    customerId: { type: String, default: '', index: true },
    customerName: { type: String, default: '', trim: true },
    customerPhone: { type: String, default: '', trim: true },
    deliveryAddress: { type: String, default: '', trim: true },

    /* Whether anybody has to carry this at all. A pickup order never enters
       dispatch, and the difference has to be a stored field rather than
       "deliveryAddress is empty" — an empty address is also what a delivery
       order looks like when the diner's address failed to save, and those two
       must not be the same case to the dispatcher. */
    fulfilment: { type: String, enum: ['delivery', 'pickup'], default: 'delivery' },

    /*
     * Where the order was placed — the website or the app. See `CHANNELS`.
     *
     * It decides who arranges the delivery: on a `web` order the restaurant
     * chooses (its own person, or a Lampose driver); on an `app` order the
     * dispatcher finds a real driver, exactly as it always has. Defaults to
     * `app`, so an order written before this field existed, or by a client that
     * does not send it, keeps the flow it was placed under.
     */
    channel: { type: String, enum: CHANNELS, default: 'app', index: true },

    /*
     * The two ends of the ride, snapshotted onto the order.
     *
     * `pickupLocation` is copied from the restaurant rather than joined at
     * dispatch time, because a restaurant that moves its pin — or is edited
     * mid-service — must not move an order that is already out. `dropLocation`
     * is where the diner said to go, and is absent when they ordered without
     * granting location access, which is an ordinary case the matcher handles
     * by falling back to the restaurant's own position for distance.
     */
    pickupLocation: { type: orderPointSchema, default: undefined },
    dropLocation: { type: orderPointSchema, default: undefined },

    /*
     * Who the rider is actually riding TO, in words.
     *
     * A SNAPSHOT, for the same reason `delivery` snapshots the rider and a
     * line snapshots its dish — but this one was missing, and its absence had
     * a visible cost: `riderView` could only send `restaurantId`, so the
     * Driver app printed `FP-XXXXXXXX` as the heading on the pickup card and
     * its "call the restaurant" button dialled an empty string. A rider
     * standing in a market needs a NAME and a door, and neither of them was
     * anywhere on the row they were given.
     *
     * Copied at placement rather than joined at read time because the rider's
     * screens are on a phone on a scooter and a join per job card is a second
     * query for a value that must not change under an order anyway: a kitchen
     * that renames itself or moves at 8pm must not rename or move an order
     * that is already out.
     *
     * Empty strings are a real answer and every reader is built for them —
     * `restaurantSnapshot` never invents a number. `phone` is `contactNumber`,
     * the shop's own line, and deliberately NOT `ownerPhone`: the model keeps
     * those two apart precisely so an owner's personal handset does not get
     * printed in somebody else's app, and a rider is somebody else.
     */
    restaurant: {
      name: { type: String, default: '', trim: true },
      address: { type: String, default: '', trim: true },
      phone: { type: String, default: '', trim: true },
    },

    lines: { type: [orderLineSchema], default: [] },

    itemsTotal: { type: Number, default: 0, min: 0 },

    /*
     * The restaurant's own packaging charge — NO LONGER CHARGED.
     *
     * Kept because orders placed before it was dropped carry a real figure
     * here and their receipts have to keep adding up. Nothing writes it any
     * more; `foodCharges.util.js` replaced it with GST and a platform fee.
     * Removing the column would silently reduce the total of every historical
     * order that had one.
     */
    packagingCharge: { type: Number, default: 0, min: 0 },

    /*
     * GST, and the rate it was charged at.
     *
     * Stored rather than derived for the same reason `commissionRate` is: a
     * rate can change, and a historical order must keep the one it was billed
     * under. An order written before this field existed reads 0, which is
     * exactly what it was charged.
     */
    gst: { type: Number, default: 0, min: 0 },
    gstRate: { type: Number, default: 0, min: 0 },

    /** The flat platform fee. Charged on pickup as well as delivery. */
    platformFee: { type: Number, default: 0, min: 0 },

    deliveryFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    /* What the restaurant is actually owed once commission comes off. Stored
       rather than derived, because the commission rate can be renegotiated and
       a historical order must keep the rate it settled at. */
    partnerPayout: { type: Number, default: 0, min: 0 },

    /*
     * The payout request that has claimed this order's `partnerPayout`.
     *
     * `null` means the money is still available for the kitchen to request.
     * A `FPO-` id means some request already counts it, and it must not be
     * counted again — which is the whole job of this field.
     *
     * It is a CLAIM STAMP, not a record of payment. It is set the moment a
     * request is created, long before anybody transfers anything, and it is
     * set inside an update scoped on `payoutId: null` so that two requests
     * arriving together cannot both take the same order: the second update
     * matches nothing, and the total is recomputed from the orders that
     * actually came back rather than from the ones that were read a moment
     * earlier. `foodPayout.service.js` is where that happens, and
     * `partners/payout.service.js` is where the pattern comes from.
     *
     * A refused request clears it again, or the money would vanish from the
     * kitchen's balance with nothing to show for it.
     */
    payoutId: { type: String, default: null, index: true },
    commissionRate: { type: Number, default: 15, min: 0, max: 100 },

    paymentMode: { type: String, enum: PAYMENT_MODES, default: 'cod' },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },

    /*
     * The gateway's side of an online order.
     *
     * `orderId` is minted when the diner reaches the payment screen;
     * `paymentId` and `paidAt` are written ONLY by a verified signature —
     * either the in-app verify call or the webhook, which share one
     * implementation for exactly that reason. Nothing else in this codebase
     * may set `paymentStatus: 'paid'`; see `razorpay.js`, which is the whole
     * of the trust boundary.
     *
     * Absent entirely on a cash order, which is the honest shape: there is no
     * gateway reference for money that has not gone through one.
     *
     * ## And the four facts of money going BACK
     *
     * For a while this sub-document held only the arriving half, and a refund
     * had nowhere structured to live. It was written as free text into a
     * `statusHistory` note and read back by matching on that text — which was
     * the only room there was at the time, and which was a hole: `statusHistory`
     * is not an admin-only array. `foodCustomerOrder.cancelMyOrder` pushes the
     * DINER'S own cancellation reason into it verbatim, so a diner who typed a
     * reason shaped like the settled-refund line made their own order read as
     * already refunded and dropped it out of the queue that exists to make sure
     * they get paid back. A ledger a debtor can write in is not a ledger.
     *
     * So the refund lives here, in named fields, and every decision — is this
     * order still owed money, may this button be pressed, has this already been
     * sent — is made from these and from nothing else. The `statusHistory` note
     * is still written, because a human reading the order's story deserves the
     * sentence, but it decides nothing.
     *
     * `refundId` is the one that means "this money is gone": non-empty is the
     * whole of the test, which is why every writer sets it last-and-together
     * with the rest in one atomic update. `refundAmountPaise` is what actually
     * went back — Razorpay's own figure from its own response, never a number
     * we computed — and 0 on a hand-settled refund means "nobody recorded how
     * much", not "nothing". `refundStatus` is the gateway's own word for it
     * (`processed`, `pending`), empty when no gateway was involved.
     */
    razorpay: {
      orderId: { type: String, default: '' },
      paymentId: { type: String, default: '' },
      amountPaise: { type: Number, default: 0, min: 0 },
      paidAt: { type: Date, default: null },
      refundId: { type: String, default: '' },
      refundAmountPaise: { type: Number, default: 0, min: 0 },
      refundedAt: { type: Date, default: null },
      /* The administrator who authorised it, by name, off their own token —
         never off a request body. Internal: `customerView` strips it. */
      refundedBy: { type: String, default: '' },
      refundChannel: { type: String, enum: REFUND_CHANNELS, default: '' },
      refundStatus: { type: String, default: '' },
      /* The same human sentence that goes into `statusHistory`, kept beside the
         facts it summarises so that reading a refund back is one field access
         rather than a walk through history looking for text. Internal. */
      refundNote: { type: String, default: '' },
    },

    status: { type: String, enum: ORDER_STATUSES, default: 'placed', index: true },
    statusHistory: { type: [statusEventSchema], default: [] },

    /*
     * ── The rider track ──────────────────────────────────────────────────
     * Runs beside `status`, not inside it — see the header.
     */
    dispatch: {
      state: { type: String, enum: DISPATCH_STATES, default: 'idle', index: true },
      /* How many riders were in the shortlist when the search began. The
         diner is not shown this; it is what tells an operator afterwards
         whether "no rider found" meant nobody was online or everybody said no. */
      candidateCount: { type: Number, default: 0, min: 0 },
      startedAt: { type: Date, default: null },
      /* How many full sweeps have run. A sweep that finds nobody is retried
         when the kitchen marks the order ready, and this is the ceiling that
         stops an order retrying forever against an empty city. */
      attempts: { type: Number, default: 0, min: 0 },
      /* How far the broadcast currently reaches, in metres — the kitchen's
         prep-time quote converted to a distance, then grown each time nobody
         nearby has taken it and there is still time before the food is
         ready. Stored rather than only held in memory so a widen step never
         shrinks after a restart: the next one always adds to this number,
         never recomputes from scratch. */
      radiusMeters: { type: Number, default: 0, min: 0 },
      offers: { type: [offerSchema], default: [] },
      /* Why the last sweep ended without a rider, in words an operator can
         read. Empty while a search is live. */
      failureReason: { type: String, default: '', trim: true },
    },

    /*
     * ── The rider who is actually carrying it ────────────────────────────
     *
     * A SNAPSHOT of the rider beside the id, for the same reason an order line
     * snapshots its dish: a rider can change their number or their plate the
     * same afternoon, and the order has to keep saying who actually delivered
     * it. `driverId` is kept for reconciliation and is deliberately not a
     * populated ref — the same string-id rule the rest of this module follows.
     */
    delivery: {
      driverId: { type: String, default: '', index: true },
      driverName: { type: String, default: '', trim: true },
      driverPhone: { type: String, default: '', trim: true },
      vehicle: {
        type: { type: String, default: '' },
        model: { type: String, default: '' },
        plate: { type: String, default: '' },
      },
      assignedAt: { type: Date, default: null },
      pickedUpAt: { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
      /* What the rider is paid for this job. Stored rather than derived, the
         same way `partnerPayout` is: the rate can be renegotiated and a
         historical order must keep the one it settled at. */
      earnings: { type: Number, default: 0, min: 0 },
      /* Metres from the rider to the restaurant when they accepted. Kept
         because it is the one number that says whether the matcher is
         actually choosing near riders. */
      acceptedFromMeters: { type: Number, default: 0, min: 0 },

      /*
       * ── Who is bringing it, as the RESTAURANT decided ─────────────────────
       *
       * Chosen in the console when the order is accepted (or afterwards, from
       * the same screen). See `foodDelivery.service.js`.
       *
       *   ''        nobody has decided. The automatic app-rider search
       *             (`dispatch`) is in charge — how every order worked before
       *             this choice existed, and still how one accepted from a
       *             partner app that does not send it.
       *   'self'    the restaurant's own delivery person.
       *   'driver'  a Lampose driver, asked for on WhatsApp through the
       *             delivery desk. No rider is searched for in the app: the
       *             desk sends somebody, and two riders for one bag is worse
       *             than none.
       *
       * The diner is told "driver assigned" for BOTH — see `driverAssigned`.
       * There is no `driverId` behind either: the restaurant's own person and
       * the desk's driver are not accounts in this system, and inventing one
       * to hang the fact on would put a person into the rider fleet who is not
       * in it.
       */
      method: { type: String, enum: ['', 'self', 'driver'], default: '' },
      methodChosenAt: { type: Date, default: null },
      /*
       * The WhatsApp to the desk, and what came of it. Only meaningful when
       * `method` is 'driver'; kept whole so the console can say "sent" or
       * "could not be sent, and why", and so a retry knows how many there have
       * been. `ok` is the verdict the diner's screen turns on.
       */
      request: {
        to: { type: String, default: '' },
        sentAt: { type: Date, default: null },
        ok: { type: Boolean, default: false },
        messageSid: { type: String, default: '' },
        error: { type: String, default: '' },
        attempts: { type: Number, default: 0, min: 0 },
      },
    },

    /*
     * Two hand-over codes, and they are not credentials.
     *
     * `pickupCode` the KITCHEN reads out to the rider at the pass.
     * `deliveryOtp` the DINER reads out to the rider at the door.
     *
     * Stored in readable form on purpose — the same reasoning as the visit
     * flow's entry PIN in `otp.util.js`. They are values two people COMPARE,
     * so both sides must be able to be shown them again; hashing would make
     * the one thing they exist for impossible. What they prove is that the
     * two people were in the same place, which is exactly the claim a
     * hand-over makes, and neither of them opens anything on this server.
     *
     * Four digits, not six: they are read out across a counter in a noisy
     * kitchen, and every extra digit is another chance to mishear one.
     */
    pickupCode: { type: String, default: '' },
    deliveryOtp: { type: String, default: '' },

    /** Minutes the kitchen quoted when it accepted. */
    promisedMinutes: { type: Number, default: 0, min: 0 },
    rejectionReason: { type: String, default: '', trim: true },
    placedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/*
 * A note written by somebody outside this server says whose words it is.
 *
 * `statusHistory` looks like an internal audit trail and is not one: three of
 * its five authors are people holding phones, and their `note` is a request
 * body field stored verbatim. That was how a diner's cancellation reason came
 * to be able to impersonate a refund record — the reason went in unprefixed,
 * and the code that read the ledger back matched on the text.
 *
 * The ledger no longer lives in text (see `razorpay.refundId`), so this is not
 * what protects the money any more. It protects the PERSON READING: an
 * administrator scrolling an order's story should never have to wonder whether
 * a line that opens "Refund settled outside the app:" was written by the
 * company or typed by the diner who is owed it.
 *
 * The invariant is exact and worth stating: a note whose author is `customer`,
 * `partner` or `rider` always begins with that author's own label. So it can
 * never begin with anything else — not "Refund sent:", not "Payment received",
 * not any sentence this server writes in its own voice. A diner who types the
 * label themselves changes nothing: the note already starts with "Customer:"
 * and is left exactly as it is, which is the same guarantee.
 *
 * On the parent rather than on `statusEventSchema` because this must run for
 * every save of the order, including the array pushes that are the only way
 * these three authors ever write; and idempotent — re-stamping an already
 * stamped line is a no-op — because validation runs over the whole array on
 * every save, not only over the entry that was just added.
 *
 * An empty note is left empty. There is no sentence there to mistake for one.
 */
foodOrderSchema.pre('validate', function stampQuotedNotes(next) {
  const history = this.statusHistory;
  if (Array.isArray(history)) {
    history.forEach((event) => {
      const label = QUOTED_NOTE_AUTHORS[event && event.by];
      if (!label) return;
      const note = String(event.note || '').trim();
      if (!note || note.startsWith(`${label}: `)) return;
      event.note = `${label}: ${note}`.slice(0, 200);
    });
  }
  next();
});

/* The partner app's Orders tab is "this restaurant, newest first", optionally
   filtered by status. That is exactly this index. */
foodOrderSchema.index({ restaurantId: 1, status: 1, placedAt: -1 });
foodOrderSchema.index({ restaurantId: 1, placedAt: -1 });
/* The diner's own history, newest first. */
foodOrderSchema.index({ customerId: 1, placedAt: -1 });
/* "What am I carrying / what have I carried", the two queries the Driver app
   runs on every open. */
foodOrderSchema.index({ 'delivery.driverId': 1, placedAt: -1 });
/* The sweep that retries orders nobody took. Small and selective — almost
   every order is `idle` or `assigned`, so this index is mostly empty, which is
   exactly what makes it cheap. */
foodOrderSchema.index({ 'dispatch.state': 1, placedAt: 1 });

/* ── What the admin console's order desk asks ─────────────────────────────
 *
 * Every index above is a PARTNER's, a DINER's or a RIDER's question, and each
 * of them leads with the id of the party asking. The console asks about the
 * whole collection at once — "which orders anywhere are owed money", "the
 * newest fifty", "who has been open too long" — and none of those supplies a
 * leading equality, so every one of them was a collection scan on the endpoint
 * the console polls for its sidebar badge. These five are that shift's
 * questions, in the same style: the equality fields first, `placedAt` last
 * because it is always the sort and never the filter.
 */

/* The console's DEFAULT screen: no filter at all, newest first — and oldest
   first the moment somebody picks a work queue. One index serves both, because
   an index is walked in either direction. This is the only index on this
   collection with no leading equality, and it is here precisely because the
   console's first screen has nothing to supply one with. */
foodOrderSchema.index({ placedAt: -1 });

/* The refund desk. `refundOwedFilter` asks it as two branches — an order
   already flagged `refunded` with nothing sent, and a `paid` order that was
   cancelled or rejected — and this covers both: the first bounds on the first
   two fields, the second on all three. Selective where it counts, because
   `refunded` is a rare status and `paid` + `cancelled|rejected` is a rare pair.
   `placedAt` trails so the queue's oldest-first sort comes off the index rather
   than out of a blocking sort. */
foodOrderSchema.index({ paymentStatus: 1, paymentMode: 1, status: 1, placedAt: 1 });

/* "Open far too long", and the count of what is open at all. `status` alone is
   already indexed above, and this is that index plus the range the stuck filter
   actually asks for — a bound rather than a predicate applied to every open
   row. It also carries the console's status filter with its placedAt sort. */
foodOrderSchema.index({ status: 1, placedAt: 1 });

/* The search box, all three of the fields it is not already indexed on.
 *
 * An `$or` runs at the speed of its SLOWEST branch: one unindexed clause and
 * the planner falls back to a collection scan for the whole thing, however well
 * indexed the other three are. So the phone number and both gateway references
 * are indexed together — indexing only the one a review happened to name would
 * have left the search exactly as slow as it was.
 *
 * Plain single-field, not compound: each of these narrows to a handful of rows
 * on its own, and a sort over a handful is free. */
foodOrderSchema.index({ customerPhone: 1 });
foodOrderSchema.index({ 'razorpay.paymentId': 1 });
foodOrderSchema.index({ 'razorpay.orderId': 1 });

foodOrderSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

/* ── The refund ledger ────────────────────────────────────────────────────
 *
 * Three readers, and they are here rather than in the console's controller for
 * the reason `riderView` is here: whoever owns the SHAPE owns how it is read.
 * A hand-rolled second answer to "has this order been refunded" is a queue and
 * a button disagreeing about whether a student has been paid back.
 *
 * There are two of them because the question gets asked on both sides of the
 * wire — once as a Mongo filter, for the queue and its badge, and once in
 * JavaScript, for a row already in memory — and the pair MUST agree. They are
 * written side by side so that they can be read together, and the JS one is
 * defined in terms of the same two facts the filter matches on.
 */

/*
 * ## The rows that predate the field, and why there is no backfill
 *
 * Every refund recorded before `razorpay.refundId` existed lives only as a
 * `statusHistory` note. Those orders are read here, from the note, and nowhere
 * else — and ONLY when the note's author is `admin`.
 *
 * That `by: 'admin'` is the entire point. The note text alone was the hole: a
 * diner's cancellation reason lands in the same array, and matching on text
 * without asking who wrote it is what let a diner strike their own debt off the
 * books. `by` is set by the server at every one of the five call sites that
 * writes this array and is never taken from a request body — a diner's line is
 * stamped `customer` and a rider's `rider`, and the pre-validate hook above
 * additionally makes it impossible for either to even LOOK like this one.
 *
 * A one-time backfill script was the alternative and was not chosen, for three
 * reasons. It would be a new file outside this change's hands; a migration that
 * fails halfway leaves a real refund unreadable, which is the same argument
 * that kept `app_support_tickets` on a read-time mirror instead of a migration;
 * and a backfill has a window — every row written between the deploy and the
 * script running would need this fallback anyway. Reading old rows costs a
 * regex over a short array on rows a payment status has already narrowed, which
 * is what it cost before. Nothing new is ever written in the old shape, so the
 * fallback is a door that only closes.
 */
const LEGACY_SETTLED_PREFIX = '^Refund (sent|settled outside the app):';
const LEGACY_SETTLED_NOTE = new RegExp(`${LEGACY_SETTLED_PREFIX}\\s*([^·]*)`);
const LEGACY_SETTLED_EVENT = { by: 'admin', note: { $regex: LEGACY_SETTLED_PREFIX } };

/* The two ways an order can carry a refund, as Mongo sees them. `$gt: ''`
   rather than `$ne: ''` because it matches only non-empty STRINGS: a row from
   before the field existed has no `refundId` at all, and `$ne` would match it. */
const RECORDED_BRANCHES = () => [
  { 'razorpay.refundId': { $gt: '' } },
  { statusHistory: { $elemMatch: LEGACY_SETTLED_EVENT } },
];

/** Orders whose money has gone back. */
const refundRecordedFilter = () => ({ $or: RECORDED_BRANCHES() });

/**
 * Orders whose money has NOT gone back.
 *
 * `$nor` over the same two branches rather than a hand-written negation of
 * each, so the two filters are exact complements by construction and cannot
 * drift apart when a third way of recording a refund is added. It is not an
 * indexed clause and does not need to be: every caller applies it to rows a
 * payment status has already bounded.
 */
const refundNotRecordedFilter = () => ({ $nor: RECORDED_BRANCHES() });

/**
 * The refund this order carries, or null. The ONE reader.
 *
 * The structured record wins outright when it is there. The legacy note is
 * consulted only when it is not, and only for an admin-authored line.
 *
 * A legacy record answers 0 for `amountPaise` and '' for `gatewayStatus`, and
 * that is deliberate: both of those are in the old sentence as text, and
 * parsing a rupee figure back out of a log line to put it in a money column is
 * exactly the class of thing this whole change exists to stop. 0 means "nobody
 * recorded how much", which is true of those rows.
 */
const refundRecordOf = (order) => {
  const rp = (order && order.razorpay) || {};

  if (rp.refundId) {
    return {
      channel: rp.refundChannel || 'razorpay',
      reference: rp.refundId,
      at: rp.refundedAt || null,
      by: rp.refundedBy || '',
      note: rp.refundNote || '',
      amountPaise: rp.refundAmountPaise || 0,
      gatewayStatus: rp.refundStatus || '',
    };
  }

  /* The LAST matching line wins, as it always did. There should never be two,
     and if there are, the later one describes the world. */
  const history = (order && order.statusHistory) || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const event = history[i] || {};
    if (event.by === 'admin') {
      const text = String(event.note || '');
      const match = LEGACY_SETTLED_NOTE.exec(text);
      if (match) {
        const by = /·\s*by\s+([^·]+)/.exec(text);
        return {
          channel: match[1] === 'sent' ? 'razorpay' : 'manual',
          reference: String(match[2] || '').trim(),
          at: event.at || null,
          by: by ? by[1].trim() : '',
          note: text,
          amountPaise: 0,
          gatewayStatus: '',
        };
      }
    }
  }
  return null;
};

/**
 * The order as the RIDER is allowed to see it.
 *
 * An offer has to carry enough to decide — what it pays, where it is, how
 * far, and now where it is actually GOING, since a broadcast can mean
 * several riders judging the same trip against their own route rather than
 * one rider taking whatever the dispatcher decided was nearest. Still
 * notably absent: the diner's name, their phone number and the pickup
 * hand-over code. A rider who has not accepted yet has no business holding a
 * stranger's contact details, and all three appear the moment they do accept
 * (`revealed: true` below) — the drop ADDRESS is the one exception, visible
 * from the first offer.
 *
 * Written here rather than in the controller because three call sites need the
 * same shape — the socket offer, the poll fallback and the active-job read —
 * and three hand-rolled projections would be three chances to leak the phone
 * number from one of them.
 *
 * `restaurant` is the exception to "read it off the order", and only because
 * of history: the snapshot is written at placement, but every order placed
 * before that field existed has an empty one. So a caller that has already
 * looked the kitchen up may hand it in, and the stored snapshot is used when
 * they do not. Both routes end in the same three keys, and neither invents a
 * name or a number it does not have.
 */
const riderView = (order, { revealed = false, distanceMeters = null, restaurant = null } = {}) => {
  if (!order) return null;
  const doc = typeof order.toObject === 'function' ? order.toObject() : order;
  const delivery = doc.delivery || {};
  const kitchen = restaurant || doc.restaurant || {};

  return {
    orderNumber: doc.orderNumber,
    restaurantId: doc.restaurantId,
    /* The kitchen in words, beside the id rather than instead of it: the id is
       what support and the logs are read against, the name is what a rider
       reads on a card and the phone is what they press when the pass is
       empty. Always present, always three strings — an unknown one is '' and
       the app hides the button rather than dialling nothing. */
    restaurant: {
      name: kitchen.name || '',
      address: kitchen.address || '',
      phone: kitchen.phone || '',
    },
    status: doc.status,
    dispatchState: doc.dispatch ? doc.dispatch.state : 'idle',
    paymentMode: doc.paymentMode,
    paymentStatus: doc.paymentStatus,
    /* What the rider collects at the door, and zero when it is already paid.
       Two different jobs, and a rider who reads "₹0 to collect" on a prepaid
       order does not ask a diner for money they have already sent. */
    collectAmount: doc.paymentMode === 'cod' && doc.paymentStatus !== 'paid' ? doc.grandTotal : 0,
    earnings: delivery.earnings || 0,
    itemCount: (doc.lines || []).reduce((n, line) => n + (line.quantity || 0), 0),
    lines: (doc.lines || []).map((line) => ({
      productName: line.productName,
      variantName: line.variantName || '',
      quantity: line.quantity,
    })),
    pickup: {
      location: doc.pickupLocation ? doc.pickupLocation.coordinates : null,
      distanceMeters,
    },
    drop: {
      location: doc.dropLocation ? doc.dropLocation.coordinates : null,
      /*
       * The FULL address, whether or not the offer has been accepted.
       *
       * This used to be a landmark-only fragment pre-accept — the text
       * before the first `·` — which for this app's own "Room 204 · Sunrise
       * Hostel · Gate 2" convention meant showing the ROOM NUMBER and
       * hiding the hostel and gate, backwards from what a rider actually
       * needs to judge a trip before taking it. A room number identifies a
       * person; a hostel name identifies a place, and a rider deciding
       * whether a delivery is worth taking — more of them, at once, now
       * that dispatch broadcasts rather than offering one at a time — needs
       * the place, not a fragment chosen for being first alphabetically in
       * the string. Nothing about the diner's IDENTITY is here regardless:
       * `customerName` and `customerPhone` below still wait for accept.
       */
      address: doc.deliveryAddress || '',
    },
    /* Only after accepting. See above. */
    customerName: revealed ? (doc.customerName || '') : '',
    customerPhone: revealed ? (doc.customerPhone || '') : '',
    pickupCode: revealed ? (doc.pickupCode || '') : '',
    placedAt: doc.placedAt,
    promisedMinutes: doc.promisedMinutes || 0,
  };
};

/**
 * The "rider" an order shows when the RESTAURANT arranged who brings it.
 *
 * There is no driver account behind it, so this says who is bringing the food
 * rather than naming a person: "Lampose delivery partner" for the desk's
 * driver, "<Kitchen> delivery" for the restaurant's own. Same keys as the real
 * rider object so every screen that draws one draws this without a branch;
 * `kind` is what a screen can switch on when it wants different words.
 * No phone — neither party is one the diner should be dialling from a card.
 */
const chosenRider = (doc) => {
  const delivery = doc.delivery || {};
  const own = delivery.method === 'self';
  const kitchen = (doc.restaurant && doc.restaurant.name) || 'The restaurant';
  return {
    kind: own ? 'restaurant' : 'partner',
    name: own ? `${kitchen} delivery` : 'Lampose delivery partner',
    phone: '',
    vehicle: {},
    assignedAt: delivery.methodChosenAt || null,
    pickedUpAt: delivery.pickedUpAt || null,
    deliveredAt: delivery.deliveredAt || null,
    location: null,
    heading: null,
    at: null,
  };
};

/**
 * The order as the DINER is allowed to see it.
 *
 * Everything the tracking screen needs, and two things removed:
 *
 *   · `dispatch.offers` — the id of every rider who was asked and said no. It
 *     is operational data about people who have nothing to do with this diner,
 *     and a screen that never renders it should never receive it.
 *   · `partnerPayout` / `commissionRate` — what the restaurant nets is a
 *     commercial term between them and us. It has always been on the row and
 *     has never been anybody's business on a phone.
 *
 * What is ADDED is `rider`: a flat object the app can render or not, rather
 * than making three clients each work out that `delivery.driverId` being
 * non-empty is what "a rider is assigned" means.
 *
 * `live` is the rider's CURRENT position, and it is a second argument rather
 * than something read off the order because it does not live on the order —
 * it is on `app_drivers`, moved four times a minute, and copying it onto every
 * order write would be four writes a minute to a document nothing else is
 * touching. The single-order read joins it; the list deliberately does not,
 * because a list of fifty orders would be fifty driver lookups to draw fifty
 * markers nobody is looking at.
 */
const customerView = (order, live = null) => {
  if (!order) return null;
  const doc = typeof order.toJSON === 'function' ? order.toJSON() : { ...order };
  delete doc.partnerPayout;
  delete doc.commissionRate;
  delete doc.pickupCode;
  delete doc.__v;

  /* The desk's number and the message's outcome are the restaurant's and ours:
     a diner is told a driver is assigned, not who at which phone was asked. */
  const delivery = { ...(doc.delivery || {}) };
  delete delivery.request;

  /* An order whose restaurant arranged the driver reads as `assigned` here even
     though no rider account is behind it: that is the word the apps draw the
     "driver assigned" state from, and there is no other honest place for them
     to learn it. Derived rather than stored — see `driverAssigned`. */
  const arranged = !delivery.driverId && driverAssigned(doc);
  const dispatchState = arranged ? 'assigned' : ((doc.dispatch && doc.dispatch.state) || 'idle');

  /*
   * The gateway block, rebuilt rather than passed through.
   *
   * `razorpay` used to be four ids and two timestamps, and passing it through
   * to the diner was harmless — it is their own payment. It now also carries
   * who inside this company authorised their refund and the internal sentence
   * written against it, and neither of those is theirs to have: a student's app
   * should not print a member of staff's name, and `partnerView` deletes this
   * whole block for the same kind of reason one field down.
   *
   * Named explicitly, not `delete`d, so that the next field added to the
   * sub-document is invisible here until somebody decides it should not be —
   * which is the opposite of how it went last time.
   */
  const rp = doc.razorpay || {};

  return {
    ...doc,
    /* No delivery code on an order the restaurant arranged. The code exists so a
       rider can prove they reached the door; here nobody is asked for it — the
       diner confirms the delivery themselves — and a code on screen that nothing
       checks is a number somebody will read out to no purpose. */
    deliveryOtp: restaurantArrangedDelivery(doc) ? '' : doc.deliveryOtp,
    razorpay: {
      orderId: rp.orderId || '',
      paymentId: rp.paymentId || '',
      amountPaise: rp.amountPaise || 0,
      paidAt: rp.paidAt || null,
      /* Their own money coming back: what, how much, when. Not who. */
      refundId: rp.refundId || '',
      refundAmountPaise: rp.refundAmountPaise || 0,
      refundedAt: rp.refundedAt || null,
      refundStatus: rp.refundStatus || '',
    },
    delivery,
    dispatch: {
      state: dispatchState,
      /* Kept because it is the difference between "we are asking riders" and
         "nobody was there to ask", and the diner is shown different words for
         the two. The individual ids are not. */
      candidateCount: (doc.dispatch && doc.dispatch.candidateCount) || 0,
      startedAt: (doc.dispatch && doc.dispatch.startedAt) || null,
      failureReason: (doc.dispatch && doc.dispatch.failureReason) || '',
    },
    rider: delivery.driverId
      ? {
        name: delivery.driverName || 'Your rider',
        phone: delivery.driverPhone || '',
        vehicle: delivery.vehicle || {},
        assignedAt: delivery.assignedAt || null,
        pickedUpAt: delivery.pickedUpAt || null,
        deliveredAt: delivery.deliveredAt || null,
        /*
         * Where they are now, or null.
         *
         * Null is a REAL answer and the app is built to draw it: a rider whose
         * phone lost signal has a last-known position that gets older every
         * second, and a marker that sits still on a map is read as a rider who
         * is not moving rather than as a fix nobody has. `at` is sent so the
         * screen can say how old it is instead of implying it is now.
         */
        location: live && live.coordinates ? live.coordinates : null,
        heading: live && Number.isFinite(live.heading) ? live.heading : null,
        at: live && live.at ? live.at : null,
      }
      : arranged ? chosenRider(doc) : null,
  };
};

/**
 * The order as the KITCHEN is allowed to see it.
 *
 * Everything `customerView` keeps plus the payout terms — those ARE the
 * restaurant's business — and the `pickupCode`, which is the whole point: it is
 * the number a cook reads out to the rider at the pass.
 *
 * `dispatch.offers` is stripped here too. A restaurant does not need the id of
 * every rider who declined; what they need is whether one is coming, which is
 * `dispatch.state` and `rider`.
 */
const partnerView = (order) => {
  if (!order) return null;
  const doc = typeof order.toJSON === 'function' ? order.toJSON() : { ...order };
  delete doc.__v;

  /*
   * The DINER'S PIN never reaches the kitchen.
   *
   * `pickupCode` stays — it is the number the cook reads out at the pass, and
   * the whole reason this view exists. `deliveryOtp` is the other one, and a
   * restaurant holding it defeats the only thing it proves: that the rider was
   * at the door. A kitchen that knows it can read it out at the pass, and then
   * "delivered" means a rider took a bag, not that anybody received it.
   *
   * The two are one field apart in the model, which is exactly why this is
   * deleted explicitly rather than left to a projection somebody will widen.
   */
  delete doc.deliveryOtp;

  /* The gateway reference is ours, not theirs. `paymentStatus` is what a
     kitchen needs — whether the money is in — and the payment id is a handle
     for support and reconciliation on our side. */
  delete doc.razorpay;

  /*
   * THE KITCHEN'S TOTAL IS THE FOOD, and nothing else.
   *
   * `itemsTotal` is what they cooked and what their commission comes off;
   * `partnerPayout` is what they are paid for it. Neither of those is
   * `grandTotal`, which also carries GST, the platform fee and the delivery
   * fee — three charges that are not the restaurant's, that they neither
   * collect nor keep, and that made every screen in the partner console quote
   * a number ₹40 above the order it was describing.
   *
   * A kitchen was shown ₹200 for ₹160 of food. That is not a rounding
   * difference: it is the platform's revenue and a rider's fee printed as if
   * the restaurant had sold it.
   *
   * Deleted here rather than filtered per screen, because there are five of
   * them across a console and a phone app and each one would have had to
   * remember. What is left cannot be added up into the diner's bill, which is
   * the point — the diner's bill is the diner's.
   *
   * The DINER keeps seeing all of it (`customerView`), and so does the admin
   * console, which is the reader that reconciles the two.
   */
  delete doc.grandTotal;
  delete doc.gst;
  delete doc.gstRate;
  delete doc.platformFee;
  delete doc.deliveryFee;
  delete doc.packagingCharge;
  delete doc.discount;

  const delivery = doc.delivery || {};
  const request = delivery.request || {};

  return {
    ...doc,
    dispatch: {
      state: (doc.dispatch && doc.dispatch.state) || 'idle',
      candidateCount: (doc.dispatch && doc.dispatch.candidateCount) || 0,
      failureReason: (doc.dispatch && doc.dispatch.failureReason) || '',
    },
    rider: delivery.driverId
      ? {
        name: delivery.driverName || 'Rider',
        phone: delivery.driverPhone || '',
        vehicle: delivery.vehicle || {},
        assignedAt: delivery.assignedAt || null,
        pickedUpAt: delivery.pickedUpAt || null,
      }
      : null,
    /*
     * How this order travels, as the restaurant chose it — and, for the desk's
     * driver, whether the WhatsApp actually went out. The console draws the
     * "sent" / "could not be sent — try again" state from `request`; `moves` is
     * the server's own list of what this restaurant may do next, so a screen
     * never has to work out that an order it is delivering itself can be marked
     * picked up when one handed to a rider cannot.
     */
    deliveryChoice: {
      method: delivery.method || '',
      chosenAt: delivery.methodChosenAt || null,
      request: delivery.method === 'driver'
        ? {
          to: request.to || '',
          ok: request.ok === true,
          sentAt: request.sentAt || null,
          error: request.error || '',
          attempts: request.attempts || 0,
        }
        : null,
    },
    moves: partnerMovesFor(doc),
  };
};

const FoodOrder = mongoose.models.FoodOrder
  || mongoose.model('FoodOrder', foodOrderSchema, 'food_orders');

module.exports = FoodOrder;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.ALLOWED_PARTNER_TRANSITIONS = ALLOWED_PARTNER_TRANSITIONS;
module.exports.ALLOWED_RIDER_TRANSITIONS = ALLOWED_RIDER_TRANSITIONS;
module.exports.CHANNELS = CHANNELS;
module.exports.isWebDelivery = isWebDelivery;
module.exports.DELIVERY_METHODS = DELIVERY_METHODS;
module.exports.restaurantArrangedDelivery = restaurantArrangedDelivery;
module.exports.driverAssigned = driverAssigned;
module.exports.chosenRider = chosenRider;
module.exports.partnerMovesFor = partnerMovesFor;
module.exports.PAYMENT_MODES = PAYMENT_MODES;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
module.exports.REFUND_CHANNELS = REFUND_CHANNELS;
module.exports.DISPATCH_STATES = DISPATCH_STATES;
/* The refund ledger's three readers. Exported together because they are one
   answer asked three ways, and a caller that took only one of them would be
   the second definition this change exists to remove. */
module.exports.refundRecordOf = refundRecordOf;
module.exports.refundRecordedFilter = refundRecordedFilter;
module.exports.refundNotRecordedFilter = refundNotRecordedFilter;
module.exports.OFFER_OUTCOMES = OFFER_OUTCOMES;
module.exports.makeOrderNumber = makeOrderNumber;
module.exports.makeHandoverCode = makeHandoverCode;
module.exports.restaurantSnapshot = restaurantSnapshot;
module.exports.riderView = riderView;
module.exports.customerView = customerView;
module.exports.partnerView = partnerView;
