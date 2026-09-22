/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/sales-reps — the console's Sales Tracking page.

   v1 rather than v2, matching `driverAdmin.routes.js`: the reader is an
   administrator in the `admins` collection, a different identity system
   from a sales rep's own session. `verifyAdminToken` is the same middleware
   every other admin surface uses.

   Open to any signed-in administrator, including the POST — the same posture
   `driverAdmin.routes.js` takes for its own roster ("any signed-in
   administrator may look at the queue"). There is nothing to decide here:
   no approval, no money, just a map and an account an admin types in
   themselves. If that changes, a capability belongs in `iam/iam.roles.js`
   the way `riders.decide` does for the driver queue — not invented ahead of
   a reason to gate on it.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { createSalesRep, listSalesReps, getSalesRepPath } = require('./salesAdmin.controller');

const router = express.Router();

router.use(verifyAdminToken);
router.use(requireLamposeDb);

router.get('/', listSalesReps);
router.post('/', createSalesRep);
router.get('/:salesRepId/path', getSalesRepPath);

module.exports = router;
