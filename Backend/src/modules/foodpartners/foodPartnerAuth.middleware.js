/* ══════════════════════════════════════════════════════════════════════════
   Bearer tokens for food partners — a FIFTH identity system in this process.

   There are now five, and they must never verify each other's tokens:

     admins            v1, /api/v1/admin/login           the onboarding console
     scriper_users     v2, /api/v2/auth/login            staff, the leads panel
     app_customers     v2, /api/v2/customers/auth/…      students, the User App
     app_partners      v2, /api/v2/partners/auth/…       owners, Stay Partner
     food_restaurants  v2, /api/v2/food-partners/auth/…  restaurants, Food-Partner

   They share one signing secret because they share one process, which means a
   token from any of the five will `jwt.verify` against the other four. What
   keeps them apart is the payload: every food-partner token carries
   `typ: 'foodpartner'`, and `requireFoodPartner` below refuses anything
   without it. A customer token therefore cannot read a restaurant's payout
   details even though it verifies, and a restaurant's token cannot read a
   student's saved listings.

   The alternative — a separate JWT_SECRET per audience — was considered and
   rejected for the reason `customers/customerAuth.middleware.js` gives, and it
   is a stronger reason at five audiences than it was at three: it is a second
   (now a fifth) secret to configure, rotate and get wrong in a deployment, and
   the `typ` claim gets the same result with none of that. A secret missing
   from one environment does not fail loudly; it fails as "everybody is signed
   out of the food app and nobody knows why".

   Nothing here is bolted onto the four middlewares that already exist. They
   are guards used by four shipping frontends, and widening one of them to also
   understand restaurants is how a change meant for this module reaches the
   others. This file asserts its own claim and leaves them alone.

   ## Two token types, one header

   This module issues two, and they travel in the same `Authorization: Bearer`
   header:

     typ 'foodpartner'         a session. `sub` is the restaurantId.
     typ 'foodpartner_phone'   proof that somebody holds a phone number, and
                               nothing else. `sub` is the E.164 number.

   One header rather than a second custom one, precisely because the `typ`
   claim already tells them apart — `POST /uploads/images` accepts either (a
   partner replacing their logo, or an applicant uploading an FSSAI scan before
   any account exists), and one read path that branches on `typ` is smaller and
   harder to get wrong than two headers each with their own reader. The two are
   mutually exclusive: `requireFoodPartner` refuses the phone token and
   `requireVerifiedPhone` refuses the session token, both with
   `WRONG_TOKEN_TYPE`.

   ## What the phone token is NOT

   It proves that the caller answered an SMS on that number. It does not say
   the application it accompanies is about that number — `requireVerifiedPhone`
   puts `req.verifiedPhone` on the request, and the APPLICATION CONTROLLER must
   compare it with the normalised `ownerPhone` in the body. Skipping that
   comparison would let somebody verify their own handset and then submit an
   application in a stranger's name, with the stranger's number as the login
   identity. Normalise both sides through `foodPartner.util.normalisePhone`
   before comparing; two spellings of one number are otherwise two strings.

   ## Why every deny path carries all four keys

   `{ success, code, message, error }`. The three web frontends read failures
   differently — one shows `message`, one logs `error`, one branches on `code`
   — and this module's app is a sixth client that will do whichever of those
   its author reaches for first. Answering all four costs one line and removes
   the whole class of "the error screen said undefined".

   ## No database guard here

   `requireFoodPartner` reads Mongo, and a read issued while the connection is
   down buffers for ten seconds and surfaces as a generic 500. It is not
   guarded here because the router mounts `requireLamposeDb` in front of every
   route in this module — the v2 rule. That is deliberate placement rather than
   an omission: one guard at the mount point also covers the public discovery
   routes, which have no session and would otherwise be left unprotected.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

const config = require('../../config/env');
const FoodRestaurant = require('./foodRestaurant.model');

/* The claim that separates this audience from the other four. Changing it
   invalidates every session issued before the change — which is the correct
   behaviour for a claim whose whole job is to be checked, but it is a forced
   sign-out of every restaurant, so it is a deployment decision rather than a
   tidy-up. */
const TOKEN_TYPE = 'foodpartner';

const PHONE_TOKEN_TYPE = 'foodpartner_phone';

/*
 * How long a proved phone number stays proved: thirty minutes.
 *
 * The window this has to cover is the one between the OTP screen and the
 * submit button, and that is not a few seconds — the onboarding form asks for
 * a licence number, a bank account, an IFSC, a menu typed dish by dish, and a
 * contract read before it is signed. Ten minutes would expire half the
 * applications in the middle of a menu and send the partner back to the first
 * screen, which is where long forms lose people.
 *
 * It is still short, and short is the point: this token authorises submitting
 * an application AS that number, so one left behind on a shared handset is a
 * standing licence to do exactly that for as long as it lives. Thirty minutes
 * is long enough to finish and short enough that finishing tomorrow means
 * asking for a new code, which costs one SMS.
 *
 * Deliberately not an environment variable. A number a deployment can change
 * is a number nobody can reason about from the source, and there is no
 * environment in which this one should differ.
 */
const PHONE_TOKEN_TTL = '30m';

/**
 * A session for the Food-Partner app.
 *
 * `sub` is the restaurantId — the `FP-XXXXXXXX` public id — rather than the
 * Mongo `_id`, matching what every route in this module looks up, what the
 * menu paths carry, and what the device stores. An ObjectId in AsyncStorage
 * invites somebody to go looking for it in `properties` or `app_partners`.
 *
 * The claim set is deliberately three fields. A JWT is base64, not encryption:
 * everything put in it is readable by anyone holding the token, so the owner's
 * email, the payout details and the verification status stay out of it and are
 * read from the database on every request instead — which is also the only way
 * they can be current.
 *
 * Returns null when `JWT_SECRET` is missing in production. Every route that
 * signs a token mounts `requireAuthConfig` ahead of this, so it cannot
 * normally be reached; the null is there so that a forgotten guard becomes a
 * named 503 the controller can answer with, rather than a 500 thrown from
 * inside jsonwebtoken about `secretOrPrivateKey`.
 */
const signFoodPartnerToken = (restaurant, { expiresIn } = {}) => {
  if (!config.auth.configured) return null;
  return jwt.sign(
    { sub: restaurant.restaurantId, typ: TOKEN_TYPE, phone: restaurant.ownerPhone },
    config.auth.jwtSecret,
    /* Caller-chosen life, defaulting to the app's. A partner dashboard opened
       in a browser should pass `config.auth.webJwtExpiresIn`, for the reason
       that setting exists — a laptop in a shop office is a shared machine in a
       way a phone is not. The claim set is identical either way, so one token
       type serves both and `requireFoodPartner` needs no branch. */
    { expiresIn: expiresIn || config.auth.jwtExpiresIn },
  );
};

/**
 * Proof of a phone number, issued by `/auth/otp/verify` and spent by
 * `POST /applications`.
 *
 * There is nothing to look up when this is issued: the restaurant does not
 * exist yet, and inventing a half-document to hold a code would leave
 * unverified junk in `food_restaurants` every time somebody abandoned the form
 * — see the model header, which is where that decision is recorded. So the
 * proof lives entirely in the token, which is why it is short-lived and why it
 * grants exactly one thing.
 *
 * `phone` must already be E.164. Normalise it at the OTP route, before the
 * code is sent, so that the number the SMS went to and the number in this
 * claim are the same string rather than two spellings of one number.
 */
const signPhoneVerificationToken = (phone) => {
  if (!config.auth.configured) return null;
  return jwt.sign(
    { sub: String(phone), typ: PHONE_TOKEN_TYPE },
    config.auth.jwtSecret,
    { expiresIn: PHONE_TOKEN_TTL },
  );
};

const readToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

/* All four keys, on every refusal. See the header. The 403 paths below build
   their own response rather than going through this, because they carry a
   `data` block the app branches on and a status this does not issue. */
const deny = (res, message, code = 'UNAUTHORIZED') => res.status(401).json({
  success: false,
  code,
  message,
  error: message,
});

const notConfigured = (res) => {
  const message = 'Sign-in is unavailable right now.';
  return res.status(503).json({
    success: false,
    code: 'AUTH_NOT_CONFIGURED',
    message,
    error: message,
  });
};

/**
 * Requires a valid food-partner session, and loads the restaurant onto
 * `req.foodPartner`.
 *
 * The database lookup is not optional. Without it a rejected restaurant keeps
 * full access for the remaining week of its token's life, which is exactly the
 * window in which somebody was rejected — and "full access" here includes
 * editing a menu that customers are ordering from. The read costs one indexed
 * lookup on `restaurantId`.
 *
 * The document arrives WITHOUT `passwordHash` and without
 * `payout.bankAccountNumber`: both are `select: false`, and nothing on a
 * session route has any reason to ask for them back. The one route that does
 * — login — is not this one.
 */
async function requireFoodPartner(req, res, next) {
  try {
    if (!config.auth.configured) return notConfigured(res);

    const token = readToken(req);
    if (!token) return deny(res, 'Please sign in to continue.');

    const decoded = jwt.verify(token, config.auth.jwtSecret);

    /* A customer, staff, stay-partner or phone-verification token verifies
       against the same secret. This is the line that stops any of them being a
       restaurant session. */
    if (decoded.typ !== TOKEN_TYPE) {
      return deny(res, 'That session is not valid for this app.', 'WRONG_TOKEN_TYPE');
    }

    const restaurant = await FoodRestaurant.findOne({ restaurantId: decoded.sub });
    if (!restaurant) return deny(res, 'This account no longer exists.', 'ACCOUNT_GONE');

    /*
     * Rejected is a dead end, and the app must be able to draw a screen for it:
     * "your application was not approved", and the reason, which is why
     * `verificationNote` travels with the refusal. A generic 401 would send the
     * partner to a sign-in screen that keeps accepting their password and keeps
     * landing them back here, and the support call that follows opens with "it
     * just logs me out".
     *
     * `isActive: false` is deliberately NOT a refusal on its own. A PENDING
     * restaurant has to be able to sign in — the days before approval are
     * exactly when a partner types their menu — and an approved one that has
     * switched itself closed for a fortnight still needs its dashboard.
     * Approved is not the same as listed (see the model header), and neither of
     * them is the same as "may sign in". The only case where `isActive` matters
     * to this guard is the one where it was turned off BY a rejection, and
     * `verificationStatus` already says so; testing the flag separately would
     * lock out every kitchen on its quiet fortnight.
     */
    if (restaurant.verificationStatus === 'rejected') {
      const message = restaurant.verificationNote
        ? `This application was not approved: ${restaurant.verificationNote}`
        : 'This application was not approved. Please contact Lampose.';
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_REJECTED',
        message,
        error: message,
        /* Repeated as data so the app can branch without parsing the sentence
           it is about to show a human. */
        data: {
          verificationStatus: restaurant.verificationStatus,
          verificationNote: restaurant.verificationNote || '',
        },
      });
    }

    req.foodPartner = restaurant;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return deny(res, 'Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
    }
    if (error.name === 'JsonWebTokenError') return deny(res, 'Invalid session.', 'BAD_TOKEN');
    /* Anything else is a real fault — a connection dropped mid-query, a
       programming error — and belongs to the error handler rather than to a 401
       that would sign a partner out over a server problem. */
    return next(error);
  }
}

/**
 * Requires proof of a phone number, and puts it on `req.verifiedPhone`.
 *
 * No database read, because there is nothing to read: this runs before the
 * restaurant exists. The token IS the proof.
 *
 * The controller behind this must still compare `req.verifiedPhone` with the
 * `ownerPhone` in the body — see the header. This middleware answers "somebody
 * proved a number"; only the controller can answer "they proved THIS one".
 */
function requireVerifiedPhone(req, res, next) {
  try {
    if (!config.auth.configured) return notConfigured(res);

    const token = readToken(req);
    if (!token) {
      return deny(res, 'Please verify your phone number first.', 'PHONE_NOT_VERIFIED');
    }

    const decoded = jwt.verify(token, config.auth.jwtSecret);

    if (decoded.typ !== PHONE_TOKEN_TYPE) {
      return deny(res, 'That is not a phone verification.', 'WRONG_TOKEN_TYPE');
    }

    /* A token of the right type with no subject proves nothing about any
       number, and letting it through would put `undefined` where an applicant's
       phone should be — which the application controller would then compare
       against the body and, if it compared loosely, accept. */
    if (!decoded.sub) {
      return deny(res, 'That verification is incomplete. Please request a new code.', 'BAD_TOKEN');
    }

    req.verifiedPhone = String(decoded.sub);
    return next();
  } catch (error) {
    /* A distinct code from the session's `TOKEN_EXPIRED`, because the two send
       the app to different screens: an expired session means sign in again, an
       expired phone proof means ask for another code. One code for both would
       drop an applicant who has no account yet onto a login form. */
    if (error.name === 'TokenExpiredError') {
      return deny(
        res,
        'That verification has expired. Please request a new code.',
        'PHONE_TOKEN_EXPIRED',
      );
    }
    if (error.name === 'JsonWebTokenError') {
      return deny(res, 'That verification is not valid.', 'BAD_TOKEN');
    }
    return next(error);
  }
}

/**
 * Either a session or a proved phone number — the guard `POST /uploads/images`
 * needs, and the only route that needs it.
 *
 * One route, two callers, both legitimate, neither able to hold the other's
 * credential: a signed-in partner replacing a logo has a session and no phone
 * token, and an applicant uploading an FSSAI scan has a phone token and no
 * account to sign into. Chaining the two middlewares cannot express that — the
 * first would refuse before the second ran — and hand-rolling the choice in the
 * routes file would put a second token reader in this module, which is the
 * thing this file exists to prevent.
 *
 * Whichever succeeded is on the request afterwards: `req.foodPartner` for a
 * session, `req.verifiedPhone` for an applicant. Neither is faked in for the
 * other, because the upload controller reads both and picks its Cloudinary
 * folder from whichever is there — a partner's uploads are foldered under their
 * restaurantId, an applicant's under the shared application folder.
 *
 * The branch is on the UNVERIFIED `typ` claim, which is safe because it decides
 * only which verifier runs: both verify the signature properly, and a token
 * lying about its own type is refused by whichever one it is handed to. A
 * missing or unreadable claim falls to the session path, so the default answer
 * to a malformed token is "sign in", not "you look like an applicant".
 */
function requireFoodPartnerOrVerifiedPhone(req, res, next) {
  if (!config.auth.configured) return notConfigured(res);

  const token = readToken(req);
  if (!token) {
    return deny(res, 'Please sign in or verify your phone number first.', 'UNAUTHORIZED');
  }

  let typ = null;
  try {
    const claims = jwt.decode(token);
    typ = claims && claims.typ;
  } catch (error) {
    /* `decode` does not verify and rarely throws, but a malformed token can
       still trip it. Falling through to the session path is the wanted
       behaviour: it verifies properly and answers BAD_TOKEN. */
    typ = null;
  }

  if (typ === PHONE_TOKEN_TYPE) return requireVerifiedPhone(req, res, next);
  return requireFoodPartner(req, res, next);
}

module.exports = {
  TOKEN_TYPE,
  PHONE_TOKEN_TYPE,
  PHONE_TOKEN_TTL,

  signFoodPartnerToken,
  requireFoodPartner,

  signPhoneVerificationToken,
  requireVerifiedPhone,

  requireFoodPartnerOrVerifiedPhone,
};
