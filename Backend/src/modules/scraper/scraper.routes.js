const express = require('express');
const scraperController = require('./scraper.controller');
const { requireScriperStore } = require('../../shared/middleware/requireDb');
const { protect, protectRole } = require('../../shared/middleware/authMiddleware');

const router = express.Router();

router.use(requireScriperStore);

/*
 * `protect` is applied PER ROUTE below, not with a `router.use`.
 *
 * A blanket guard here also catches /export, which the dashboard opens with
 * window.open() — a plain browser navigation that cannot carry an
 * Authorization header — and the scrape lifecycle routes, which have their own
 * contract. Only the lead-management surface changes.
 *
 * `protect` still honours REQUIRE_AUTH=false, which leaves req.user undefined
 * and every caller unscoped. That escape hatch is for a client that cannot
 * send a header, and it must not be on for this panel: the scoping in the
 * controller has nothing to scope to without a req.user.
 */

// Scrape operations
router.post('/start', scraperController.startScrape);
router.get('/status/:jobId', scraperController.getStatus);
router.post('/stop/:jobId', scraperController.stopScrape);

/*
 * Leads & data management — the assignment boundary.
 *
 * These three identify their caller, and that is what was missing under "My
 * Assigned Leads (226)": GET /leads answered any request at all, and the only
 * thing narrowing it to one rep was a query parameter the browser chose to
 * send. When the session had no userId the parameter vanished, the query
 * became "no filter", and the rep was handed the whole database. The guard and
 * the scoping in the controller ship together — neither works alone.
 */
router.get('/leads', protect, scraperController.getLeads);
/* Handing work out is the admin's job — it is the one action in this module
   that changes what another person sees. */
router.post('/assign', protect, protectRole('ADMIN'), scraperController.assignLeads);
router.patch('/leads/:id/status', protect, scraperController.updateLeadStatus);

/* Left unauthenticated deliberately. The dashboard downloads this with
   window.open(), a plain browser navigation that cannot carry an
   Authorization header — putting `protect` here would break the export
   button rather than secure it. Guarding it properly needs a signed
   short-lived download URL, which is a change to the frontend too.

   KNOWN GAP: because there is no caller, there is no employee to scope to,
   so this one route still answers with every lead. It is the last way round
   the assignment boundary and it wants the signed-URL fix. */
router.get('/export', scraperController.exportLeads);

// Job history, team & statistics
router.get('/jobs', scraperController.getJobs);
router.get('/stats', scraperController.getStats);
/* The whole team's numbers — an admin view by definition. */
router.get('/team-stats', protect, protectRole('ADMIN'), scraperController.getTeamStats);

module.exports = router;
