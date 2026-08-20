/* ══════════════════════════════════════════════════════════════════════════
   Bearer tokens for customers — a THIRD identity system in this process.

   There are now three, and they must never verify each other's tokens:

     admins          v1, /api/v1/admin/login        the onboarding console
     scriper_users   v2, /api/v2/auth/login         staff, the leads panel
     app_customers   v2, /api/v2/customers/auth/…   students, the mobile app

   They share one signing secret because they share one process, which means
   a token from any of them will `jwt.verify` against the others. What keeps
   them apart is the payload:

     · Every customer token carries `typ: 'customer'`, and `requireCustomer`
       below refuses anything without it. A staff token therefore cannot be
       used to read a customer's profile, even though it verifies.

     · In the other direction, the staff middleware looks its subject up in
       `scriper_users` by `decoded.userId`. A customer token has no `userId`,
       so the lookup misses and it answers 401. That is a real check rather
       than an accident, but it is one line of defence rather than two — so
       the `typ` claim is asserted here and the staff middleware is left
       exactly as it is. Touching a working guard used by two production
       frontends to defend a new one is the wrong trade.

   The alternative — a separate JWT_SECRET per audience — was considered and
   rejected: it is a second secret to configure, rotate and get wrong in a
   deployment, and the `typ` claim gets the same result with none of that.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

const config = require('../../config/env');
const Customer = require('./customer.model');

const TOKEN_TYPE = 'customer';

/**
 * A session for the app.
 *
 * `sub` is the customerId rather than the Mongo `_id`, matching what the
 * profile endpoints look up and what the device stores.
 */
const signCustomerToken = (customer, { expiresIn } = {}) => jwt.sign(
  { sub: customer.customerId, typ: TOKEN_TYPE, phone: customer.phone },
  config.auth.jwtSecret,
  /* Caller-chosen life, defaulting to the app's. The website passes a shorter
     one — see `auth.webJwtExpiresIn`. The claim set is identical either way,
     so one token type serves both and `requireCustomer` needs no branch. */
  { expiresIn: expiresIn || config.auth.jwtExpiresIn },
);

const readToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

const deny = (res, message, code = 'UNAUTHORIZED') => res.status(401).json({
  success: false,
  code,
  message,
  error: message,
});

/**
 * Requires a valid customer session, and loads the customer.
 *
 * The database lookup is not optional. Without it a blocked number keeps full
 * access for the remaining week of its token's life, which is exactly the
 * window in which somebody is blocked for running up an SMS bill.
 */
async function requireCustomer(req, res, next) {
  try {
    if (!config.auth.configured) {
      return res.status(503).json({
        success: false,
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Sign-in is unavailable right now.',
      });
    }

    const token = readToken(req);
    if (!token) return deny(res, 'Please sign in to continue.');

    const decoded = jwt.verify(token, config.auth.jwtSecret);

    /* A staff token verifies against the same secret. This is the line that
       stops it being a customer session. */
    if (decoded.typ !== TOKEN_TYPE) {
      return deny(res, 'That session is not valid for this app.', 'WRONG_TOKEN_TYPE');
    }

    const customer = await Customer.findOne({ customerId: decoded.sub });
    if (!customer) return deny(res, 'This account no longer exists.', 'ACCOUNT_GONE');
    if (customer.status === 'blocked') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_BLOCKED',
        message: 'This account has been paused. Please contact support.',
      });
    }

    req.customer = customer;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return deny(res, 'Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
    }
    if (error.name === 'JsonWebTokenError') return deny(res, 'Invalid session.', 'BAD_TOKEN');
    return next(error);
  }
}

/**
 * Loads the customer when a token happens to be there, and never refuses.
 *
 * For routes the public can use signed out, where being signed in only makes
 * them shorter — the website's visit request being the case this was written
 * for: a returning visitor skips the OTP, a new one still gets the full form.
 *
 * Every failure is silent and lands the caller in the signed-out path, which
 * is the correct handling for all of them: an expired token, a staff token, a
 * deleted account and a blocked one are all "not a customer session" as far as
 * a route that does not require one is concerned. Nothing here grants
 * anything — it only says who is asking when that is knowable.
 */
async function attachCustomerIfPresent(req, res, next) {
  try {
    const token = readToken(req);
    if (!token || !config.auth.configured) return next();

    const decoded = jwt.verify(token, config.auth.jwtSecret);
    if (decoded.typ !== TOKEN_TYPE) return next();

    const customer = await Customer.findOne({ customerId: decoded.sub });
    /* Blocked is checked here as well: the whole point of the database read on
       every request is that blocking takes effect now rather than when the
       token happens to expire. */
    if (customer && customer.status !== 'blocked') req.customer = customer;
    return next();
  } catch (error) {
    /* Includes TokenExpiredError and JsonWebTokenError, both of which simply
       mean "signed out" on a route that does not require signing in. */
    return next();
  }
}

module.exports = {
  TOKEN_TYPE, signCustomerToken, requireCustomer, attachCustomerIfPresent,
};
