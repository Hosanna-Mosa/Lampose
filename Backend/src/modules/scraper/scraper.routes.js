const express = require('express');
const scraperController = require('./scraper.controller');
const { requireScriperStore } = require('../../shared/middleware/requireDb');
const { protect, protectRole } = require('../../shared/middleware/authMiddleware');

const router = express.Router();

router.use(requireScriperStore);

/*
 * Every route on this router is behind the leads panel's sign-in.
 *
 * It was not: the scrape lifecycle (/start, /status, /stop), the job history,
 * the statistics and the export answered anybody, so an anonymous caller
 * could start a Playwright job on this server or download every lead. Only
 * the three lead-management routes checked a token.
 *
 * `protect` is still applied PER ROUTE rather than with `router.use`, so a
 * route that must stay open can be seen to be open — none is, today.
 *
 * `/export` is the one the dashboard opens with window.open(), a plain
 * browser navigation that cannot carry an Authorization header. It now
 * carries the token as `?token=`, which `readToken` in authMiddleware.js
 * accepts for exactly this case, and the panel's `getExportUrl` appends it.
 *
 * `protect` honours REQUIRE_AUTH=false, which leaves req.user undefined and
 * every caller unscoped. That escape hatch is for a client that cannot send
 * a header, and it must not be on for this panel.
 */

// Scrape operations
router.post('/start', protect, scraperController.startScrape);
router.get('/status/:jobId', protect, scraperController.getStatus);
router.post('/stop/:jobId', protect, scraperController.stopScrape);

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

/* Signed in via `?token=` — see the note above. */
router.get('/export', protect, scraperController.exportLeads);

// Job history, team & statistics
router.get('/jobs', protect, scraperController.getJobs);
router.get('/stats', protect, scraperController.getStats);
/* The whole team's numbers — an admin view by definition. */
router.get('/team-stats', protect, protectRole('ADMIN'), scraperController.getTeamStats);

module.exports = router;
