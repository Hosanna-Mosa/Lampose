/* ══════════════════════════════════════════════════════════════════════════
   `/api/v1/admin/monitor` — the console's booking and money screen.

   ## The authorisation shape, and why reading is wider than writing

   Three tiers, narrowing as the consequence grows:

     READ            any active administrator. This is the operational picture
                     of the business — who booked what, whether an owner
                     answered, what is owed. Hiding it from a Viewer or a
                     Support agent helps nobody and would push them to ask
                     somebody with more access to look things up for them,
                     which is how a Super Admin password ends up shared.

     COMMISSION      Super Admin or Admin. It changes what a hotel is paid, so
                     it is not a note — but it moves nothing on its own, and it
                     is frozen the moment a settlement leaves a releasable
                     state.

     WITHDRAW        Super Admin ALONE. This is the only route in the file that
                     causes money to leave a Razorpay account for a third
                     party's bank. It matches `partnerPayout.admin.routes.js`,
                     which has always been Super-Admin-only for the same act.

   `verifyAdminToken` does the real work on all three: it verifies the JWT that
   `POST /api/admin/login` issues, against the `admins` collection, and refuses
   an account that has been removed or deactivated since. A customer's or an
   owner's token cannot reach any of this — those are different audiences with
   different claims, and this guard asserts its own.

   ## Rate limiting is on the money route only

   Reading a queue is not an attack surface worth throttling, and an
   administrator refreshing a screen must not be locked out of it. Releasing
   money is different: the limit is what turns a stuck-button double-click, or
   a script pointed at this endpoint with a stolen token, from a stream of
   attempts into a handful. The idempotent state machine already refuses the
   second one; this means the hundredth never arrives.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const router = express.Router();

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { rateLimit } = require('../../shared/middleware/rateLimit');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const monitor = require('./monitor.controller');

/**
 * Role gates, built here rather than imported, because the existing
 * `requireSuperAdmin` bundles `verifyAdminToken` with its check — and this
 * router needs the token verified once, at the top, with different role
 * requirements per route below it.
 */
/* Capabilities from the one permission table (iam/iam.roles.js): setting a
   commission is Super Admin or Admin; releasing money is Super Admin. */
const { can } = require('../iam/iam.middleware');

/* Everything here needs a database and a verified administrator. Nothing on
   this router is reachable without both, including the reads. */
router.use(requireLamposeDb, verifyAdminToken);

/* ── Read ─────────────────────────────────────────────────────────────── */

router.get('/', monitor.getSummary);
router.get('/:category', monitor.getCategory);

/* ── Write ────────────────────────────────────────────────────────────── */

router.patch(
  '/settlements/:id/commission',
  can('commission.set'),
  monitor.setCommission,
);

router.patch(
  '/bookings/:id/commission-collected',
  can('commission.set'),
  monitor.markCommissionCollected,
);

/* ── The one that moves money ─────────────────────────────────────────── */

/*
 * Keyed by ADMINISTRATOR, not by IP.
 *
 * The console is often reached from one office address, so an IP limit would
 * be shared by everybody working that day — one person retrying a failed
 * payout would lock out their colleagues. The account is the actor here, and
 * it is the thing a stolen token would be using.
 */
const withdrawLimit = rateLimit({
  name: 'admin-settlement-withdraw',
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyOf: (req) => (req.admin ? `admin:${req.admin._id}` : req.ip),
});

router.post(
  '/settlements/:id/withdraw',
  can('money.release'),
  withdrawLimit,
  monitor.withdraw,
);

module.exports = router;
