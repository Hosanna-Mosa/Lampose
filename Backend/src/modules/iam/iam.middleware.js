/* ══════════════════════════════════════════════════════════════════════════
   Guards built on the permission table — how a route says who may call it.

     verifyAdminToken            a signed-in console administrator (re-exported)
     can('x')                    …and their role holds capability x
     requireAdminWith('x')       the two above, as one array
     identifyStaffOrAdmin        a console administrator OR a leads-panel /
                                 onboarding employee — the v1 routes both use
     adminNeeds('x')             after identifyStaffOrAdmin: a console caller
                                 must hold x; an employee passes through to the
                                 grant gate the route already has
     bindEmployeeEmail           after identifyStaffOrAdmin: the
                                 `x-employee-email` header must be the
                                 signed-in employee's own address

   ## Why the v1 surface needs a two-identity guard

   `/api/v1/properties`, `/api/v1/permissions` and `/api/v1/verifications`
   are shared by two clients with two different identity systems: the admin
   console (`admins`, a Bearer token from `/api/v1/admin/login`) and the
   onboarding app (`scriper_users`, a Bearer token from
   `/api/v2/auth/onboarding-login`, plus `x-employee-email` on every write).
   Until now those routes trusted the header on its own — and, worse,
   treated a request with NO header as the trusted console. Anybody who
   could reach the API could edit or delete any property, approve their own
   edit grant, or list every administrator's email.

   The header is kept, because the permission store and the v1 gate read
   it, but it is now BOUND: it must match the email inside a verified
   employee token, and it is cleared when the caller is the console. A
   caller with neither token is refused before any handler runs.

   ## Two verifiers, one secret, told apart by shape

   Both identity systems sign with `JWT_SECRET`. The console's token now
   carries `typ: 'admin'`; the employee's carries `userId`. The claims are
   peeked WITHOUT verifying to pick the verifier, then that verifier does the
   real check — so a forged `typ` buys nothing but a different 401.

   `authMiddleware` is used directly rather than `protect`, because
   `protect` honours `REQUIRE_AUTH=false` and becomes a pass-through. That
   escape hatch exists for the leads panel's own routes; it must not open
   the property records to the world.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { authMiddleware } = require('../../shared/middleware/authMiddleware');
const { roleCan, describe } = require('./iam.roles');
const { ADMIN_TOKEN_TYPE } = require('../admins/adminToken');

const answer = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

/**
 * The capability check. Assumes `req.admin` was set by `verifyAdminToken`;
 * a route that forgets the verifier gets a 401 here rather than a crash.
 * The capability name is validated when the guard is BUILT, so a typo fails
 * at boot, not at the first request.
 */
const can = (capability) => {
  const label = describe(capability);
  return (req, res, next) => {
    if (!req.admin) return answer(res, 401, 'UNAUTHORIZED', 'Sign in to the admin console first.');
    if (roleCan(req.admin.role, capability)) return next();
    return answer(
      res, 403, 'FORBIDDEN',
      `Your role (${req.admin.role}) cannot ${label}. Ask a Super Admin if you need this.`,
    );
  };
};

const requireAdminWith = (capability) => [verifyAdminToken, can(capability)];

/** Read the claims without trusting them — only to choose a verifier. */
const peek = (req) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return { token: null, claims: {} };
  let claims = {};
  try { claims = jwt.decode(token) || {}; } catch { claims = {}; }
  return { token, claims };
};

const identifyStaffOrAdmin = (req, res, next) => {
  const { token, claims } = peek(req);
  if (!token) return answer(res, 401, 'UNAUTHORIZED', 'Sign in to continue.');
  if (claims.typ === ADMIN_TOKEN_TYPE) return verifyAdminToken(req, res, next);
  if (claims.userId) return authMiddleware(req, res, next);
  if (claims.id && !claims.typ) {
    /* A console token from before `typ` existed. verifyAdminToken names the
       cause so the console signs the person out cleanly. */
    return verifyAdminToken(req, res, next);
  }
  return answer(res, 401, 'WRONG_TOKEN_TYPE', 'That session is not valid here. Sign in to the admin console or the onboarding app.');
};

/** A console caller must hold the capability; an employee is judged by the grant gate instead. */
const adminNeeds = (capability) => {
  const check = can(capability);
  return (req, res, next) => (req.admin ? check(req, res, next) : next());
};

const bindEmployeeEmail = (req, res, next) => {
  if (req.admin) {
    /* The console has no employee identity. Dropping the header is what makes
       the v1 gate's "no header → trusted console" branch mean exactly that. */
    delete req.headers['x-employee-email'];
    return next();
  }
  const mine = normalizeEmail(req.user && req.user.email);
  if (!mine) return answer(res, 401, 'UNAUTHORIZED', 'Sign in to continue.');
  const claimed = normalizeEmail(req.headers['x-employee-email']);
  if (claimed && claimed !== mine) {
    return answer(res, 403, 'IDENTITY_MISMATCH', 'The employee named in this request is not the one signed in.');
  }
  req.headers['x-employee-email'] = mine;
  return next();
};

module.exports = {
  verifyAdminToken, can, requireAdminWith, identifyStaffOrAdmin, adminNeeds, bindEmployeeEmail, normalizeEmail,
};
