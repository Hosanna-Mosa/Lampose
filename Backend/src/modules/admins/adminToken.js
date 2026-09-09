/* ══════════════════════════════════════════════════════════════════════════
   The console's session token, signed in one place.

   It used to be `jwt.sign({ id })` for thirty days, with nothing on the
   server able to end it early: a demoted or removed administrator kept
   every power their old token named until it expired, and the socket layer
   could only recognise the token by the ABSENCE of a `typ` claim.

   Now:

     typ   'admin'  — the same idea the four app identities use, so a guard
                      can refuse the wrong kind of token by name rather than
                      by shape.
     ver   the account's `sessionVersion`. Bumped on a password change, on a
                      role or status change made by a Super Admin, and on
                      "sign out everywhere". A token whose `ver` is behind the
                      account's is refused with SESSION_REVOKED — revocation
                      that takes effect on the next request, not next month.
     exp   ADMIN_SESSION_TTL, default 12 hours. A console is a browser on a
                      desk; a session that outlives the working day on a
                      machine somebody walked away from is the case this
                      shortens.

   Tokens from before this file carry no `typ` and are refused with
   LEGACY_TOKEN — every open console signs in once more, and that is the
   whole migration.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');
const config = require('../../config/env');

const ADMIN_TOKEN_TYPE = 'admin';

const signAdminToken = (admin, { expiresIn } = {}) => jwt.sign(
  { id: String(admin._id), typ: ADMIN_TOKEN_TYPE, ver: admin.sessionVersion || 0 },
  process.env.JWT_SECRET,
  { expiresIn: expiresIn || config.auth.adminSessionTtl },
);

module.exports = { ADMIN_TOKEN_TYPE, signAdminToken };
