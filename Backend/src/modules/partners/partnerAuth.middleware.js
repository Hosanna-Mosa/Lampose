/* ══════════════════════════════════════════════════════════════════════════
   Bearer tokens for partners — a FOURTH identity system in this process.

   There are now four, and they must never verify each other's tokens:

     admins          v1, /api/v1/admin/login        the onboarding console
     scriper_users   v2, /api/v2/auth/login         staff, the leads panel
     app_customers   v2, /api/v2/customers/auth/…   students, the User App
     app_partners    v2, /api/v2/partners/auth/…    owners, Stay Partner

   They share one signing secret because they share one process, which means a
   token from any of them will `jwt.verify` against the others. What keeps them
   apart is the payload: every partner token carries `typ: 'partner'`, and
   `requirePartner` below refuses anything without it. A customer token
   therefore cannot read an owner's properties even though it verifies — which
   matters more here than anywhere else in the process, because the two sides
   of this marketplace have directly opposed interests.

   The alternative — a separate JWT_SECRET per audience — was considered and
   rejected for the reason `customerAuth.middleware.js` gives: it is a second
   secret to configure, rotate and get wrong in a deployment, and the `typ`
   claim gets the same result with none of that.

   ## The unverified-phone check is not optional

   A partner's properties are derived from their phone number, so a session
   issued to somebody who has NOT proved that number would hand them a
   stranger's listings, that stranger's customers' names and phone numbers, and
   eventually their money. `verifyAuth` only ever signs a token after a correct
   code, and this middleware asserts the same fact again on every request — the
   two together are what make deriving ownership from a phone number safe at
   all.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

const config = require('../../config/env');
const Partner = require('./partner.model');

const TOKEN_TYPE = 'partner';

/**
 * A session for the Stay Partner app.
 *
 * `sub` is the partnerId rather than the Mongo `_id`, matching what the profile
 * endpoints look up and what the device stores.
 */
const signPartnerToken = (partner) => jwt.sign(
  { sub: partner.partnerId, typ: TOKEN_TYPE, phone: partner.phone },
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
 * Requires a valid partner session, and loads the partner.
 *
 * The database lookup is not optional. Without it a blocked number keeps full
 * access for the remaining life of its token, which is exactly the window in
 * which somebody is blocked.
 */
async function requirePartner(req, res, next) {
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

    /* A customer or staff token verifies against the same secret. This is the
       line that stops it being a partner session. */
    if (decoded.typ !== TOKEN_TYPE) {
      return deny(res, 'That session is not valid for this app.', 'WRONG_TOKEN_TYPE');
    }

    const partner = await Partner.findOne({ partnerId: decoded.sub });
    if (!partner) return deny(res, 'This account no longer exists.', 'ACCOUNT_GONE');

    if (partner.status === 'blocked') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_BLOCKED',
        message: 'This account has been paused. Please contact Lampose.',
      });
    }

    /* Belt and braces against the one mistake that would be worst here. See
       the note at the top of the file. */
    if (!partner.phoneVerifiedAt) {
      return deny(res, 'Please verify your number again.', 'PHONE_NOT_VERIFIED');
    }

    req.partner = partner;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return deny(res, 'Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
    }
    if (error.name === 'JsonWebTokenError') return deny(res, 'Invalid session.', 'BAD_TOKEN');
    return next(error);
  }
}

module.exports = { TOKEN_TYPE, signPartnerToken, requirePartner };
