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
const signCustomerToken = (customer) => jwt.sign(
  { sub: customer.customerId, typ: TOKEN_TYPE, phone: customer.phone },
  config.auth.jwtSecret,
  { expiresIn: config.auth.jwtExpiresIn },
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

module.exports = { TOKEN_TYPE, signCustomerToken, requireCustomer };
