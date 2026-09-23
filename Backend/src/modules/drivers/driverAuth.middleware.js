/* ══════════════════════════════════════════════════════════════════════════
   Bearer tokens for riders — a SIXTH identity system in this process.

   There are now six, and they must never verify each other's tokens:

     admins            v1, /api/v1/admin/login           the onboarding console
     scriper_users     v2, /api/v2/auth/login            staff, the leads panel
     app_customers     v2, /api/v2/customers/auth/…      students, the User App
     app_partners      v2, /api/v2/partners/auth/…       owners, Stay Partner
     food_restaurants  v2, /api/v2/food-partners/auth/…  restaurants, Food-Partner
     app_drivers       v2, /api/v2/drivers/auth/…        riders, the Driver app

   They share one signing secret because they share one process, which means a
   token from any of the six will `jwt.verify` against the other five. What
   keeps them apart is the payload: every driver token carries `typ: 'driver'`,
   and `requireDriver` below refuses anything without it. A diner's token
   therefore cannot accept a delivery offer even though it verifies, and a
   rider's token cannot read a restaurant's payout details.

   The reasoning against a per-audience secret is the one
   `customers/customerAuth.middleware.js` sets out, and it gets stronger with
   each audience: a sixth secret is a sixth thing to configure, rotate and get
   wrong in a deployment, and a secret missing from one environment does not
   fail loudly — it fails as "every rider is signed out and nobody knows why".

   Nothing here is bolted onto the five guards that already exist. This file
   asserts its own claim and leaves them alone.

   ## The database read is not optional

   `requireDriver` loads the rider on every request. Without it a suspended
   rider keeps full access for the remaining week of their token's life —
   which is exactly the window in which somebody is suspended. The status is
   also the reason the app can send them to the right screen: a `pending`
   rider is waiting for approval and a `suspended` one needs support, and a
   login form helps neither.

   ## There are TWO session guards, and the second one is for support

   `requireDriver` refuses a suspended rider everywhere. That is right for
   every route in this module and wrong for exactly one route outside it: the
   support desk the refusal itself tells them to use. So
   `requireDriverForSupport` exists beside it, admits a suspended rider, and is
   mounted on `/api/v2/drivers/support` and nowhere else. It is a separate
   export rather than an option on the first for the reason set out on it — the
   same reason this file does not widen a guard to understand a second
   audience.

   ## Approval is checked HERE, not per route

   `requireApprovedDriver` is the guard on everything that touches a live
   order. Putting it at the mount point rather than inside each handler is
   what makes "approved" mean something: there is no route in this module
   through which an unapproved rider can be offered, accept or complete work,
   and no handler has to remember to check.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

const config = require('../../config/env');
const Driver = require('./driver.model');

/* The claim that separates this audience from the other five. Changing it
   signs every rider out — correct behaviour for a claim whose whole job is to
   be checked, but a deployment decision rather than a tidy-up. */
const TOKEN_TYPE = 'driver';

/**
 * A session for the Driver app.
 *
 * `sub` is the driverId — the `DR-XXXXXXXX` public id — rather than the Mongo
 * `_id`, matching what every route here looks up, what an order's
 * `delivery.driverId` holds, what the socket room is named after and what the
 * device stores.
 *
 * Three claims, and no more. A JWT is base64, not encryption: everything put
 * in it is readable by anyone holding it, so the licence number, the position
 * and the approval status stay out and are read from the database on every
 * request — which is also the only way they can be current.
 *
 * Returns null when `JWT_SECRET` is missing in production. Every route that
 * signs a token mounts `requireAuthConfig` ahead of this, so it cannot
 * normally be reached; the null is there so a forgotten guard becomes a named
 * 503 rather than a 500 thrown from inside jsonwebtoken.
 */
const signDriverToken = (driver, { expiresIn } = {}) => {
  if (!config.auth.configured) return null;
  return jwt.sign(
    { sub: driver.driverId, typ: TOKEN_TYPE, phone: driver.phone },
    config.auth.jwtSecret,
    { expiresIn: expiresIn || config.auth.jwtExpiresIn },
  );
};

const readToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

/* All four keys on every denial, for the reason `foodPartnerAuth.middleware`
   gives: different clients read `message`, `error` and `code`, and answering
   all of them costs one line and removes the whole class of "the error screen
   said undefined". */
const deny = (res, message, code = 'UNAUTHORIZED', status = 401) => res.status(status).json({
  success: false, code, message, error: message,
});

/**
 * Verify the bearer, and load the rider it names.
 *
 * The part BOTH guards below share, and deliberately the part with no policy
 * in it: it answers "whose session is this", not "may they be here". Every
 * refusal it can make is about the token or the account existing at all.
 *
 * Answers `{ driver }` on success, or `{ denial }` having already written the
 * response — the caller returns that value so a refusal reads the same way at
 * every call site. `jwt.verify` throws, and is caught by the caller.
 */
const identifyDriver = async (req, res) => {
  if (!config.auth.configured) {
    return { denial: deny(res, 'Sign-in is unavailable right now.', 'AUTH_NOT_CONFIGURED', 503) };
  }

  const token = readToken(req);
  if (!token) return { denial: deny(res, 'Please sign in to continue.') };

  const decoded = jwt.verify(token, config.auth.jwtSecret);

  /* The five other token types verify against the same secret. This is the
     line that stops them being a rider session. */
  if (decoded.typ !== TOKEN_TYPE) {
    return { denial: deny(res, 'That session is not valid for this app.', 'WRONG_TOKEN_TYPE') };
  }

  const driver = await Driver.findOne({ driverId: decoded.sub });
  if (!driver) return { denial: deny(res, 'This account no longer exists.', 'ACCOUNT_GONE') };
  /* Erased by a deletion request (accountDeletion.eraser.js): the row stays
     for the records that point at it, but it is nobody's account now. */
  if (driver.deletion && driver.deletion.status === 'completed') {
    return { denial: deny(res, 'This account no longer exists.', 'ACCOUNT_GONE') };
  }

  return { driver };
};

/** The two token failures, worded once. */
const tokenError = (error, res, next) => {
  if (error.name === 'TokenExpiredError') {
    return deny(res, 'Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
  }
  if (error.name === 'JsonWebTokenError') return deny(res, 'Invalid session.', 'BAD_TOKEN');
  return next(error);
};

/**
 * Requires a valid rider session, and loads the rider.
 *
 * Does NOT require approval — see `requireApprovedDriver`. A pending rider
 * must still be able to read `/me`, finish onboarding and upload a licence,
 * or approval could never happen.
 *
 * It DOES refuse a suspended one, everywhere it is mounted. The single route
 * that has to admit them is the support desk this very refusal sends them to,
 * and it has its own guard rather than a flag on this one — see
 * `requireDriverForSupport`.
 */
async function requireDriver(req, res, next) {
  try {
    const { driver, denial } = await identifyDriver(req, res);
    if (!driver) return denial;

    /* Suspension bites here rather than at approval, because a suspended
       rider must be stopped from every route including the read-only ones —
       and told why, so the app can show the support screen rather than a
       login form that will not help. */
    if (driver.status === 'suspended') {
      /* The operator's own sentence, when there is one.
         `driverAdmin.controller.js` REFUSES a suspension with no reason on the
         grounds that the rider is shown it — and until this line existed, they
         were not: every suspended rider got the same generic string, and the
         reason an administrator was made to type went nowhere. A rider who
         cannot find out why they are off the road rings support, which is the
         cost this avoids. */
      return deny(
        res,
        driver.statusReason
          ? `Your account is on hold: ${driver.statusReason}`
          : 'Your account is on hold. Please contact Lampose support.',
        'ACCOUNT_SUSPENDED',
        403,
      );
    }

    req.driver = driver;
    return next();
  } catch (error) {
    return tokenError(error, res, next);
  }
}

/**
 * The support router's guard, and nothing else's.
 *
 * Identical to `requireDriver` but for the one line it does not have: a
 * suspended rider gets through here.
 *
 * ## Why this is a second export and not a flag on the first
 *
 * The standing rule in this codebase is that no guard is ever widened to
 * understand a second case — the reasoning is written out in
 * `support/ticket.routes.js` and it applies to a status just as it applies to
 * an audience. A `requireDriver(req, res, next, { allowSuspended })` would put
 * the decision at the CALL SITE, where it is a parameter somebody copies onto
 * a route that should not have it; a separate function puts it in the name, so
 * a route that admits a suspended rider says so in the line that mounts it and
 * is visible in one grep.
 *
 * ## Why a suspended rider gets in at all
 *
 * Because the alternative is what the product actually did: `requireDriver`
 * answers a suspended rider `403 ACCOUNT_SUSPENDED` with the sentence "please
 * contact Lampose support", and support was behind that same guard. The one
 * person the message names is the one person it locked out, and the only way
 * left to them was to ring a number the app does not print. A rider whose
 * documents were just refused, or who was taken off the road over a complaint
 * they dispute, is the rider with the most to say and the least ability to
 * say it.
 *
 * Nothing else moves. This mounts on `/api/v2/drivers/support` alone: a
 * suspended rider can open a ticket and read the replies, and is still refused
 * at duty, at the offer, and at every route that touches a live order. Filing
 * a complaint is not riding.
 */
async function requireDriverForSupport(req, res, next) {
  try {
    const { driver, denial } = await identifyDriver(req, res);
    if (!driver) return denial;

    req.driver = driver;
    return next();
  } catch (error) {
    return tokenError(error, res, next);
  }
}

/**
 * Everything that touches a live order sits behind this.
 *
 * Runs AFTER `requireDriver`, which has already loaded the document — so this
 * is a field check rather than a second database read. The codes are distinct
 * per state on purpose: the app routes `pending` to "we are reviewing your
 * documents" and `rejected` to support, and one shared `FORBIDDEN` would send
 * both to the same dead end.
 */
function requireApprovedDriver(req, res, next) {
  const { driver } = req;
  if (!driver) return deny(res, 'Please sign in to continue.');

  if (driver.status === 'approved') return next();

  if (driver.status === 'pending') {
    return deny(
      res,
      'Your account is still being reviewed. We will let you know as soon as it is approved.',
      'APPROVAL_PENDING',
      403,
    );
  }
  return deny(
    res,
    'This account cannot take deliveries. Please contact Lampose support.',
    'NOT_APPROVED',
    403,
  );
}

module.exports = {
  TOKEN_TYPE,
  signDriverToken,
  requireDriver,
  requireDriverForSupport,
  requireApprovedDriver,
};
