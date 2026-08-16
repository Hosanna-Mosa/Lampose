/* ══════════════════════════════════════════════════════════════════════════
   GA4 website analytics for the admin console. Every route here is
   read-only and requires a valid admin console session — see
   verifyAdminToken.middleware.js for what that checks.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const router = express.Router();
const verifyAdminToken = require('./verifyAdminToken.middleware');
const controller = require('./analytics.controller');

router.use(verifyAdminToken);

router.get('/overview', controller.getOverview);
router.get('/traffic', controller.getTraffic);
router.get('/pages', controller.getPages);
router.get('/users', controller.getUsers);
router.get('/events', controller.getEvents);

module.exports = router;
