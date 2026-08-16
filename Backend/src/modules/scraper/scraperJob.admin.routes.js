/* ══════════════════════════════════════════════════════════════════════════
   Admin-console CRUD over `scriper_jobs` — the leads panel's scrape job
   history. scraper.routes.js exposes jobs read-only (GET /jobs) for the leads
   panel itself; this is the console's own Super-Admin-only path, with the
   edit/delete those routes never needed. See scriperUser.admin.routes.js for
   why this lives on the v1 side instead of reusing the v2 router.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const express = require('express');
const router = express.Router();

const dbStore = require('./scraper.store');
const requireSuperAdmin = require('../../shared/middleware/requireSuperAdmin');
const { requireScriperStore } = require('../../shared/middleware/requireDb');

router.use(requireSuperAdmin, requireScriperStore);

// @route   GET /api/admin/scriper-jobs
router.get('/', async (req, res) => {
  try {
    const jobs = await dbStore.getJobs();
    return res.json({ success: true, count: jobs.length, data: jobs, items: jobs });
  } catch (error) {
    console.error('❌ [GET /api/admin/scriper-jobs Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error fetching scrape jobs.' });
  }
});

// @route   GET /api/admin/scriper-jobs/:jobId
router.get('/:jobId', async (req, res) => {
  try {
    const job = await dbStore.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Scrape job not found.' });
    return res.json({ success: true, data: job });
  } catch (error) {
    console.error(`❌ [GET /api/admin/scriper-jobs/${req.params.jobId} Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error fetching scrape job.' });
  }
});

// @route   POST /api/admin/scriper-jobs
// @desc    A manually-entered job record — not a live scrape (use /api/scraper/start for that).
router.post('/', async (req, res) => {
  try {
    const { name, source, query, location, landmark, depth, status, statusMessage } = req.body || {};
    const jobId = `job_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

    const created = await dbStore.createJob({
      jobId, name, source, query, location, landmark, depth, status, statusMessage,
    });

    console.log(`✅ [Scrape Job Created] "${created.jobId}"`);
    return res.status(201).json({ success: true, message: 'Job created.', data: created });
  } catch (error) {
    console.error('❌ [POST /api/admin/scriper-jobs Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error creating scrape job.' });
  }
});

// @route   PUT /api/admin/scriper-jobs/:jobId
router.put('/:jobId', async (req, res) => {
  try {
    const { name, source, query, location, landmark, depth, status, progress, statusMessage, resultCount, error: jobError } = req.body || {};
    const changes = {
      ...(name !== undefined && { name }),
      ...(source !== undefined && { source }),
      ...(query !== undefined && { query }),
      ...(location !== undefined && { location }),
      ...(landmark !== undefined && { landmark }),
      ...(depth !== undefined && { depth }),
      ...(status !== undefined && { status }),
      ...(progress !== undefined && { progress }),
      ...(statusMessage !== undefined && { statusMessage }),
      ...(resultCount !== undefined && { resultCount }),
      ...(jobError !== undefined && { error: jobError }),
    };

    const updated = await dbStore.updateJob(req.params.jobId, changes);
    if (!updated) return res.status(404).json({ success: false, message: 'Scrape job not found.' });

    console.log(`✏️ [Scrape Job Updated] "${req.params.jobId}"`);
    return res.json({ success: true, message: 'Job updated.', data: updated });
  } catch (error) {
    console.error(`❌ [PUT /api/admin/scriper-jobs/${req.params.jobId} Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error updating scrape job.' });
  }
});

// @route   DELETE /api/admin/scriper-jobs/:jobId
router.delete('/:jobId', async (req, res) => {
  try {
    const deleted = await dbStore.deleteJob(req.params.jobId);
    if (!deleted) return res.status(404).json({ success: false, message: 'Scrape job not found.' });

    console.log(`🗑️ [Scrape Job Deleted] "${req.params.jobId}"`);
    return res.json({ success: true, message: 'Job deleted.' });
  } catch (error) {
    console.error(`❌ [DELETE /api/admin/scriper-jobs/${req.params.jobId} Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error deleting scrape job.' });
  }
});

module.exports = router;
