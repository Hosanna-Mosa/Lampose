/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/zones — where Lampose operates, as drawn in the console.

   v1 rather than v2 because the reader is an administrator in the `admins`
   collection, and `verifyAdminToken` is the same middleware every other admin
   surface uses. Nothing here accepts a customer, rider or partner token, and
   nothing on `/api/v2/zones` can write.

   ## The role gate, and why it is narrower than the rider queue

   `driverAdmin.routes.js` lets Admin and Food Admin decide, on the grounds
   that approving riders is daily operational work. Drawing a zone is not: it
   changes where the product is sold and what every order in an area is
   multiplied by, it is done a handful of times a year, and getting it wrong is
   silent — a mis-drawn boundary does not throw, it just stops answering for
   half a city.

   So READING is open to anybody signed in (an operator wondering why an
   address is refused needs to see the map), and WRITING is Super Admin and
   Admin only. Food Admin is deliberately not on that list: it means "works the
   food side", not "sets the trading area".
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const {
  listZones, getZone, createZone, updateZone, deleteZone,
} = require('./zoneAdmin.controller');

const router = express.Router();

/* Changing the trading area is `zones.write` — Super Admin, Admin — from the
   one permission table in iam/iam.roles.js. Reading is wider. */
const { can } = require('../iam/iam.middleware');

const requireZoneEditor = can('zones.write');

router.use(verifyAdminToken);
router.use(requireLamposeDb);

/* Anybody signed in may look at the map. */
router.get('/', listZones);
router.get('/:zoneId', getZone);

/* Only an editor may redraw it. */
router.post('/', requireZoneEditor, createZone);
router.patch('/:zoneId', requireZoneEditor, updateZone);
router.delete('/:zoneId', requireZoneEditor, deleteZone);

module.exports = router;
