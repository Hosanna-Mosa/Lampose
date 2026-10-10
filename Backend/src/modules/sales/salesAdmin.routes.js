/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/sales-reps — the console's Sales Tracking page.

   v1 rather than v2, matching `driverAdmin.routes.js`: the reader is an
   administrator in the `admins` collection, a different identity system
   from a sales rep's own session. `verifyAdminToken` is the same middleware
   every other admin surface uses.

   Reading (the roster and a rep's path) is open to any signed-in
   administrator, the same posture `driverAdmin.routes.js` takes for its own
   roster. CREATING, deactivating or resetting a rep is `sales.manage` (Admin and up): it mints a working
   login whose live location then shows in the console, and a Viewer is the
   role that "reads everything and changes nothing".
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { can } = require('../iam/iam.middleware');
const {
  createSalesRep, listSalesReps, getSalesRepPath, setSalesRepStatus, resetSalesRepPassword,
} = require('./salesAdmin.controller');

const router = express.Router();

router.use(verifyAdminToken);
router.use(requireLamposeDb);

router.get('/', listSalesReps);
router.post('/', can('sales.manage'), createSalesRep);
router.get('/:salesRepId/path', getSalesRepPath);
router.patch('/:salesRepId', can('sales.manage'), setSalesRepStatus);
router.put('/:salesRepId/password', can('sales.manage'), resetSalesRepPassword);

module.exports = router;
