/* ══════════════════════════════════════════════════════════════════════════
   JWT authentication for the v2 surface (the leads panel's accounts, stored
   in `scriper_users`).

   This is a separate identity system from the v1 `admins` collection that
   /api/v1/admin/login issues tokens against. They share one process and one
   database and nothing else — different collections, different token payload,
   different consumers. Do not try to make one verify the other's tokens.

   The original module threw at import time when JWT_SECRET was missing. Here
   that would take the public listings and the onboarding app down along with
   the panel, so the check moved to config/env.js and the routes answer 503
   instead.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const dbStore = require('../../modules/scraper/scraper.store');

const JWT_SECRET = config.auth.jwtSecret;

const signToken = (user) => jwt.sign(
  {
    userId: user.userId,
    email: user.email,
    role: user.role,
    /* The session generation this token belongs to. `|| 0` rather than a bare
       read, because an account created before `sessionVersion` existed has the
       field absent rather than zero, and `undefined` in a claim would fail the
       comparison against a stored 0 and sign that person out. */
    ver: user.sessionVersion || 0,
  },
  JWT_SECRET,
  { expiresIn: config.auth.jwtExpiresIn },
);
const readToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  /* `?token=` exists for one caller: the leads panel's export, which is a
     window.open() navigation and cannot set a header. The request logger
     redacts it. */
  if (req.query && typeof req.query.token === 'string' && req.query.token) return req.query.token;
  return (req.body && req.body.token) || null;
};

const deny = (res, message) => res.status(401).json({
  success: false,
  code: 'UNAUTHORIZED',
  message,
  error: message,
});

async function authMiddleware(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) return deny(res, 'Access denied. Authorization token required.');

    const decoded = jwt.verify(token, JWT_SECRET);

    /* The token alone is not enough: a deleted employee would keep full
       access for the remaining week of their token's life. */
    const user = await dbStore.findUserById(decoded.userId);
    if (!user) return deny(res, 'This account no longer exists.');

    /*
     * Is this token from the CURRENT generation of the account's sessions?
     *
     * What makes a leaked or handed-over token killable without deleting the
     * account: bumping `sessionVersion` retires every token minted before it,
     * at the next request each one makes.
     *
     * Compared through `|| 0` on BOTH sides on purpose. A token issued before
     * this claim existed has no `ver`, and an account created before the field
     * existed has no `sessionVersion`; both read as 0 and therefore match, so
     * shipping this signs nobody out. Only an actual bump invalidates
     * anything. A distinct message from the other 401s so the panel can say
     * "you were signed out" rather than "your password is wrong".
     */
    if ((decoded.ver || 0) !== (user.sessionVersion || 0)) {
      return deny(res, 'This session was signed out. Please sign in again.');
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return deny(res, 'Your session has expired. Please sign in again.');
    if (error.name === 'JsonWebTokenError') return deny(res, 'Invalid authentication token.');
    return next(error);
  }
}

/* Attaches req.user when a valid token is present and does nothing when it is
   not — for routes that are public but behave differently for a signed-in
   caller. */
async function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await dbStore.findUserById(decoded.userId);
  } catch {
    req.user = null;
  }
  return next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return deny(res, 'Access denied. Authorization token required.');
  if (!roles.includes(req.user.role)) {
    const message = `This action requires the ${roles.join(' or ')} role.`;
    return res.status(403).json({ success: false, code: 'FORBIDDEN', message, error: message });
  }
  return next();
};

/* Lets REQUIRE_AUTH=false turn the guards off without rewriting the route
   files — an escape hatch for a client that cannot send the header. */
const passThrough = (req, res, next) => next();

const protect = config.auth.requireAuth ? authMiddleware : passThrough;
const protectRole = (...roles) => (
  config.auth.requireAuth ? requireRole(...roles) : passThrough
);

module.exports = {
  JWT_SECRET,
  signToken,
  readToken,
  authMiddleware,
  optionalAuth,
  requireRole,
  protect,
  protectRole,
};
