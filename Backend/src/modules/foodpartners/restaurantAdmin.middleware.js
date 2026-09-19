/* ══════════════════════════════════════════════════════════════════════════
   The Restaurant Admin session — a SIXTH token type, for the web console.

   The admin panel at Admin/ now has two front doors. One is the Lampose
   staff console (`admins`, `typ: 'admin'`, /api/v1/admin/login). The other is
   this: a restaurant OWNER signing in to work their own orders and their own
   menu from a browser, with the same email-or-phone and password they already
   use in the Food-Partner mobile app.

   ## Why a sixth token type and not simply the fifth

   The credentials are shared. The SESSION is not.

     typ 'foodpartner'        the mobile app. `jwtExpiresIn`, 7 days.
     typ 'restaurant_admin'   this console. 12 hours, and it can reach a
                              route surface the app has never had.

   Two reasons they stay apart, and both of them are the reason every other
   identity in this process is kept apart from every other:

   1. A browser on a desk in a shop office is not a phone in somebody's
      pocket. The mobile session is a week long because re-typing a password
      on a handset is a real cost and the device has a lock screen. A laptop
      in a kitchen is shared, is left logged in, and is the case a short
      session exists for. `admins/adminToken.js` reached the same conclusion
      about the staff console for the same reason.

   2. A token issued for one surface should not silently unlock another. If
      the two shared a type, then every Food-Partner app token in circulation
      today — issued before this console existed, to a device nobody in
      operations can see — would already be a valid console session. Making
      the console's token its own type means access to it starts when somebody
      signs in to it, and revoking it is a question that can be answered.

   The reverse holds too: a `restaurant_admin` token cannot call the mobile
   app's `/api/v2/food-partners/me/*` routes, because `requireFoodPartner`
   tests for `typ: 'foodpartner'` and nothing else. Neither guard was widened
   to understand the other. That is the rule this module was built on and the
   header of `foodPartnerAuth.middleware.js` is where it is written down.

   ## Why the guard sets `req.foodPartner` as well as `req.restaurantAdmin`

   Deliberately, and it is the most important line in this file.

   The routes this console calls to move an order forward are the SAME
   decisions the kitchen tablet makes, and those decisions are not a status
   field — accepting an order starts the rider search, rejecting one cancels
   the dispatch, frees a stranded rider, flags prepaid money as owed back and
   pushes a notification to the diner, and marking food ready re-broadcasts an
   order nobody took. All of that lives in `foodOrder.controller.js`, reads
   `req.foodPartner`, and is a hundred lines of consequence that must not be
   typed a second time. A console that "accepted" an order without summoning a
   rider would be a quieter bug than a crash and a worse one.

   So the ROUTES are separate, the GUARD is separate, the TOKEN is separate —
   and the handlers behind the order and menu paths are the ones the mobile
   app already proves every day. Setting `req.foodPartner` to the same
   document is what lets them be called unchanged. `req.restaurantAdmin` is
   set beside it so anything written FOR this console can tell which door the
   request came through.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

const config = require('../../config/env');
const FoodRestaurant = require('./foodRestaurant.model');

/** The claim that tells this session apart from the other five. */
const TOKEN_TYPE = 'restaurant_admin';

/**
 * How long a console session lasts.
 *
 * Twelve hours by default — the same figure `admins/adminToken.js` chose for
 * the staff console, for the same reason: it outlives a working day and does
 * not outlive a machine somebody walked away from. Its own environment knob
 * rather than a reuse of `ADMIN_SESSION_TTL`, because they are two decisions
 * that happen to agree today and shortening one should not move the other.
 */
const SESSION_TTL = process.env.RESTAURANT_ADMIN_SESSION_TTL
  || config.auth.adminSessionTtl
  || '12h';

/**
 * A console session for one restaurant.
 *
 * `sub` is the `FP-XXXXXXXX` restaurantId, matching the app's token and every
 * lookup in this module. Three claims and no more: a JWT is base64, not
 * encryption, so the owner's email, payout details and verification status
 * stay out of it and are read from the database on every request — which is
 * also the only way they can be current.
 *
 * Returns null when JWT_SECRET is missing in production. The login route
 * mounts `requireAuthConfig` ahead of this, so it cannot normally be reached;
 * the null is here so a forgotten guard becomes a named 503 rather than a 500
 * thrown from inside jsonwebtoken.
 */
const signRestaurantAdminToken = (restaurant, { expiresIn } = {}) => {
  if (!config.auth.configured) return null;
  return jwt.sign(
    { sub: restaurant.restaurantId, typ: TOKEN_TYPE, name: restaurant.restaurantName },
    config.auth.jwtSecret,
    { expiresIn: expiresIn || SESSION_TTL },
  );
};

const readToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

/* All four keys on every refusal, for the reason `foodPartnerAuth.middleware`
   gives: the clients read failures differently and answering all four costs
   one line. */
const deny = (res, message, code = 'UNAUTHORIZED') => res.status(401).json({
  success: false, code, message, error: message,
});

const notConfigured = (res) => {
  const message = 'Sign-in is unavailable right now.';
  return res.status(503).json({
    success: false, code: 'AUTH_NOT_CONFIGURED', message, error: message,
  });
};

/**
 * Requires a valid Restaurant Admin session and loads the restaurant.
 *
 * The database read is not optional, for the reason `requireFoodPartner`
 * gives: without it a rejected restaurant keeps a working console for the
 * remaining life of its token, and "a working console" here means editing a
 * menu that customers are ordering from. One indexed lookup on `restaurantId`.
 *
 * `passwordHash` and `payout.bankAccountNumber` are `select: false` on the
 * model, so the document arrives without them. Login is the one route that
 * asks for the hash back, and it is not this one.
 */
async function requireRestaurantAdmin(req, res, next) {
  try {
    if (!config.auth.configured) return notConfigured(res);

    const token = readToken(req);
    if (!token) return deny(res, 'Please sign in to continue.');

    const decoded = jwt.verify(token, config.auth.jwtSecret);

    /* Every one of the six identities in this process verifies against the
       same secret. This is the line that stops a staff token, a diner's
       token, a rider's token or the restaurant's own MOBILE token from being
       a console session. */
    if (decoded.typ !== TOKEN_TYPE) {
      return deny(
        res,
        'That session is not valid for the restaurant console. Please sign in again.',
        'WRONG_TOKEN_TYPE',
      );
    }

    const restaurant = await FoodRestaurant.findOne({ restaurantId: decoded.sub });
    if (!restaurant) return deny(res, 'This account no longer exists.', 'ACCOUNT_GONE');

    /* Rejected is a dead end and the console must be able to draw a screen for
       it, with the reason — a generic 401 sends the owner to a sign-in screen
       that keeps accepting their password and keeps landing them back here.
       `isActive: false` is deliberately NOT a refusal: an approved kitchen
       that has switched itself closed for a fortnight still needs its
       dashboard, and a pending one needs to type its menu. Same reasoning,
       same three lines, as `requireFoodPartner`. */
    if (restaurant.verificationStatus === 'rejected') {
      const message = restaurant.verificationNote
        ? `This application was not approved: ${restaurant.verificationNote}`
        : 'This application was not approved. Please contact Lampose.';
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_REJECTED',
        message,
        error: message,
        data: {
          verificationStatus: restaurant.verificationStatus,
          verificationNote: restaurant.verificationNote || '',
        },
      });
    }

    /* The two names for one document — see the file header. `foodPartner` is
       what the shared order and menu handlers read; `restaurantAdmin` says
       which door this request came through. */
    req.restaurantAdmin = restaurant;
    req.foodPartner = restaurant;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return deny(res, 'Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
    }
    if (error.name === 'JsonWebTokenError') return deny(res, 'Invalid session.', 'BAD_TOKEN');
    /* Anything else is a real fault and belongs to the error handler rather
       than to a 401 that would sign an owner out over a server problem. */
    return next(error);
  }
}

module.exports = {
  TOKEN_TYPE,
  SESSION_TTL,
  signRestaurantAdminToken,
  requireRestaurantAdmin,
};
