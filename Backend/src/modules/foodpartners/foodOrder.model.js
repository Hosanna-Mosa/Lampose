/* ══════════════════════════════════════════════════════════════════════════
   The `food_orders` collection — a diner's order at a partner restaurant.

   ## Why this exists now, ahead of a customer-facing ordering flow

   The partner app has an Orders screen: a restaurant accepts, cooks and hands
   over, and it needs somewhere real to read that from. Nothing writes to this
   collection from the customer side yet — the User App's food module is not
   wired to this backend. So the honest position is that the partner app reads
   REAL rows from a REAL collection that is currently empty, and shows an empty
   state saying so, rather than being handed invented orders that would teach a
   restaurant to trust a number that is not true.

   The prefix follows the same rule as `food_restaurants` and `food_products`:
   `orders` unprefixed is exactly the sort of name a second feature collides
   with a year later.

   ## Status is a one-way street, and the partner may only take some of it

   The lifecycle below runs forwards. `ALLOWED_PARTNER_TRANSITIONS` is what a
   restaurant may do from each state, and it is enforced in the controller
   rather than trusted from the request: a kitchen marking an order `delivered`
   before a rider has it, or reopening a `cancelled` order, is how a settlement
   report stops adding up.

   `placed -> accepted -> preparing -> ready -> picked_up -> delivered`
   with `cancelled` and `rejected` reachable only from the early states.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

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

const PAYMENT_MODES = ['online', 'cod'];
const PAYMENT_STATUSES = ['pending', 'paid', 'refunded', 'failed'];

const ALPHABET = '0123456789';

/** Short, readable down a phone line, and unique enough for a day's volume. */
const makeOrderNumber = () => {
  let tail = '';
  for (let i = 0; i < 6; i += 1) {
    tail += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `LO${tail}`;
};

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

    lines: { type: [orderLineSchema], default: [] },

    itemsTotal: { type: Number, default: 0, min: 0 },
    packagingCharge: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    /* What the restaurant is actually owed once commission comes off. Stored
       rather than derived, because the commission rate can be renegotiated and
       a historical order must keep the rate it settled at. */
    partnerPayout: { type: Number, default: 0, min: 0 },
    commissionRate: { type: Number, default: 15, min: 0, max: 100 },

    paymentMode: { type: String, enum: PAYMENT_MODES, default: 'cod' },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },

    status: { type: String, enum: ORDER_STATUSES, default: 'placed', index: true },
    statusHistory: { type: [statusEventSchema], default: [] },

    /** Minutes the kitchen quoted when it accepted. */
    promisedMinutes: { type: Number, default: 0, min: 0 },
    rejectionReason: { type: String, default: '', trim: true },
    placedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/* The partner app's Orders tab is "this restaurant, newest first", optionally
   filtered by status. That is exactly this index. */
foodOrderSchema.index({ restaurantId: 1, status: 1, placedAt: -1 });
foodOrderSchema.index({ restaurantId: 1, placedAt: -1 });
/* The diner's own history, newest first. */
foodOrderSchema.index({ customerId: 1, placedAt: -1 });

foodOrderSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const FoodOrder = mongoose.models.FoodOrder
  || mongoose.model('FoodOrder', foodOrderSchema, 'food_orders');

module.exports = FoodOrder;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.ALLOWED_PARTNER_TRANSITIONS = ALLOWED_PARTNER_TRANSITIONS;
module.exports.PAYMENT_MODES = PAYMENT_MODES;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
module.exports.makeOrderNumber = makeOrderNumber;
