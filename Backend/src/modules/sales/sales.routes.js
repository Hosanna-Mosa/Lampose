/* ══════════════════════════════════════════════════════════════════════════
   /api/v2/sales — the Tracker app.

   One public route (login), rate-limited by IP and by the email in the
   body — the same two-ceiling shape `admin.routes.js` and `auth.routes.js`
   use, for the same reason: IP stops a script trying a list of addresses,
   email stops a distributed attempt at one account.

   There is deliberately no `/auth/register` here any more — see
   `sales.controller.js`'s header. An account is created by an administrator
   at `POST /api/v1/admin/sales-reps`, a completely different, staff-only
   surface; nothing public can create one.

   Three routes behind a session: `/me` for the app to confirm who it is
   signed in as after a relaunch, `/me/duty` for the switch (a rare, deliberate
   press), and `/me/location` for the heartbeat while on duty (frequent,
   automatic — see `sales.controller.js`'s header for why those two are not
   one route).
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const { rateLimit } = require('../../shared/middleware/rateLimit');
const { requireLamposeDb, requireAuthConfig } = require('../../shared/middleware/requireDb');
const { requireSalesRep } = require('./salesAuth.middleware');
const {
  login, getMe, setDuty, updateLocation,
} = require('./sales.controller');

const router = express.Router();

const emailKey = (req) => String((req.body && req.body.email) || '').trim().toLowerCase() || req.ip;

const loginByIp = rateLimit({ name: 'sales-login-ip', windowMs: 15 * 60 * 1000, max: 30 });
const loginByEmail = rateLimit({
  name: 'sales-login-email', windowMs: 15 * 60 * 1000, max: 10, keyOf: emailKey,
});

router.post(
  '/auth/login',
  requireLamposeDb,
  requireAuthConfig,
  loginByIp,
  loginByEmail,
  login,
);

const session = [requireLamposeDb, requireAuthConfig, requireSalesRep];

router.get('/me', session, getMe);

/* A press of a switch, not a heartbeat — generous, because a person is
   behind every call. Keyed by rep rather than IP: two reps on the same
   office wifi flipping their own switches must not share one ceiling. */
const dutyLimit = rateLimit({
  name: 'sales-duty', windowMs: 15 * 60 * 1000, max: 60, keyOf: (req) => req.salesRep?.salesRepId || req.ip,
});
router.patch('/me/duty', session, dutyLimit, setDuty);

/* The heartbeat. 240 per 15 minutes is the same ceiling `driver.routes.js`
   gives its own location PATCH — roughly one fix every 4 seconds sustained,
   which comfortably covers this app's own send interval with room for a
   client that retries. */
const locationLimit = rateLimit({
  name: 'sales-location', windowMs: 15 * 60 * 1000, max: 240, keyOf: (req) => req.salesRep?.salesRepId || req.ip,
});
router.patch('/me/location', session, locationLimit, updateLocation);

module.exports = router;
