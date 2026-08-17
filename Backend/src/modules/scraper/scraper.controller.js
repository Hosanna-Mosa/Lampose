/* Google Maps lead scraping for leads.lampose.com. */
const crypto = require('node:crypto');
const dbStore = require('./scraper.store');
const playwrightScraper = require('./playwrightScraper.service');

const fail = (res, status, message) => res.status(status).json({
  success: false,
  message,
  error: message,
});

const leadFilters = (query) => ({
  jobId: query.jobId,
  source: query.source,
  hasPhone: query.hasPhone,
  hasWebsite: query.hasWebsite,
  assignedUserId: query.assignedUserId,
  leadStatus: query.leadStatus,
  search: query.search,
});

/**
 * The same filters, with the assignment boundary applied.
 *
 * An EMPLOYEE sees exactly the leads an admin has assigned to them, and the
 * server decides that — the `assignedUserId` the client sent is overwritten,
 * not trusted. This is the fix for a real leak rather than a tidy-up: the
 * panel was asking for its own id and, whenever that id was missing from the
 * session, sending no filter at all — which the query treats as "no filter"
 * and answers with every lead in the database.
 *
 * An ADMIN keeps the query string as written; filtering by one rep is how the
 * team view works.
 */
const scopedLeadFilters = (req) => {
  const filters = leadFilters(req.query);
  if (req.user && req.user.role === 'EMPLOYEE') {
    filters.assignedUserId = req.user.userId;
  }
  return filters;
};

/** The hard ceiling on a page. A client asking for 100000 gets 200. */
const MAX_PAGE_SIZE = 200;

/**
 * The page the caller asked for, if they asked for one.
 *
 * `limit` absent means "everything", which is what every caller got before
 * pagination existed — the CSV export still needs it, and so does any
 * integration written against the old shape. Pagination is opt-in, so nothing
 * that worked yesterday returns a truncated list today.
 */
const readPaging = (query) => {
  const limit = parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const size = Math.min(limit, MAX_PAGE_SIZE);
  return { page, limit: size, skip: (page - 1) * size };
};

/** True when this caller may move this lead. Admins may move any. */
const mayEditLead = (user, lead) => {
  if (!user || user.role === 'ADMIN') return true;
  const owner = lead && lead.assignedTo && lead.assignedTo.userId;
  return Boolean(owner) && owner === user.userId;
};

// @route POST /api/v2/scraper/start
const startScrape = async (req, res, next) => {
  try {
    const { query, location, landmark = '', source = 'GoogleMaps', depth } = req.body || {};

    if (!query || !location) {
      return fail(res, 400, 'Both "query" and "location" are required parameters.');
    }

    const cleanLandmark = String(landmark || '').trim();
    const jobId = `job_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const name = cleanLandmark
      ? `${query} near ${cleanLandmark}, ${location} (${source})`
      : `${query} in ${location} (${source})`;

    await dbStore.createJob({
      jobId,
      name,
      source,
      query,
      location,
      landmark: cleanLandmark,
      depth: parseInt(depth, 10) || undefined,
      status: 'started',
      progress: 0,
      statusMessage: 'Task queued...',
    });

    try {
      /* Awaited only far enough to know the browser engine exists — the
         scrape itself runs on after the response is sent. */
      await playwrightScraper.startScrapeJob(jobId, {
        query, location, landmark: cleanLandmark, source, depth,
      });
    } catch (error) {
      /* The job row already exists, so leaving it at "started" would show a
         mission in the history that is never going to move. */
      await dbStore.updateJob(jobId, {
        status: 'error',
        statusMessage: error.message,
        error: error.message,
      });
      throw error;
    }

    return res.json({
      success: true,
      message: 'Scrape mission started successfully!',
      data: { jobId, name, source, query, location, landmark: cleanLandmark, depth },
    });
  } catch (error) {
    if (error.name === 'ScraperUnavailableError') return fail(res, 503, error.message);
    return next(error);
  }
};

// @route GET /api/v2/scraper/status/:jobId
const getStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const live = playwrightScraper.getJobStatus(jobId);
    const stored = await dbStore.getJob(jobId);

    if (!live && !stored) return fail(res, 404, 'Job not found');

    /* The in-memory state is ahead of the database between progress writes,
       so it wins wherever it exists. */
    return res.json({
      success: true,
      data: {
        jobId,
        name: (stored && stored.name) || 'Scrape Mission',
        status: live
          ? (live.stopped ? 'stopped' : ((stored && stored.status) || 'running'))
          : ((stored && stored.status) || 'completed'),
        progress: live ? live.progress : (stored && stored.progress !== undefined ? stored.progress : 100),
        statusMessage: live
          ? live.statusMessage
          : ((stored && stored.statusMessage) || 'Completed'),
        resultCount: live
          ? live.scrapedCount
          : (stored && stored.resultCount !== undefined ? stored.resultCount : 0),
      },
    });
  } catch (error) {
    return next(error);
  }
};

// @route POST /api/v2/scraper/stop/:jobId
const stopScrape = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    await playwrightScraper.stopJob(jobId);
    return res.json({ success: true, message: `Job ${jobId} stop request submitted` });
  } catch (error) {
    return next(error);
  }
};

// @route GET /api/v2/scraper/leads
const getLeads = async (req, res, next) => {
  try {
    const filters = scopedLeadFilters(req);
    const paging = readPaging(req.query);

    if (!paging) {
      const leads = await dbStore.getLeads(filters);
      return res.json({
        success: true,
        count: leads.length,
        total: leads.length,
        page: 1,
        pages: 1,
        data: leads,
      });
    }

    /* The count runs against the same filter as the page, so the pager can
       never advertise a page the query would not fill. */
    const [total, leads] = await Promise.all([
      dbStore.countLeads(filters),
      dbStore.getLeads(filters, { skip: paging.skip, limit: paging.limit }),
    ]);

    return res.json({
      success: true,
      count: leads.length,
      total,
      page: paging.page,
      pages: Math.max(1, Math.ceil(total / paging.limit)),
      limit: paging.limit,
      data: leads,
    });
  } catch (error) {
    return next(error);
  }
};

// @route POST /api/v2/scraper/assign
const assignLeads = async (req, res, next) => {
  try {
    const { leadIds, userObj } = req.body || {};

    if (!Array.isArray(leadIds) || leadIds.length === 0 || !(userObj && userObj.userId)) {
      return fail(res, 400, 'Missing leadIds array or userObj object.');
    }

    const assigned = await dbStore.assignLeads(leadIds, userObj);
    return res.json({
      success: true,
      count: assigned,
      message: `Successfully assigned ${assigned} lead(s) to ${userObj.name || 'the selected employee'}.`,
    });
  } catch (error) {
    return next(error);
  }
};

// @route PATCH /api/v2/scraper/leads/:id/status
const updateLeadStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, noteText, authorName } = req.body || {};

    if (!status) return fail(res, 400, 'Status is required.');

    /* A rep may only move a lead that is theirs. Without this an employee who
       learned any lead id could re-status somebody else's pipeline, and the
       admin's team numbers would quietly stop meaning anything. */
    const lead = await dbStore.getLeadById(id);
    if (!lead) return fail(res, 404, 'Lead not found.');
    if (!mayEditLead(req.user, lead)) {
      return fail(res, 403, 'This lead is not assigned to you.');
    }

    const actor = req.user ? { userId: req.user.userId, name: req.user.name } : null;
    const author = authorName || (req.user && req.user.name) || 'User';

    const updated = await dbStore.updateLeadStatus(id, status, noteText, author, actor);
    if (!updated) return fail(res, 404, 'Lead not found.');

    return res.json({ success: true, message: 'Lead status & notes updated successfully.' });
  } catch (error) {
    return next(error);
  }
};

// @route GET /api/v2/scraper/team-stats
const getTeamStats = async (req, res, next) => {
  try {
    return res.json({ success: true, data: await dbStore.getTeamStats() });
  } catch (error) {
    return next(error);
  }
};

// @route GET /api/v2/scraper/jobs
const getJobs = async (req, res, next) => {
  try {
    const jobs = await dbStore.getJobs();
    return res.json({ success: true, count: jobs.length, data: jobs });
  } catch (error) {
    return next(error);
  }
};

// @route GET /api/v2/scraper/stats
const getStats = async (req, res, next) => {
  try {
    return res.json({ success: true, data: await dbStore.getStats() });
  } catch (error) {
    return next(error);
  }
};

/* ── CSV ──────────────────────────────────────────────────────────────────
   A leading =, +, - or @ makes a spreadsheet treat the cell as a formula, so
   a business name of "=cmd|..." becomes executable the moment someone opens
   the export. Prefixing an apostrophe is the standard neutralisation and is
   invisible in the cell. */
const csvCell = (value) => {
  const text = String(value === undefined || value === null ? '' : value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const CSV_COLUMNS = [
  ['Business Name', (l) => l.businessName],
  ['Phone', (l) => l.phone],
  ['Email', (l) => l.email],
  ['Website', (l) => l.website],
  ['Has Website', (l) => (l.hasWebsite ? 'TRUE' : 'FALSE')],
  ['Address', (l) => l.address],
  ['Rating', (l) => l.rating],
  ['Reviews', (l) => (l.reviewsCount === undefined || l.reviewsCount === null ? 0 : l.reviewsCount)],
  ['Category', (l) => l.category],
  ['City', (l) => l.city],
  ['Landmark / Area', (l) => l.landmark],
  ['Google Maps Link', (l) => l.mapsUrl],
  ['Assigned Employee', (l) => (l.assignedTo && l.assignedTo.name) || 'Unassigned'],
  ['Lead Status', (l) => l.leadStatus || 'NEW'],
  ['Source', (l) => l.source],
  ['Scraped At', (l) => l.scrapedAt],
];

// @route GET /api/v2/scraper/export
const exportLeads = async (req, res, next) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    const leads = await dbStore.getLeads(scopedLeadFilters(req));
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="scraped_leads_${stamp}.json"`);
      return res.send(JSON.stringify(leads, null, 2));
    }

    const rows = [
      CSV_COLUMNS.map(([header]) => csvCell(header)).join(','),
      ...leads.map((lead) => CSV_COLUMNS.map(([, read]) => csvCell(read(lead))).join(',')),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="scraped_leads_${stamp}.csv"`);
    /* The BOM is what makes Excel read the file as UTF-8 rather than the
       system codepage, which otherwise mangles every non-ASCII name. */
    return res.send(`﻿${rows.join('\r\n')}`);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  startScrape,
  getStatus,
  stopScrape,
  getLeads,
  assignLeads,
  updateLeadStatus,
  getTeamStats,
  getJobs,
  getStats,
  exportLeads,
};
