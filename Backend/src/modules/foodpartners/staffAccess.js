/* ══════════════════════════════════════════════════════════════════════════
   Lampose staff access to a restaurant's own account.

   ## What it is

   A member of Lampose staff signs in to the Food-Partner app or the web
   restaurant console with the OWNER's phone number (or email) and the shared
   STAFF password, and lands in that restaurant's account — to set up a menu,
   check orders or fix settings on the owner's behalf. The owner's own
   password keeps working; the staff password is checked only when the
   owner's does not match.

   ## What keeps it from being a skeleton key

   1. The password lives only in the server's .env — `FOOD_STAFF_PASSWORD` in
      plain text, or `FOOD_STAFF_PASSWORD_HASH` as a bcrypt hash — never in
      source or in any app. Changing that one env var retires the old
      password everywhere, and every session it issued dies within
      `FOOD_STAFF_SESSION_TTL` (12h).
   2. The session is MARKED. The token carries `via: 'lampose_staff'` and a
      session id; both guards read it and put `req.staffAccess` on the request.
   3. Every write that session makes is recorded in `food_staff_access_logs`
      (method, path, the redacted body, the result), and so is the login. The
      staff console reads that at /api/v1/admin/food-staff-access.
   4. `forbidStaff` refuses the things that would let a leaked password take
      money or the account itself: payout bank accounts, the owner's
      password, and account deletion.

   It is still one password for every restaurant. Keep it with as few people
   as possible, and change it when one of them leaves.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

const bcrypt = require('bcryptjs');

const config = require('../../config/env');
const { SECRET_KEY } = require('../../shared/middleware/requestLogger');
const FoodStaffAccess = require('./foodStaffAccess.model');

const STAFF_CLAIM = 'lampose_staff';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const isEnabled = () => Boolean(config.food.staffPassword || config.food.staffPasswordHash);

/** Does `plain` match the staff password? False whenever the feature is off. */
const staffPasswordMatches = async (plain) => {
  if (!isEnabled() || !plain) return false;

  /* FOOD_STAFF_PASSWORD, in plain text. Compared as SHA-256 digests so the
     comparison is constant-time and the lengths always match. */
  if (config.food.staffPassword) {
    const digest = (text) => crypto.createHash('sha256').update(String(text)).digest();
    return crypto.timingSafeEqual(digest(plain), digest(config.food.staffPassword));
  }

  try {
    return await bcrypt.compare(String(plain), config.food.staffPasswordHash);
  } catch {
    /* A malformed hash in .env is a configuration fault, not a sign-in. */
    return false;
  }
};

const newSessionId = () => `stf_${crypto.randomBytes(9).toString('hex')}`;

/** The extra token claims for a staff session, and its shorter lifetime. */
const staffTokenOptions = (sessionId) => ({
  claims: { via: STAFF_CLAIM, sid: sessionId },
  expiresIn: config.food.staffSessionTtl || '12h',
});

const isStaffToken = (decoded) => Boolean(decoded && decoded.via === STAFF_CLAIM && decoded.sid);

/* Deeper than the request logger's redact (which stops at three levels), so
   nothing nested in a menu or an opening-hours body slips through. */
const DATA_URI = /^data:([\w/+.-]+);base64,/i;
const scrub = (value, depth = 0) => {
  if (typeof value === 'string') {
    const match = value.match(DATA_URI);
    if (match) return `<${match[1]} image>`;
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth > 6) return '…';
  if (Array.isArray(value)) {
    const head = value.slice(0, 50).map((item) => scrub(item, depth + 1));
    return value.length > 50 ? [...head, `…+${value.length - 50} more`] : head;
  }
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [
    key,
    SECRET_KEY.test(key) ? '***' : scrub(val, depth + 1),
  ]));
};

/* A sentence for the console, from the route. Falls back to the raw request. */
const describe = (method, path, body = {}) => {
  const p = path.replace(/^\/api\/v\d+\/(food-partners|restaurant-admin)/, '');
  let m;
  if ((m = p.match(/^\/(?:me\/)?orders\/([^/]+)\/status/))) return `Order ${m[1]} → ${body.status || 'status changed'}`;
  if ((m = p.match(/^\/orders\/([^/]+)\/delivery/))) return `Order ${m[1]} delivery method changed`;
  if ((m = p.match(/^\/(?:me\/products|menu)\/([^/]+)\/availability/))) {
    return `Dish ${m[1]} marked ${body.isAvailable === false ? 'unavailable' : 'available'}`;
  }
  if ((m = p.match(/^\/(?:me\/products|menu)\/([^/]+)/))) {
    return method === 'DELETE' ? `Deleted dish ${m[1]}` : `Edited dish ${m[1]}`;
  }
  if (/^\/(?:me\/products|menu)\/?$/.test(p)) return `Added dish ${body.name ? `"${body.name}"` : ''}`.trim();
  if (/^\/me\/availability/.test(p)) return 'Changed open / closed';
  if (/^\/me\/?$/.test(p)) return `Edited restaurant details: ${Object.keys(body).join(', ') || '—'}`;
  if (/payouts\/request/.test(p)) return 'Requested a payout';
  if (/payout-accounts/.test(p)) return 'Tried to change payout bank details';
  if (/me\/password/.test(p)) return "Tried to change the owner's password";
  if (/account-deletion/.test(p)) return 'Tried to delete the account';
  if (/support/.test(p)) return 'Support ticket activity';
  if (/uploads/.test(p)) return 'Uploaded images';
  if (/devices/.test(p)) return 'Registered / removed a device for notifications';
  return `${method} ${p}`;
};

const clientOf = (req) => ({
  ip: String(req.ip || (req.headers && req.headers['x-forwarded-for']) || ''),
  userAgent: String((req.headers && req.headers['user-agent']) || '').slice(0, 300),
});

/* Never let the audit trail break the request it is describing. */
const write = (row) => FoodStaffAccess.create(row).catch((error) => {
  console.error('⚠️ [staff-access] could not record', row.kind, row.restaurantId, error.message);
});

/** Called by both login handlers after the staff password opened a restaurant. */
const recordStaffLogin = ({ req, restaurant, surface, sessionId, identifier }) => {
  console.log(`🔑 [staff-access] ${surface} sign-in to ${restaurant.restaurantId} (${restaurant.restaurantName}) session ${sessionId}`);
  return write({
    sessionId,
    kind: 'login',
    restaurantId: restaurant.restaurantId,
    restaurantName: restaurant.restaurantName || '',
    surface,
    identifier: String(identifier || ''),
    action: `Signed in with the staff password (${surface === 'app' ? 'Food-Partner app' : 'web console'})`,
    ...clientOf(req),
  });
};

/**
 * Called by both guards after the session is verified. Marks the request and,
 * for a write, records it when the response finishes — so the log says
 * whether it actually worked.
 */
const trackStaffRequest = (req, res, decoded, restaurant, surface) => {
  if (!isStaffToken(decoded)) return;
  req.staffAccess = { sessionId: decoded.sid, surface };

  if (!WRITE_METHODS.has(req.method)) return;
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  res.on('finish', () => {
    if (res.locals && res.locals.staffBlocked) return;
    write({
      sessionId: decoded.sid,
      kind: 'change',
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.restaurantName || '',
      surface,
      method: req.method,
      path,
      action: describe(req.method, path, body),
      changes: Object.keys(body).length ? scrub(body) : null,
      statusCode: res.statusCode,
      ok: res.statusCode < 400,
      ...clientOf(req),
    });
  });
};

/**
 * Refuses a staff session. `writesOnly` lets it still READ (e.g. see the
 * payout accounts) while refusing any change. Mounted after the guard.
 */
const forbidStaff = ({ writesOnly = false } = {}) => (req, res, next) => {
  if (!req.staffAccess) return next();
  if (writesOnly && !WRITE_METHODS.has(req.method)) return next();

  const restaurant = req.foodPartner || {};
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  res.locals.staffBlocked = true;
  write({
    sessionId: req.staffAccess.sessionId,
    kind: 'blocked',
    restaurantId: restaurant.restaurantId || '',
    restaurantName: restaurant.restaurantName || '',
    surface: req.staffAccess.surface,
    method: req.method,
    path,
    action: describe(req.method, path, req.body || {}),
    statusCode: 403,
    ok: false,
    ...clientOf(req),
  });

  const message = 'A Lampose staff sign-in cannot change bank details, the owner\'s password or delete the account. The owner has to do this from their own sign-in.';
  return res.status(403).json({
    success: false, code: 'STAFF_ACCESS_BLOCKED', message, error: message,
  });
};

module.exports = {
  STAFF_CLAIM,
  isEnabled,
  staffPasswordMatches,
  newSessionId,
  staffTokenOptions,
  isStaffToken,
  recordStaffLogin,
  trackStaffRequest,
  forbidStaff,
};
