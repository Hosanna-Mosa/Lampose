/* ══════════════════════════════════════════════════════════════════════════
   Bearer tokens for the sales team — a SEVENTH identity system in this process.

   Same shape as every other one, deliberately: they share one signing secret
   because they share one process, so a token from any of the seven will
   `jwt.verify` against the other six. What keeps them apart is the payload —
   every sales token carries `typ: 'sales_rep'`, and `requireSalesRep` below
   refuses anything without it. See `driverAuth.middleware.js` for the fuller
   version of this same reasoning; it is not repeated seven times.

   ## The database read is not optional

   `requireSalesRep` loads the rep on every request, for the same reason
   `requireDriver` does: without it a deactivated rep keeps full access for
   the remaining week of their token's life, which is exactly the window in
   which somebody is deactivated.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

const config = require('../../config/env');
const SalesRep = require('./salesRep.model');

/** The claim that separates this audience from the other six. */
const TOKEN_TYPE = 'sales_rep';

/**
 * A session for the Tracker app.
 *
 * `sub` is the salesRepId — the `SR-XXXXXXXX` public id — never the Mongo
 * `_id`, matching what every route here looks up and what the device stores.
 * `ver` is `sessionVersion`, so a password change or "sign out everywhere"
 * ends every open session on its next request rather than at token expiry.
 *
 * Returns null when `JWT_SECRET` is missing in production. Every route that
 * signs a token mounts `requireAuthConfig` ahead of this, so it cannot
 * normally be reached; the null is there so a forgotten guard becomes a named
 * 503 rather than a 500 thrown from inside jsonwebtoken.
 */
const signSalesToken = (rep) => {
  if (!config.auth.configured) return null;
  return jwt.sign(
    { sub: rep.salesRepId, typ: TOKEN_TYPE, ver: rep.sessionVersion || 0 },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn },
  );
};

const readToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

/* All four keys on every denial, matching every other guard in this process:
   different clients read `message`, `error` and `code`, and answering all of
   them costs one line and removes the whole class of "the error screen said
   undefined". */
const deny = (res, message, code = 'UNAUTHORIZED', status = 401) => res.status(status).json({
  success: false, code, message, error: message,
});

/**
 * Verify the bearer, load the rep it names, and refuse a deactivated one.
 *
 * Attaches `req.salesRep`. `jwt.verify` throws on an expired or malformed
 * token; the caller's try/catch is what turns that into `tokenError` below.
 */
const requireSalesRep = async (req, res, next) => {
  try {
    if (!config.auth.configured) {
      return deny(res, 'Sign-in is unavailable right now.', 'AUTH_NOT_CONFIGURED', 503);
    }

    const token = readToken(req);
    if (!token) return deny(res, 'Please sign in to continue.');

    const decoded = jwt.verify(token, config.auth.jwtSecret);

    /* The six other token types verify against the same secret. This is the
       line that stops them being a sales session. */
    if (decoded.typ !== TOKEN_TYPE) {
      return deny(res, 'That session is not valid for this app.', 'WRONG_TOKEN_TYPE');
    }

    const rep = await SalesRep.findOne({ salesRepId: decoded.sub });
    if (!rep) return deny(res, 'This account no longer exists.', 'ACCOUNT_GONE');
    if (rep.status !== 'active') {
      return deny(res, 'This account has been deactivated.', 'ACCOUNT_INACTIVE', 403);
    }
    if ((decoded.ver || 0) !== (rep.sessionVersion || 0)) {
      return deny(res, 'Your session has been signed out. Please sign in again.', 'SESSION_REVOKED');
    }

    req.salesRep = rep;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return deny(res, 'Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
    }
    if (error.name === 'JsonWebTokenError') return deny(res, 'Invalid session.', 'BAD_TOKEN');
    return next(error);
  }
};

module.exports = { TOKEN_TYPE, signSalesToken, requireSalesRep };
