/* ══════════════════════════════════════════════════════════════════════════
   The admin console's identity, verified on every request.

   Issued by `/api/v1/admin/login` (`adminToken.js`) and checked here against
   the `admins` collection. Originally written for the analytics routes alone
   — "nothing else in the v1 admin surface checks this token" — and now the
   guard on every `/api/v1/admin/*` router, the stats routes, the
   administrator accounts routes and the console's half of the shared v1
   property, verification and permission routes (see `iam.middleware.js`).

   Four questions, in order, every time:

     1. Is the token ours and unexpired?         → 401 UNAUTHORIZED
     2. Is it the CONSOLE's kind of token?       → 401 LEGACY_TOKEN / WRONG_TOKEN_TYPE
     3. Does the account still exist and is it   → 401 UNAUTHORIZED /
        still Active?                                403 ACCOUNT_INACTIVE
     4. Is the token's `ver` the account's       → 401 SESSION_REVOKED
        current `sessionVersion`?

   The database read on every request is the point: it is what makes
   deactivating an account, changing a role, changing a password or pressing
   "sign out everywhere" take effect NOW rather than when the token expires.

   `req.admin` is the account (minus the password hash); `req.capabilities`
   is the permission table's answer for its role, so a route can also ask
   `req.capabilities.includes('money.release')` if it needs to branch rather
   than refuse.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');
const Admin = require('../admins/admin.model');
const { ADMIN_TOKEN_TYPE } = require('../admins/adminToken');
const { capabilitiesFor } = require('../iam/iam.roles');

const deny = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

async function verifyAdminToken(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return deny(res, 401, 'UNAUTHORIZED', 'Access denied. Sign in to the admin console first.');

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return deny(
        res, 503, 'AUTH_NOT_CONFIGURED',
        'Admin authentication is not configured on the server (JWT_SECRET is missing).',
      );
    }

    const decoded = jwt.verify(token, secret);

    if (decoded.typ !== ADMIN_TOKEN_TYPE) {
      if (!decoded.typ && decoded.id) {
        return deny(res, 401, 'LEGACY_TOKEN', 'The console’s sign-in was upgraded. Please sign in again.');
      }
      return deny(res, 401, 'WRONG_TOKEN_TYPE', 'That session is not valid for the admin console.');
    }

    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) return deny(res, 401, 'UNAUTHORIZED', 'This administrator account no longer exists.');
    if (admin.status !== 'Active') return deny(res, 403, 'ACCOUNT_INACTIVE', 'This administrator account is not active.');
    if ((decoded.ver || 0) !== (admin.sessionVersion || 0)) {
      return deny(res, 401, 'SESSION_REVOKED', 'This session was signed out. Please sign in again.');
    }

    req.admin = admin;
    req.capabilities = capabilitiesFor(admin.role);
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return deny(res, 401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'CastError') {
      return deny(res, 401, 'UNAUTHORIZED', 'Invalid authentication token.');
    }
    return next(error);
  }
}

module.exports = verifyAdminToken;
