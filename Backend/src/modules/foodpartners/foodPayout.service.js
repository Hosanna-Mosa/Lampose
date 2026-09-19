/* ══════════════════════════════════════════════════════════════════════════
   Food payouts — the balance, the request, and the two ways one ends.

   Shared by the OWNER's routes (`restaurantAdmin.routes.js`) and the STAFF
   queue (`foodPayoutAdmin.routes.js`), because "what is this kitchen owed"
   must have one answer whichever side of the counter asks it. Two
   implementations of a balance is how a shop is told ₹6,281 and paid ₹5,900.

   ## What Lampose actually owes

   Not the same thing as what the kitchen earned, and the difference is the
   most important rule in this file. Lampose can only owe money it is
   HOLDING, so an order counts towards a payout only when all of these are
   true:

     delivered            food that never arrived was never earned. The
                          Earnings screen uses the same rule.
     payoutId is null     no earlier request has claimed it.
     not refunded         we gave the diner their money back; we are not
                          holding it any more.
     not (cash AND pickup)
                          a diner who collects and pays at the counter hands
                          the money to the RESTAURANT. Lampose never touches
                          it. Paying `partnerPayout` on that order would pay
                          the kitchen a second time for money already in its
                          till — and in fact leaves the kitchen owing us the
                          commission, which this system does not yet collect.

   That last exclusion is the one somebody will be tempted to delete because
   it makes the number smaller. It makes the number correct.

   A cash DELIVERY order does count: the rider collected, and the rider's cash
   comes to Lampose.

   ## Claiming is a write, not a read

   `availableFor` is a read and can be stale the instant it returns. The
   request therefore does not trust it: it stamps the orders inside an
   `updateMany` scoped on `payoutId: null`, then recomputes the amount from
   the orders that were actually stamped. Two taps a millisecond apart produce
   one request for everything and one "nothing to pay out", never two requests
   for the same money.

   This is `partners/payout.service.js`'s design, applied to orders instead of
   bookings. It is copied on purpose: it is the part of a payout system that
   is hard to get right and it is already right there.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodOrder = require('./foodOrder.model');
const FoodPayout = require('./foodPayout.model');

const { makeFoodPayoutId } = FoodPayout;

/** A refusal a route can turn straight into a response. */
class PayoutError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Orders whose money Lampose is holding for this restaurant — see the header
 * for why each clause is here. One predicate, used by the balance AND by the
 * claim, so the number an owner is shown and the orders they get paid for
 * cannot disagree.
 */
const payableFilter = (restaurantId) => ({
  restaurantId,
  status: 'delivered',
  payoutId: null,
  paymentStatus: { $ne: 'refunded' },
  /* NOT (cash AND collected at the counter). `$nor` rather than a negated
     `$or`, because the two clauses have to fail TOGETHER — a cash delivery
     and an online pickup are both payable. */
  $nor: [{ paymentMode: 'cod', fulfilment: 'pickup' }],
});

/** Rupees, rounded to paise. Floating point sums of money drift otherwise. */
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * What this restaurant could request right now, and what it could not.
 *
 * The excluded figures are returned rather than silently dropped: an owner
 * whose Earnings page says ₹6,281 and whose payout button says ₹5,900 is
 * owed an explanation, and "you collected ₹381 of it yourself at the
 * counter" is a better one than a number that does not match.
 */
const availableFor = async (restaurantId) => {
  const [available, pending, counterCash, awaitingRequest] = await Promise.all([
    FoodOrder.aggregate([
      { $match: payableFilter(restaurantId) },
      { $group: { _id: null, amount: { $sum: '$partnerPayout' }, orders: { $sum: 1 } } },
    ]),

    /* Already asked for and not yet settled. Shown separately so an owner
       who requested yesterday sees where the money went rather than
       believing their balance vanished. */
    FoodPayout.aggregate([
      { $match: { restaurantId, status: 'pending' } },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    /* The exclusion that needs explaining — see the header. */
    FoodOrder.aggregate([
      {
        $match: {
          restaurantId,
          status: 'delivered',
          payoutId: null,
          paymentMode: 'cod',
          fulfilment: 'pickup',
        },
      },
      { $group: { _id: null, amount: { $sum: '$partnerPayout' }, orders: { $sum: 1 } } },
    ]),

    /* Money that is real but not yet earned: accepted, cooking, or on a
       rider's bike. Not requestable, and worth showing so the day's trade is
       visible on the same screen as the balance. */
    FoodOrder.aggregate([
      {
        $match: {
          restaurantId,
          status: { $in: ['accepted', 'preparing', 'ready', 'picked_up'] },
          paymentStatus: { $ne: 'refunded' },
        },
      },
      { $group: { _id: null, amount: { $sum: '$partnerPayout' }, orders: { $sum: 1 } } },
    ]),
  ]);

  const first = (rows) => rows[0] || { amount: 0, orders: 0, count: 0 };
  const a = first(available);
  const p = first(pending);
  const c = first(counterCash);
  const w = first(awaitingRequest);

  return {
    available: money(a.amount),
    availableOrders: a.orders || 0,
    pending: money(p.amount),
    pendingRequests: p.count || 0,
    collectedByYou: money(c.amount),
    collectedByYouOrders: c.orders || 0,
    inProgress: money(w.amount),
    inProgressOrders: w.orders || 0,
  };
};

/** At least this much, or the transfer fee is most of the transfer. */
const MIN_REQUEST = 100;

/**
 * The owner's "Request payout" press.
 *
 * Moves no money and touches no gateway. It reserves what is owed and puts a
 * row in front of a person.
 *
 * `restaurant` is the document the session loaded; `account` is the saved
 * payout account to pay into, already chosen by the caller.
 */
const requestPayout = async (restaurant, account) => {
  const { restaurantId } = restaurant;

  if (!account || !account.accountLast4) {
    throw new PayoutError(
      'NO_PAYOUT_ACCOUNT',
      'Add a bank account before requesting a payout.',
      409,
    );
  }

  /*
   * One open request at a time.
   *
   * Not a technical limit — the claim stamps would keep two apart perfectly
   * well. It is so that the staff queue is a list of restaurants rather than
   * a list of fragments of restaurants, and so an owner who taps twice while
   * the first request is being settled does not have to be told which of
   * their two pending rows the transfer covered.
   */
  const open = await FoodPayout.findOne({ restaurantId, status: 'pending' }).lean();
  if (open) {
    throw new PayoutError(
      'REQUEST_ALREADY_OPEN',
      `You already have a payout of ₹${open.amount} waiting. Lampose will settle it before you can request another.`,
      409,
    );
  }

  const candidates = await FoodOrder.find(payableFilter(restaurantId))
    .select('orderNumber partnerPayout')
    .lean();

  const expected = money(candidates.reduce((sum, o) => sum + (Number(o.partnerPayout) || 0), 0));
  if (!candidates.length || expected <= 0) {
    throw new PayoutError('NOTHING_TO_PAY_OUT', 'There is nothing to pay out yet.', 409);
  }
  if (expected < MIN_REQUEST) {
    throw new PayoutError(
      'BELOW_MINIMUM',
      `Payouts start at ₹${MIN_REQUEST}. You have ₹${expected} waiting — it will keep adding up.`,
      409,
    );
  }

  /* Created FIRST, so its id is what stamps the orders. The amount written
     now is provisional and is corrected below to whatever was actually
     claimed. */
  const payout = await FoodPayout.create({
    payoutId: makeFoodPayoutId(),
    restaurantId,
    restaurantName: restaurant.restaurantName || '',
    amount: expected,
    status: 'pending',
    orderNumbers: candidates.map((o) => o.orderNumber),
    orderCount: candidates.length,
    account: {
      accountId: account.accountId || '',
      label: account.label || '',
      accountHolderName: account.accountHolderName || '',
      accountLast4: account.accountLast4 || '',
      ifscCode: account.ifscCode || '',
      accountType: account.accountType || '',
      upiId: account.upiId || '',
    },
    requestedAt: new Date(),
  });

  /* The claim. Scoped on `payoutId: null` as well as the id list, so an order
     taken by a concurrent request between the read above and this write is
     left to THAT request rather than counted into both. */
  await FoodOrder.updateMany(
    { restaurantId, orderNumber: { $in: candidates.map((o) => o.orderNumber) }, payoutId: null },
    { $set: { payoutId: payout.payoutId } },
  );

  /* Recomputed from what was actually stamped, never from what was read.
     This is the line that makes the whole thing safe under a double tap. */
  const claimed = await FoodOrder.find({ payoutId: payout.payoutId })
    .select('orderNumber partnerPayout')
    .lean();
  const total = money(claimed.reduce((sum, o) => sum + (Number(o.partnerPayout) || 0), 0));

  if (total <= 0) {
    /* Everything was taken between the read and the claim. Leave no empty
       row behind for staff to puzzle over. */
    await FoodPayout.deleteOne({ payoutId: payout.payoutId });
    throw new PayoutError('NOTHING_TO_PAY_OUT', 'There is nothing to pay out yet.', 409);
  }

  payout.amount = total;
  payout.orderNumbers = claimed.map((o) => o.orderNumber);
  payout.orderCount = claimed.length;
  await payout.save();

  return payout;
};

/**
 * A person made the transfer and is recording it.
 *
 * The reference is required by the ROUTE rather than defaulted here: it is
 * the only thread between this row and money actually leaving a bank, and a
 * row marked paid without one is a claim nobody can check afterwards.
 *
 * The claimed orders are deliberately left stamped. They have been paid;
 * releasing them would put the money back in the kitchen's balance and let
 * it be requested a second time.
 */
const markPaid = async (payoutId, { reference, admin, note } = {}) => {
  const payout = await FoodPayout.findOne({ payoutId, status: 'pending' });
  if (!payout) {
    const current = await FoodPayout.findOne({ payoutId }).lean();
    if (!current) throw new PayoutError('NOT_FOUND', 'No payout with that id.', 404);
    throw new PayoutError(
      'ALREADY_SETTLED',
      `This payout is already ${current.status}.`,
      409,
    );
  }

  payout.status = 'paid';
  payout.paidAt = new Date();
  payout.reference = String(reference || '').slice(0, 120);
  payout.paidByAdminName = (admin && admin.name) || '';
  payout.paidByAdminId = admin && admin._id ? String(admin._id) : '';
  if (note) payout.internalNote = String(note).slice(0, 500);
  await payout.save();

  return payout;
};

/**
 * Refuse a request and give the money back.
 *
 * The claim MUST be released or the orders stay stamped for ever: they would
 * disappear from the kitchen's available balance with nothing paid and
 * nothing to show for it, and no route would ever free them again.
 */
const rejectPayout = async (payoutId, { reason, admin } = {}) => {
  const payout = await FoodPayout.findOne({ payoutId, status: 'pending' });
  if (!payout) {
    const current = await FoodPayout.findOne({ payoutId }).lean();
    if (!current) throw new PayoutError('NOT_FOUND', 'No payout with that id.', 404);
    throw new PayoutError('ALREADY_SETTLED', `This payout is already ${current.status}.`, 409);
  }

  payout.status = 'rejected';
  payout.rejectedAt = new Date();
  payout.rejectionReason = String(reason || '').slice(0, 400) || 'Refused by Lampose.';
  payout.paidByAdminName = (admin && admin.name) || '';
  payout.paidByAdminId = admin && admin._id ? String(admin._id) : '';
  await payout.save();

  /* Everything this request was holding goes back to the balance. Matched on
     the payout id rather than on the stored `orderNumbers`, so an order
     stamped by this request but somehow missing from that list is still
     freed — the stamp is the claim, so the stamp is what is cleared. */
  await FoodOrder.updateMany({ payoutId }, { $set: { payoutId: null } });

  return payout;
};

/** What a screen may see. The account is already masked in the document. */
const present = (payout) => ({
  payoutId: payout.payoutId,
  restaurantId: payout.restaurantId,
  restaurantName: payout.restaurantName,
  amount: payout.amount,
  status: payout.status,
  orderCount: payout.orderCount,
  orderNumbers: payout.orderNumbers || [],
  account: payout.account || {},
  requestedAt: payout.requestedAt,
  paidAt: payout.paidAt,
  reference: payout.reference || '',
  paidByAdminName: payout.paidByAdminName || '',
  rejectionReason: payout.rejectionReason || '',
  rejectedAt: payout.rejectedAt,
});

module.exports = {
  PayoutError,
  MIN_REQUEST,
  payableFilter,
  availableFor,
  requestPayout,
  markPaid,
  rejectPayout,
  present,
};
