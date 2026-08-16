/* ══════════════════════════════════════════════════════════════════════════
   Guards the analytics routes with the v1 admin console's own identity —
   the JWT that POST /api/admin/login already issues (src/modules/admins/
   admin.routes.js, generateToken → jwt.sign({ id }, process.env.JWT_SECRET)),
   verified against the same `admins` collection.

   Nothing else in the v1 admin surface currently checks this token — the
   console's other routes (login/register/users/stats/activity/system) trust
   whoever can reach the API, and changing that is out of scope here: it
   would alter behaviour those routes were not asked to change. GA4 traffic
   data is more sensitive than what those routes expose, and the task
   requires it to be admin-only, so this route group gets the verification
   its own login token was always meant to be checked against.

   This is the existing admin identity system, not a second one: same
   JWT_SECRET, same token payload, same collection — just enforced here for
   the first time, and only for /api/admin/analytics/*.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');
const Admin = require('../admins/admin.model');

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
    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) return deny(res, 401, 'UNAUTHORIZED', 'This administrator account no longer exists.');
    if (admin.status !== 'Active') return deny(res, 403, 'FORBIDDEN', 'This administrator account is not active.');

    req.admin = admin;
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
