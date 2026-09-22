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

   ## Approving also HANDS THE OWNER THE WAY IN

   A restaurant onboarded through the Onboard console is filled in by a Lampose
   employee sitting with the owner, and nobody in that room should be choosing
   the owner's password — so those accounts carry a random hash nobody has ever
   seen and cannot be signed into at all. Approval is the moment that has to
   change, and it is the only moment where the account is worth signing into.

   So a genuine transition INTO `approved` mints a password, stores its bcrypt
   hash in the same save as the status, and sends the owner TWO messages:

     SMS       their ID and their password, on the DLT-registered route
     WhatsApp  that they are approved, that the details are in a text, and
               where the console is

   Split because neither channel can carry the whole thing. Meta has refused
   four WhatsApp templates on this account, two of which contained no
   credential at all; DLT text in India is one registered sentence and cannot
   carry a name, a link and an instruction. Each takes the half it is allowed.
   See `infrastructure/twilio/restaurantApprovedTemplate.js` for that record.

   The plaintext exists for the length of that request and is written nowhere:
   not to the document, not to the log, not to the response.

   ## And when the text message does not go

   The owner has no password and nobody can recover the one that was minted —
   it is a bcrypt hash by then, which is the point of it. So that branch mints
   a one-time LINK instead and hands it to the approver to pass on by whatever
   channel reaches the owner. `passwordSetup.util.js` has the token; the link
   is single-use, dies in 48 hours, and is the only thing that ever appears on
   a staff screen. A password never does.

   Which is why it is a TRANSITION and not simply `decision === 'approved'`.
   Approving an already-approved restaurant — a second click, a note being
   corrected — would otherwise mint a second link and kill the one the owner is
   walking towards. Re-issuing on purpose is its own route below.

   A send that fails does not fail the approval: the restaurant is verified
   either way and the queue must not be blocked by a handset that was off. The
   reply says what happened, and `/credentials` sends a fresh link.

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
const { sendRestaurantApproved } = require('../../infrastructure/twilio/twilio');
const { sendPartnerPasswordSms } = require('../../infrastructure/sms/sms');
const { generatePassword } = require('../../shared/utils/password');
const { makePasswordSetup, passwordSetupUrl } = require('./passwordSetup.util');
const { addressLine } = require('../../shared/utils/address');

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

/*
 * Where the owner manages their restaurant. An env var because the console
 * moves host more easily than a template passes review — which is also why it
 * is a template VARIABLE and not words in the body.
 *
 * `RESTAURANT_CONSOLE_URL` is the same one the order alert's button is built
 * from (`foodOrder.notifier.js`, `create-food-order-template.js`): one console,
 * one name for it. A second name for the same host is how two messages end up
 * pointing at different places after a move.
 */
const consoleUrl = () => String(
  process.env.RESTAURANT_CONSOLE_URL || 'https://admin.lampose.com',
).trim().replace(/\/+$/, '');

/**
 * Tell the owner their restaurant is live, and give them the way in.
 *
 * Two messages to one number, reported separately because they fail
 * independently and mean different things:
 *
 *   sent    did the SMS carrying the ID and password arrive — the one that
 *           decides whether the owner can sign in at all
 *   notice  did the WhatsApp go — approved, listed, and where the console is
 *           (it says nothing about the credential; Meta refused three that did)
 *
 * Returns and NEVER throws: the caller is in the middle of a decision that has
 * already been made, and a messaging failure is not a reason to fail it or to
 * leave it half-written.
 *
 * The caller saves the password's hash. That is deliberate — it belongs in the
 * same write as whatever else is changing, so there is no window in which a
 * restaurant is approved with a credential that was not stored, or the reverse.
 * The RECOVERY link, minted only when the SMS fails, is saved here because
 * until then there is no reason for one to exist.
 */
const issueCredentials = async (restaurant, password) => {
  /* The credential first: if this is the half that fails, the WhatsApp that
     follows is a message telling somebody their details are in a text they
     never got, and the approver needs to know which half went. */
  /*
   * The ID is PRINTED as the plain ten digits, not as +91….
   *
   * `login` matches a phone on its last ten digits, so all three spellings get
   * the same account — and this is the one an owner would type unprompted. It
   * also keeps a "+" out of a DLT variable, which is registered as Numeric.
   * The number the text is SENT to is still the E.164 one beside it.
   */
  const loginId = String(restaurant.ownerPhone || '').replace(/\D/g, '').slice(-10)
    || restaurant.ownerPhone;

  const sms = await sendPartnerPasswordSms(restaurant.ownerPhone, loginId, password);

  const notice = await sendRestaurantApproved({
    ownerPhone: restaurant.ownerPhone,
    ownerName: restaurant.ownerName,
    restaurantName: restaurant.restaurantName,
    /* The same assembly a rider is given (`shared/utils/address.js`), so the
       owner reads back the address we will actually send people to — and sees
       it now, while a wrong one is still cheap to correct. */
    address: addressLine(restaurant.address),
    consoleUrl: consoleUrl(),
  });

  /* The numbers and the outcomes, never the password. A credential in a log
     file is a credential in every backup of that log file. */
  console.log(
    `${BADGE} [Food Admin] sign-in details for ${restaurant.restaurantId} → ${restaurant.ownerPhone}: `
    + `SMS ${sms.success ? 'sent' : `NOT SENT (${sms.error})`}, `
    + `notice ${notice.success ? 'sent' : `NOT SENT (${notice.error})`}`,
  );

  if (sms.success) {
    return {
      sent: true,
      error: null,
      notice: { sent: Boolean(notice.success), error: notice.success ? null : (notice.error || 'The WhatsApp message could not be sent.') },
    };
  }

  /*
   * THE HAND-OFF, and only on this branch.
   *
   * The password that was just minted is unrecoverable by design, so there is
   * nothing to re-read and nothing to show. A one-time link is minted instead
   * and given to the approver — who just decided to list this restaurant, and
   * can mint another whenever they like — to carry the rest of the way.
   *
   * Saved in its own write because it belongs to this failure rather than to
   * the decision, and because the decision has already been committed by the
   * time we know the SMS did not go.
   */
  const minted = makePasswordSetup();
  restaurant.passwordSetup = minted.setup;
  try {
    await restaurant.save();
  } catch (error) {
    logError('storing a recovery link', error);
    return {
      sent: false,
      error: sms.error || 'The SMS could not be sent.',
      notice: { sent: Boolean(notice.success), error: notice.success ? null : (notice.error || null) },
    };
  }

  return {
    sent: false,
    error: sms.error || 'The SMS could not be sent.',
    notice: { sent: Boolean(notice.success), error: notice.success ? null : (notice.error || null) },
    setupUrl: passwordSetupUrl(consoleUrl(), minted.token),
  };
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

    /* The credential, minted before the save so its hash goes in with the
       status — see the header. A restaurant that was already approved keeps
       the password its owner is holding. */
    const issuing = decision === 'approved' && before !== 'approved';
    const password = issuing ? generatePassword() : null;
    if (issuing) restaurant.passwordHash = await FoodRestaurant.hashPassword(password);

    await restaurant.save();

    /* AFTER the write, and its failure is reported rather than thrown: the
       restaurant is verified whatever the messages did. */
    const credentials = issuing ? await issueCredentials(restaurant, password) : null;

    console.log(
      `${BADGE} [Food Admin] ${restaurant.restaurantName} (${restaurantId}) ` +
      `${before} → ${decision} by ${req.admin?.email || 'unknown admin'}` +
      `${note ? ` — "${note}"` : ''}`,
    );

    /* The approver is told about the message in the same sentence as the
       decision, because "approved" and "the owner has no way in" are one
       thing to them and two things to us. */
    const listed = `${restaurant.restaurantName} is approved and now listed`;
    const approvedLine = (() => {
      if (!credentials) return `${listed}.`;
      if (!credentials.sent) {
        return `${listed}, but the text message with their sign-in details did not go `
          + `(${credentials.error}). The owner cannot sign in yet.`;
      }
      if (!credentials.notice.sent) {
        return `${listed}. Sign-in details sent by SMS to ${restaurant.ownerPhone}, `
          + `but the WhatsApp notice did not go (${credentials.notice.error}).`;
      }
      return `${listed}. Sign-in details sent by SMS to ${restaurant.ownerPhone}.`;
    })();

    return res.json({
      success: true,
      message:
        decision === 'approved'
          ? approvedLine
          : decision === 'rejected'
            ? `${restaurant.restaurantName} was rejected and is not listed.`
            : `${restaurant.restaurantName} was put back in the queue.`,
      data: {
        restaurantId,
        verificationStatus: restaurant.verificationStatus,
        verificationNote: restaurant.verificationNote,
        isActive: restaurant.isActive,
        verifiedAt: restaurant.verifiedAt,
        /* Null on anything but a fresh approval. `sent` is the only thing the
           console needs; the password itself is never in a response. */
        credentials,
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

// @route   POST /api/v1/admin/food-restaurants/:restaurantId/credentials
// @desc    Mint a new password for an approved restaurant and send it again
// @access  Admin console — the same capability that approves one
/**
 * Because a message that did not arrive is the ordinary failure here.
 *
 * A handset that was off, a number typed wrong on the application, a template
 * Meta had not approved yet, a link left for three days: in every one of those
 * the restaurant is approved and the owner cannot get in, and the only other
 * remedy is a developer running `set-partner-password.js` against the
 * database.
 *
 * It mints a NEW password rather than resending the old one, because the old
 * one exists only as a bcrypt hash — by design. The cost is that a resend
 * invalidates details the owner may in fact have received, which is why it is
 * a button somebody presses rather than anything automatic.
 */
const resendCredentials = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const restaurantId = String(req.params.restaurantId || '').trim();
    const restaurant = await FoodRestaurant.findOne({ restaurantId });
    if (!restaurant) return fail(res, 404, 'NOT_FOUND', 'No application with that reference.');

    /* Sign-in details for an account nobody has verified would be an invitation
       to a console for a restaurant we have not agreed to list. */
    if (restaurant.verificationStatus !== 'approved') {
      return fail(res, 409, 'NOT_APPROVED', 'Only an approved restaurant has a console to sign in to.');
    }

    if (!restaurant.ownerPhone) {
      return fail(res, 409, 'NO_PHONE', 'This application has no owner mobile number to send to.');
    }

    const password = generatePassword();
    restaurant.passwordHash = await FoodRestaurant.hashPassword(password);
    await restaurant.save();

    const credentials = await issueCredentials(restaurant, password);
    console.log(
      `${BADGE} [Food Admin] set-password link re-issued for ${restaurantId} by ${req.admin?.email || 'unknown admin'}`,
    );

    if (!credentials.sent) {
      /* 200, not an error: the password WAS changed, so a caller that read a
         4xx as "nothing happened" would tell the owner that their old details
         still work. */
      return res.json({
        success: true,
        message: `New details were set, but the text message did not send (${credentials.error}). `
          + 'The owner still cannot sign in.',
        data: { restaurantId, credentials },
      });
    }

    return res.json({
      success: true,
      message: `New sign-in details sent by SMS to ${restaurant.ownerPhone}.`,
      data: { restaurantId, credentials },
    });
  } catch (error) {
    logError('admin/food-restaurants/:id/credentials', error);
    return next(error);
  }
};

module.exports = {
  listRestaurants, getRestaurant, decideRestaurant, setActive, resendCredentials,
};
