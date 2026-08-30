/* ══════════════════════════════════════════════════════════════════════════
   The admin console's side of food-partner onboarding.

   A restaurant applies from the partner app and lands in `food_restaurants`
   with `verificationStatus: 'pending'`. Nobody is listed to a diner until a
   person has looked at the documents and approved it. These handlers are that
   person's tools: the queue, one application in full, and the decision.

   ## This is the v1 admin surface, not the v2 partner one

   It mounts under `/api/v1/admin/food-restaurants` behind `verifyAdminToken`,
   because the reader is an administrator in the `admins` collection — a
   different identity system from the restaurant's own session entirely. The
   partner routes in `foodPartner.routes.js` never expose any of this, and no
   handler here ever accepts a food-partner token. See the fifth-identity note
   in `foodPartnerAuth.middleware.js`.

   ## Approving is the ONLY thing that lists a restaurant

   `verificationStatus` and `isActive` are server-decided everywhere else in
   this module precisely so that this file is the one place they move. The
   partner app cannot set them, `PATCH /me` refuses them, and the public
   discovery feed filters on both. That is what makes "approved" mean
   something.

   `isActive` is set true on approval and false on rejection. They are separate
   fields rather than one because a listed restaurant can later be paused
   without un-approving it — the documents were still verified.

   ## What an approver is shown

   Everything the partner sent, including the document numbers and the payout
   account — this is the one reader in the system who is supposed to see them,
   which is why `+payout.bankAccountNumber` is selected explicitly here and
   nowhere else. The public routes assert the opposite with an explicit
   projection.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const FoodProduct = require('./foodProduct.model');
const FoodRestaurant = require('./foodRestaurant.model');
const { BADGE, logError } = require('./foodPartner.log');

const { VERIFICATION_STATUSES } = FoodRestaurant;

const LIST_LIMIT = 100;

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const dbDown = (res) => fail(
  res,
  503,
  'DB_DISCONNECTED',
  'The server is running but not connected to the database.',
);

const isUp = () => mongoose.connection.readyState === 1;

/** A user-supplied string going into a regex unescaped is a denial of service. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The columns the console's table actually draws. Whole documents would make
    a hundred-row queue several megabytes for no benefit. */
const LIST_PROJECTION = [
  'restaurantId', 'restaurantName', 'ownerName', 'ownerEmail', 'ownerPhone',
  'description', 'cuisineTypes', 'logoImage', 'coverBannerImage',
  'address', 'contactNumber', 'verificationStatus', 'verificationNote',
  'isActive', 'ratingAvg', 'ratingCount', 'avgPreparationTime',
  'deliveryRadiusKm', 'minOrderValue', 'createdAt', 'verifiedAt',
].join(' ');

// @route   GET /api/v1/admin/food-restaurants
// @desc    The approval queue — every application, filterable by status
// @access  Admin console (verifyAdminToken)
const listRestaurants = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const filter = {};

    const status = String(req.query.status || '').trim();
    if (status && status !== 'all') {
      if (!VERIFICATION_STATUSES.includes(status)) {
        return fail(res, 400, 'BAD_INPUT', `"status" must be one of: ${VERIFICATION_STATUSES.join(', ')}.`);
      }
      filter.verificationStatus = status;
    }

    const search = String(req.query.search || '').trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { restaurantName: rx },
        { ownerName: rx },
        { ownerEmail: rx },
        { restaurantId: rx },
        { 'address.city': rx },
      ];
    }

    const limit = Math.min(Number(req.query.limit) || LIST_LIMIT, LIST_LIMIT);

    const [rows, tally] = await Promise.all([
      FoodRestaurant.find(filter).select(LIST_PROJECTION).sort({ createdAt: -1 }).limit(limit).lean(),
      FoodRestaurant.aggregate([{ $group: { _id: '$verificationStatus', n: { $sum: 1 } } }]),
    ]);

    /* The menu size is what an approver glances at to judge whether an
       application is real. One grouped count beats N queries. */
    const ids = rows.map((r) => r.restaurantId);
    const menuCounts = ids.length
      ? await FoodProduct.aggregate([
        { $match: { restaurantId: { $in: ids } } },
        { $group: { _id: '$restaurantId', n: { $sum: 1 } } },
      ])
      : [];
    const byId = menuCounts.reduce((acc, row) => ({ ...acc, [row._id]: row.n }), {});

    const counts = tally.reduce(
      (acc, row) => ({ ...acc, [row._id]: row.n }),
      { pending: 0, approved: 0, rejected: 0 },
    );

    return res.json({
      success: true,
      count: rows.length,
      counts,
      data: rows.map((r) => ({ ...r, menuItemCount: byId[r.restaurantId] || 0 })),
    });
  } catch (error) {
    logError('admin/food-restaurants', error);
    return next(error);
  }
};

// @route   GET /api/v1/admin/food-restaurants/:restaurantId
// @desc    One application in full, with its menu — what a decision is made on
// @access  Admin console (verifyAdminToken)
const getRestaurant = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const restaurantId = String(req.params.restaurantId || '').trim();

    /* The approver is the one reader who is meant to see the payout account
       and the document numbers, so the two `select: false` fields are asked
       for explicitly. `passwordHash` is NOT among them and never should be. */
    const restaurant = await FoodRestaurant.findOne({ restaurantId })
      .select('+payout.bankAccountNumber')
      .lean();

    if (!restaurant) {
      return fail(res, 404, 'NOT_FOUND', 'No application with that reference.');
    }
    delete restaurant.passwordHash;

    const products = await FoodProduct.find({ restaurantId })
      .sort({ category: 1, displayOrder: 1 })
      .lean();

    /* Grouped the way the console renders it — and the way the partner built
       it — rather than as a flat list the UI would have to regroup. */
    const menu = products.reduce((acc, product) => {
      const bucket = acc.find((g) => g.category === product.category);
      if (bucket) bucket.items.push(product);
      else acc.push({ category: product.category, items: [product] });
      return acc;
    }, []);

    return res.json({
      success: true,
      data: { restaurant, menu, menuItemCount: products.length },
    });
  } catch (error) {
    logError('admin/food-restaurants/:id', error);
    return next(error);
  }
};

// @route   PATCH /api/v1/admin/food-restaurants/:restaurantId/decision
// @desc    Approve or reject an application. The only path that lists a kitchen.
// @access  Admin console (verifyAdminToken)
const decideRestaurant = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const restaurantId = String(req.params.restaurantId || '').trim();
    const decision = String((req.body || {}).decision || '').trim();
    const note = String((req.body || {}).note || '').trim().slice(0, 500);

    if (!['approved', 'rejected', 'pending'].includes(decision)) {
      return fail(res, 400, 'BAD_INPUT', '"decision" must be "approved", "rejected" or "pending".');
    }

    /* A rejection with no reason is useless to the restaurant reading it in
       the app — the status screen shows this string verbatim as "what needs
       fixing", so an empty one leaves them with nothing to act on. */
    if (decision === 'rejected' && !note) {
      return fail(res, 400, 'BAD_INPUT', 'A rejection needs a reason — the partner is shown it in the app.');
    }

    const restaurant = await FoodRestaurant.findOne({ restaurantId });
    if (!restaurant) {
      return fail(res, 404, 'NOT_FOUND', 'No application with that reference.');
    }

    const before = restaurant.verificationStatus;

    restaurant.verificationStatus = decision;
    restaurant.verificationNote = decision === 'rejected' ? note : note || '';
    restaurant.verifiedAt = decision === 'pending' ? null : new Date();
    /* Approval is what lists a kitchen; rejection un-lists it. They are
       separate fields so an approved restaurant can later be paused without
       throwing away the verification. */
    restaurant.isActive = decision === 'approved';

    await restaurant.save();

    console.log(
      `${BADGE} [Food Admin] ${restaurant.restaurantName} (${restaurantId}) ` +
      `${before} → ${decision} by ${req.admin?.email || 'unknown admin'}` +
      `${note ? ` — "${note}"` : ''}`,
    );

    return res.json({
      success: true,
      message:
        decision === 'approved'
          ? `${restaurant.restaurantName} is approved and now listed.`
          : decision === 'rejected'
            ? `${restaurant.restaurantName} was rejected and is not listed.`
            : `${restaurant.restaurantName} was put back in the queue.`,
      data: {
        restaurantId,
        verificationStatus: restaurant.verificationStatus,
        verificationNote: restaurant.verificationNote,
        isActive: restaurant.isActive,
        verifiedAt: restaurant.verifiedAt,
      },
    });
  } catch (error) {
    logError('admin/food-restaurants/:id/decision', error);
    return next(error);
  }
};

// @route   PATCH /api/v1/admin/food-restaurants/:restaurantId/active
// @desc    Pause or resume an already-approved listing
// @access  Admin console (verifyAdminToken)
const setActive = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const restaurantId = String(req.params.restaurantId || '').trim();
    const isActive = Boolean((req.body || {}).isActive);

    const restaurant = await FoodRestaurant.findOne({ restaurantId });
    if (!restaurant) return fail(res, 404, 'NOT_FOUND', 'No application with that reference.');

    /* Pausing an unapproved restaurant is meaningless, and RESUMING one would
       list a kitchen nobody verified — which is the one thing this whole file
       exists to prevent. */
    if (restaurant.verificationStatus !== 'approved') {
      return fail(res, 409, 'NOT_APPROVED', 'Only an approved restaurant can be paused or resumed.');
    }

    restaurant.isActive = isActive;
    await restaurant.save();

    console.log(
      `${BADGE} [Food Admin] ${restaurant.restaurantName} (${restaurantId}) ` +
      `${isActive ? 'resumed' : 'paused'} by ${req.admin?.email || 'unknown admin'}`,
    );

    return res.json({ success: true, data: { restaurantId, isActive: restaurant.isActive } });
  } catch (error) {
    logError('admin/food-restaurants/:id/active', error);
    return next(error);
  }
};

module.exports = { listRestaurants, getRestaurant, decideRestaurant, setActive };
