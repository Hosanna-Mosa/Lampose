/* ══════════════════════════════════════════════════════════════════════════
   The diner's own orders — the list, and the one being tracked.

   Replaces the fixture's `ORDERS` and its `orderByReference` lookup.

     GET /orders              the orders page
     GET /orders/:reference   one order, for the tracking page

   ## The two tracks, and why an order has both

   This is the shape the tracking page was drawn around, and the fixture says
   why: "an order carries the KITCHEN's `status` and the RIDER's `dispatch`
   state side by side, because an order is cooked and looked for at the same
   time and the tracking page draws both."

   That is a real property of this system, not a presentation choice.
   `foodDispatch.service.js` starts searching for a rider while the kitchen is
   still cooking — the two run concurrently, and a single progress bar would
   have to lie about one of them. So `kitchenTrack` and `riderTrack` are built
   separately below, each from its own source:

     kitchenTrack  from `statusHistory`, which is written on every transition
     riderTrack    from `dispatch` plus the `delivery` timestamps

   ## Nothing here is invented

   Every step carries `done`, `current` or neither, and a step that has not
   happened has NO time against it. The fixture filled future steps in with
   plausible times; this does not, because a tracking page that shows a
   hand-over time before the hand-over has happened is worse than one that
   shows a blank.

   ## The OTP is sent, and only to the person it belongs to

   `deliveryOtp` is what the diner reads out at the door. It is on the order
   because that is the whole point of it — see the note in `foodOrder.model.js`
   about why these codes are stored readable. Every route in this file is
   behind `requireCustomer` AND filters on `customerId`, so an order only ever
   reaches the person who placed it.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodOrder = require('../foodpartners/foodOrder.model');

const { isWebDelivery } = FoodOrder;
const { riderPosition } = require('../foodpartners/foodCustomerOrder.controller');
const { rupees, dietOf } = require('./foodWeb.shape');

const { driverAssigned, chosenRider } = FoodOrder;

/* ── Labels ─────────────────────────────────────────────────────────────── */

/*
 * The status the DINER is shown, which is not always the status stored.
 *
 * `picked_up` is the kitchen's word for "the rider has it". The diner's word
 * is "on the way", because from the doorstep that is the only thing it means.
 * The fixture uses `onTheWay` for exactly this state and the page's copy is
 * written against it.
 */
const STATUS_LABEL = {
  placed: 'Waiting for the kitchen',
  accepted: 'Accepted',
  preparing: 'Cooking',
  ready: 'Ready',
  picked_up: 'On the way',
  delivered: 'Delivered',
  rejected: 'Refused by the kitchen',
  cancelled: 'Cancelled',
};

/** The camelCase the website's components switch on. */
const STATUS_KEY = {
  placed: 'placed',
  accepted: 'accepted',
  preparing: 'preparing',
  ready: 'ready',
  picked_up: 'onTheWay',
  delivered: 'delivered',
  rejected: 'rejected',
  cancelled: 'cancelled',
};

/**
 * The key the website switches on - which depends on HOW the order travels.
 *
 * `picked_up` is one stored word for two different things: a rider has the
 * food and is on the road, or (on a pickup order) the diner has collected it
 * at the counter. The page draws them completely differently - "on the way"
 * with a rider card, against "collected" and nothing more - so the fulfilment
 * has to choose.
 */
const statusKeyOf = (doc) => (doc.status === 'picked_up' && doc.fulfilment === 'pickup'
  ? 'pickedUp'
  : STATUS_KEY[doc.status] || doc.status);

const statusLabelOf = (doc) => (doc.status === 'picked_up' && doc.fulfilment === 'pickup'
  ? 'Collected'
  : STATUS_LABEL[doc.status] || doc.status);

/** An order nobody is waiting on any more. */
const CLOSED = new Set(['delivered', 'rejected', 'cancelled']);

const PAYMENT_LABEL = {
  pending: 'Not paid',
  paid: 'Paid',
  refunded: 'Refunded',
  failed: 'Payment failed',
};

/* ── Time ───────────────────────────────────────────────────────────────── */

/** "1:02 pm", in Asia/Kolkata — the clock every diner reading this is on. */
const timeLabel = (date) => (date
  ? new Date(date).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })
  : '');

/** The calendar day in India, as YYYY-MM-DD — what "today" means to a diner. */
const dayKey = (date) => new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * "Today, 1:02 pm" / "18 Sep, 1:02 pm".
 *
 * "Today" is compared as an INDIAN calendar day. `toDateString()` compares in
 * the server's zone, and on a UTC host an order placed at 11pm IST is already
 * "yesterday" — so it would read "20 Sep" to a diner who ordered it an hour
 * ago.
 */
const placedLabel = (date) => {
  if (!date) return '';
  const when = new Date(date);
  const sameDay = dayKey(when) === dayKey(new Date());
  const day = when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  return `${sameDay ? 'Today' : day}, ${timeLabel(when)}`;
};

/** "September 2026" — the heading the orders page groups history under. */
const monthLabel = (date) => (date
  ? new Date(date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
  : '');

/* ── Distance and age, for the live rider ───────────────────────────────── */

/** Metres between two points, great-circle. Enough for "1.4 km to go". */
const haversineMeters = (lat1, lng1, lat2, lng2) => {
  const rad = (deg) => (deg * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** "350 m" under a kilometre, "1.4 km" above - rounded the way a person says it. */
const distanceLabel = (meters) => (meters < 1000
  ? `${Math.max(10, Math.round(meters / 10) * 10)} m`
  : `${(meters / 1000).toFixed(1)} km`);

/** How old a position fix is - said as an age, never as "now". */
const ageLabel = (when) => {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(when).getTime()) / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min ago`;
};

/* ── The two tracks ─────────────────────────────────────────────────────── */

/**
 * The kitchen's half, from `statusHistory`.
 *
 * Built from what was RECORDED rather than from a fixed list of four steps:
 * an order the kitchen refused never had a "cooking" step and showing one
 * greyed out would suggest it is still coming.
 *
 * ## What each mark means
 *
 *   tick    it HAPPENED. Every recorded step is one — "Accepted" is ticked the
 *           moment the kitchen accepts. It used to be a hollow ring, because the
 *           step matching the order's status was marked "current" and the page
 *           draws done-and-current as a ring with the tick hidden: an order the
 *           kitchen had accepted read as though it had not been.
 *   ring    it is HAPPENING. Only cooking is a stretch of time with a middle;
 *           acceptance and "ready" are moments, and a moment is done or it is
 *           not.
 *   grey    it is COMING. The one step the kitchen has committed to next —
 *           cooking after an accept, ready after cooking — with no time against
 *           it, because it has not happened. Not shown before the kitchen has
 *           accepted (it may still say no) or after it has refused.
 */
const kitchenTrackOf = (doc) => {
  const history = Array.isArray(doc.statusHistory) ? doc.statusHistory : [];
  const steps = [];

  steps.push({
    label: doc.paymentStatus === 'paid' ? 'Order placed & paid' : 'Order placed',
    at: timeLabel(doc.placedAt),
    note: doc.paymentStatus === 'paid' ? `${doc.paymentMode.toUpperCase()} ₹${rupees(doc.grandTotal)} verified` : '',
    done: true,
  });

  /* Only the transitions the kitchen owns. `picked_up` and `delivered` are
     the rider's and belong to the other track. */
  const kitchenStates = ['accepted', 'preparing', 'ready', 'rejected', 'cancelled'];
  kitchenStates.forEach((state) => {
    const event = history.find((row) => row.status === state);
    if (!event) return;
    steps.push({
      label: STATUS_LABEL[state],
      at: timeLabel(event.at),
      note: event.note || '',
      done: true,
      /* Only cooking, and only while it is the order's state. Acceptance and
         "ready" are moments that have happened, so they are ticks — a ring on
         "Accepted" made an accepted order look unaccepted, and on "Ready" made
         food waiting on the pass look as though it were still being made. What
         the order is waiting for once the kitchen is done is on the rider's
         track. */
      current: state === 'preparing' && doc.status === 'preparing',
    });
  });

  /* The next step the kitchen has committed to, greyed out and untimed. See the
     legend above for why it starts at "accepted" and not before. */
  const next = { accepted: 'preparing', preparing: 'ready' }[doc.status];
  if (next) steps.push({ label: STATUS_LABEL[next] });

  return steps;
};

/**
 * The rider CARD for an order whose restaurant arranged who brings it — null
 * until it is true that a driver is coming (see `driverAssigned`).
 *
 * Same keys as a real rider's card so the page draws it without a branch, plus
 * `kind` and `detail` for the words that differ: there is no name or plate to
 * show, so it says who is bringing the food instead. No phone, as ever.
 */
const arrangedRiderOf = (doc) => {
  if (!driverAssigned(doc)) return null;
  const rider = chosenRider(doc);
  return {
    name: rider.name,
    initial: rider.name.trim().charAt(0).toUpperCase(),
    vehicle: '',
    kind: rider.kind,
    /* The line under the name. It must add something to the name, which already
       says who — "Lampose delivery partner / A Lampose delivery partner" was
       the same words twice. */
    detail: rider.kind === 'restaurant'
      ? 'The restaurant\'s own delivery person'
      : 'Sent by the Lampose delivery desk',
  };
};

/**
 * The rider's half, for an order whose RESTAURANT arranged who brings it.
 *
 * No search happened — the restaurant's own person, or a driver the delivery
 * desk was asked to send — so none of the "looking for a rider" steps apply and
 * showing them would describe something that did not occur. What the diner is
 * told is the one thing that IS true, and only once it is: "Driver assigned"
 * needs the restaurant to have said so (its own person) or the WhatsApp to the
 * desk to have gone out. Until then it is "Arranging a driver", never a
 * driver that has not been asked for.
 */
const arrangedStepOf = (doc) => {
  const delivery = doc.delivery || {};
  const own = delivery.method === 'self';

  if (!driverAssigned(doc)) {
    const request = delivery.request || {};
    return {
      label: 'Arranging a driver',
      note: request.attempts ? 'Still contacting a delivery partner.' : 'We are contacting a delivery partner.',
      current: true,
    };
  }

  return {
    label: 'Driver assigned',
    at: timeLabel(own ? delivery.methodChosenAt : (delivery.request && delivery.request.sentAt)),
    note: own ? 'The restaurant\'s own delivery person' : 'A Lampose delivery partner',
    done: true,
  };
};

/**
 * The rider's half, from `dispatch` and `delivery`.
 *
 * A PICKUP order has no rider half at all — returning an empty array rather
 * than a track of never-reached steps is what lets the page draw a collection
 * card instead of a delivery one.
 */
/**
 * May the diner be shown the code a rider asks for at the door?
 *
 * Not on an order the restaurant arranged (the diner confirms with a button), and
 * not on a WEBSITE order that has no rider of ours yet - before the restaurant has
 * answered there is nobody to read it out to, and a code that shows up and then
 * disappears is worse than none. A website order that the app's own dispatcher
 * carries (accepted without a choice) gets its code the moment a rider is on it.
 * An app order is unchanged: it always carries its code.
 */
const showsCode = (doc) => {
  const delivery = doc.delivery || {};
  if (delivery.method) return false;
  if (isWebDelivery(doc) && !delivery.assignedAt) return false;
  return true;
};

const riderTrackOf = (doc) => {
  if (doc.fulfilment === 'pickup') return [];

  const dispatch = doc.dispatch || {};
  const delivery = doc.delivery || {};
  const steps = [];

  if (delivery.method) {
    /* The restaurant arranged it — see `arrangedStepOf`. The search steps
       below are for orders the app's own dispatcher is carrying. */
    steps.push(arrangedStepOf(doc));
  } else {
    if (dispatch.startedAt) {
      steps.push({
        label: 'Looking for a rider',
        /* The FIRST time it looked (the dispatcher no longer overwrites it on a
           retry), with how many times it has since been tried — so "12:21 ·
           tried 2 times" reads as what it is, rather than a start time that
           quietly moves each time the search is repeated. */
        at: timeLabel(dispatch.startedAt),
        note: [
          dispatch.candidateCount ? `${dispatch.candidateCount} riders asked` : '',
          dispatch.attempts > 1 ? `tried ${dispatch.attempts} times` : '',
        ].filter(Boolean).join(' · '),
        done: true,
      });
    }

    if (delivery.assignedAt) {
      steps.push({
        label: delivery.driverName ? `${delivery.driverName} accepted` : 'A rider accepted',
        at: timeLabel(delivery.assignedAt),
        done: true,
      });
    } else if (dispatch.state === 'unassigned') {
      /* The one failure the diner is actually told about, in the dispatcher's
         own words where it has them. */
      steps.push({
        label: 'No rider found yet',
        note: dispatch.failureReason || 'We are still looking.',
        current: true,
      });
    }
  }

  /* An order the RESTAURANT arranged — no rider account, no code. It is told in
     the delivery boy's terms ("has picked up your order") and it ends when the
     DINER says it has arrived, so its last step is "Delivered", not the rider's
     "Handed over". */
  const arranged = Boolean(delivery.method);

  if (delivery.pickedUpAt) {
    steps.push({
      label: 'Picked up · on the way',
      at: timeLabel(delivery.pickedUpAt),
      note: doc.status === 'picked_up' ? (arranged ? 'The delivery boy has picked up your order' : 'happening now') : '',
      done: true,
      current: doc.status === 'picked_up',
    });
  } else if (!CLOSED.has(doc.status)) {
    /* Still coming, so it is on the rail — greyed and untimed — instead of the
       track jumping from "Driver assigned" straight to "Handed over" and leaving
       out the part where somebody carries it. Not on a closed order: a refused
       or cancelled one is never collected, and a delivered one has already been. */
    steps.push({ label: 'Picked up · on the way' });
  }

  /* A WEBSITE order ends in "Delivered" from the moment it is placed - the word
     must not change under the diner when the restaurant chooses who brings it. */
  const last = isWebDelivery(doc) ? 'Delivered' : 'Handed over';
  if (delivery.deliveredAt) {
    steps.push({ label: last, at: timeLabel(delivery.deliveredAt), done: true });
  } else if (!['rejected', 'cancelled'].includes(doc.status)) {
    /* No time, because it has not happened. A rider's order shows the code so the
       diner has it ready at the door; a restaurant-arranged one has none, and says
       where to confirm once it is on the way.

       Only while the order is still going somewhere. A refused or cancelled
       order is never handed over, and a rail that ends in a pending "Handed
       over" step reads as though a rider might still turn up. */
    const note = arranged
      ? (doc.status === 'picked_up' ? 'Confirm below when it arrives' : '')
      : (showsCode(doc) ? `Needs code ${doc.deliveryOtp}` : '');
    steps.push({ label: last, note });
  }

  return steps;
};

/** The diner's drop-off point as [lng, lat], or null. */
const dropPoint = (doc) => {
  const pair = doc.dropLocation && doc.dropLocation.coordinates;
  return Array.isArray(pair) && pair.length === 2 ? pair : null;
};

/** When a pickup order will be ready: acceptance time + the kitchen's own quote. */
const readyByOf = (doc) => {
  if (doc.fulfilment !== 'pickup' || !doc.promisedMinutes) return '';
  const accepted = (doc.statusHistory || []).find((row) => row.status === 'accepted');
  if (!accepted || !accepted.at) return '';
  return timeLabel(new Date(new Date(accepted.at).getTime() + doc.promisedMinutes * 60000));
};

/** Why an order was cancelled, in the words recorded when it was. */
const cancelNoteOf = (doc) => {
  if (doc.status !== 'cancelled') return '';
  const event = [...(doc.statusHistory || [])].reverse().find((row) => row.status === 'cancelled');
  return (event && event.note) || '';
};

/* ── The shape ──────────────────────────────────────────────────────────── */

/**
 * One row of `ORDERS`.
 *
 * @param {object}  doc    a lean `food_orders` document
 * @param {boolean} full   true for the tracking page — adds the two tracks,
 *                         the rider and the hand-over code. The LIST omits
 *                         them: thirty orders each carrying a status history
 *                         is a large reply for a page that shows a card.
 */
const orderCard = (doc, full = false, position = null) => {
  const live = !CLOSED.has(doc.status);
  const delivery = doc.delivery || {};

  const card = {
    reference: doc.orderNumber,
    kitchenId: doc.restaurantId,
    kitchenName: (doc.restaurant && doc.restaurant.name) || '',
    live,
    status: statusKeyOf(doc),
    statusLabel: statusLabelOf(doc),
    fulfilment: doc.fulfilment || 'delivery',
    placedLabel: placedLabel(doc.placedAt),
    monthLabel: monthLabel(doc.placedAt),
    addressTitle: doc.deliveryAddress || '',

    lines: (doc.lines || []).map((line) => ({
      name: line.productName,
      qty: rupees(line.quantity),
      /* PER UNIT, because the page prints `price x qty`. This was the line
         total, so a dish ordered twice printed at four times its price.
         Divided out of the total rather than read from `unitPrice` so add-ons
         are inside it and `price x qty` lands exactly on what was charged. */
      price: line.quantity ? Math.round(line.lineTotal / line.quantity) : rupees(line.unitPrice),
      /* The order line spells non-veg with a hyphen and the product does not
         (`'non-veg'` against `'nonveg'`). Normalised here so one dish does
         not change colour between the menu and the receipt. */
      diet: dietOf(String(line.isVeg || '').replace('-', '')),
      note: [line.variantName, ...(line.addOns || []).map((a) => a.name), line.note]
        .filter(Boolean)
        .join(' · '),
    })),

    itemTotal: rupees(doc.itemsTotal),
    packagingCharge: rupees(doc.packagingCharge),
    deliveryFee: rupees(doc.deliveryFee),
    discount: rupees(doc.discount),
    couponCode: '',
    grandTotal: rupees(doc.grandTotal),
    /* What has actually been PAID. It was the grand total on every order, so an
       unpaid cash-on-delivery order read "Paid 265". Zero until the payment is
       settled - the bill's total row then falls back to `dueOnDelivery`. */
    paid: doc.paymentStatus === 'paid' ? rupees(doc.grandTotal) : 0,
    dueOnDelivery: doc.paymentMode === 'cod' && doc.paymentStatus !== 'paid' ? rupees(doc.grandTotal) : 0,
    paymentLabel: `${String(doc.paymentMode || '').toUpperCase()} · ${PAYMENT_LABEL[doc.paymentStatus] || doc.paymentStatus}`,
    paymentStatus: doc.paymentStatus,
    /* What the rider must still collect at the door — 0 on a prepaid order.
       Named rather than derived on the client so the card and the rider's
       own screen cannot disagree about who owes what. */
    collectAmount: doc.paymentMode === 'cod' && doc.paymentStatus !== 'paid' ? rupees(doc.grandTotal) : 0,
  };

  if (!full) return card;

  return {
    ...card,
    /* Nothing to read out on an order the restaurant arranged — the diner confirms
       the delivery with a button. A rider's order still carries its code. */
    deliveryOtp: showsCode(doc) ? (doc.deliveryOtp || '') : '',
    pickedUpLabel: timeLabel(delivery.pickedUpAt),
    /* Ready-by, for a PICKUP order only: when the kitchen accepted, plus the
       minutes it quoted. There is no honest arrival time for a delivery - the
       ride is not modelled - so that stays empty and the page prints a dash. */
    etaLabel: readyByOf(doc),
    rejectionReason: doc.rejectionReason || '',
    cancelNote: cancelNoteOf(doc),
    /* Live, from the rider's own phone, through the same helper the app uses:
       null once the order is finished and null for a stale fix, so neither is
       shown as though it were current. */
    distanceLabel: position && position.coordinates && dropPoint(doc)
      ? distanceLabel(haversineMeters(
        position.coordinates[1], position.coordinates[0], dropPoint(doc)[1], dropPoint(doc)[0],
      ))
      : '',
    lastFixLabel: position && position.at ? ageLabel(position.at) : '',
    rider: delivery.driverName
      ? {
        name: delivery.driverName,
        initial: delivery.driverName.trim().charAt(0).toUpperCase(),
        /* The plate and model, never the rider's phone number: the app's
           call button dials through the server, and a number on a web page
           is a number that outlives the delivery. */
        vehicle: [delivery.vehicle && delivery.vehicle.model, delivery.vehicle && delivery.vehicle.plate]
          .filter(Boolean)
          .join(' · '),
      }
      : arrangedRiderOf(doc),
    dispatch: {
      /* `assigned` for an order the restaurant arranged, once it is true that
         a driver is coming — the same word the page already draws "a rider is
         carrying it" from. Derived, not stored: nothing in the dispatcher's
         own state says so. */
      state: driverAssigned(doc) && !delivery.driverName ? 'assigned' : ((doc.dispatch && doc.dispatch.state) || 'idle'),
      candidateCount: rupees(doc.dispatch && doc.dispatch.candidateCount),
    },
    /* How the restaurant arranged delivery, and whether the diner may be told a
       driver is assigned yet — so the page words itself from a fact rather than
       from which steps happen to be in `riderTrack`. `by` is '' when the app's
       own rider search is carrying the order. */
    delivery: { by: delivery.method || '', assigned: driverAssigned(doc) },
    kitchenTrack: kitchenTrackOf(doc),
    riderTrack: riderTrackOf(doc),
  };
};

/*
 * What a card needs. `customerPhone`, `razorpay`, `partnerPayout`,
 * `commissionRate` and `pickupCode` are deliberately NOT selected: the first
 * is the diner's own and adds nothing, and the rest are Lampose's books or
 * the kitchen's, and none of them belong on a diner's screen.
 */
const CARD_FIELDS = [
  'orderNumber', 'restaurantId', 'restaurant', 'status', 'statusHistory',
  'fulfilment', 'placedAt', 'deliveryAddress',
  'lines', 'itemsTotal', 'packagingCharge', 'deliveryFee', 'discount', 'grandTotal',
  'paymentMode', 'paymentStatus',
  'dispatch', 'delivery', 'deliveryOtp', 'channel',
  'rejectionReason', 'promisedMinutes', 'dropLocation',
].join(' ');

/**
 * The diner's orders, newest first.
 *
 * @route   GET /api/v2/food-web/orders
 * @access  customer session required
 *
 * Query:
 *   limit  1–50, default 20
 */
const listOrders = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

    const docs = await FoodOrder.find({ customerId: req.customer.customerId })
      .select(CARD_FIELDS)
      .sort({ placedAt: -1 })
      .limit(limit)
      .lean();

    const orders = docs.map((doc) => orderCard(doc, false));

    return res.json({
      success: true,
      data: {
        orders,
        count: orders.length,
        /* The tracking page is opened straight off the orders list when
           something is still happening, so the list says which one. */
        liveReference: (orders.find((order) => order.live) || {}).reference || null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * One order, with both tracks — the tracking page.
 *
 * @route   GET /api/v2/food-web/orders/:reference
 * @access  customer session required; only this diner's own orders
 */
const getOrder = async (req, res, next) => {
  try {
    const reference = String(req.params.reference || '').trim();

    /* `customerId` is in the FILTER rather than checked after the read. The
       two are equivalent when the code is right and only one of them stays
       right when somebody edits this handler later. */
    const doc = await FoodOrder.findOne({
      orderNumber: reference,
      customerId: req.customer.customerId,
    }).select(CARD_FIELDS).lean();

    if (!doc) {
      const message = 'That order could not be found.';
      return res.status(404).json({
        success: false, code: 'ORDER_NOT_FOUND', message, error: message,
      });
    }

    /* The rider's current position, from the helper the app uses - so this
       page follows exactly the same privacy rules and cannot show a position
       the app would not. A failure to read it must not fail the order. */
    const position = await riderPosition(doc).catch(() => null);

    return res.json({ success: true, data: { order: orderCard(doc, true, position) } });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listOrders, getOrder, orderCard, CARD_FIELDS, STATUS_LABEL, STATUS_KEY, CLOSED,
};
