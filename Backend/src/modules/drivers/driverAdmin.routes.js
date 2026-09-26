/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/drivers — the console's rider approval queue.

   v1 rather than v2 because the reader is an administrator in the `admins`
   collection, which is the v1 identity system. `verifyAdminToken` is the same
   middleware every other admin surface uses; nothing here accepts a driver
   token, and nothing on the driver router can reach these handlers.

   ## Why this is NOT behind requireSuperAdmin

   The same reasoning as `foodAdmin.routes.js`, and it applies more strongly
   here: approving riders is daily operational work, and locking it to the top
   role would mean the one person who can put a rider on the road is the person
   least likely to be doing it at 8am. So it is a ROLE gate, and it reuses the
   SAME three roles the restaurant queue uses rather than inventing a seventh:
   'Super Admin', 'Admin' and 'Food Admin' may decide; anybody signed in may
   read.

   'Food Admin' already means "works the food side of the business", and riders
   are the other half of a food order — the person approving restaurants in the
   morning is the person approving riders in the morning. A new role would be a
   `role` enum change, a console nav change and a second thing to grant, in
   exchange for a distinction nobody in operations makes.

   A Viewer reads the queue and decides nothing, which is what that role means
   everywhere else in the console.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const {
  listDrivers, getDriver, decideDriver, decideDocument, recordCashDeposit,
} = require('./driverAdmin.controller');

const router = express.Router();

/* Deciding a rider's fate is `riders.decide` — Super Admin, Admin, Food Admin
   — from the one permission table in iam/iam.roles.js. Reading is wider. */
const { can } = require('../iam/iam.middleware');

const requireDriverApprover = can('riders.decide');

router.use(verifyAdminToken);
router.use(requireLamposeDb);

/* Any signed-in administrator may look at the queue. */
router.get('/', listDrivers);
router.get('/:driverId', getDriver);

/* Only an approver may move one.

   Two verdicts, and they are deliberately separate routes rather than one with
   a mode flag. `/documents/:kind` says "photograph this again" and leaves the
   account where it is; `/decision` says whether this person may work at all.
   Conflating them is how a blurred PAN card ends up rejecting an application —
   see `driverAdmin.controller.js`. Both sit behind the same role gate: they are
   the same operator doing the same job, one at two levels of consequence. */
router.patch('/:driverId/documents/:kind', requireDriverApprover, decideDocument);
router.patch('/:driverId/decision', requireDriverApprover, decideDriver);

/* Cash a rider hands back from cash-on-delivery orders. Its own capability,
   held by the same roles today, because taking money in is a different act
   from deciding who may ride — see `cashInHand.service.js`. */
router.post('/:driverId/cash-deposits', can('riders.cash'), recordCashDeposit);

module.exports = router;
