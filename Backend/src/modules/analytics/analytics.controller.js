/* ══════════════════════════════════════════════════════════════════════════
   HTTP layer for GA4 analytics. Every handler: resolve the date range,
   ask googleAnalytics.service for plain data, send it — no GA-specific
   logic lives here, and nothing from the service account ever does either
   (the service only ever returns aggregated report rows).
   ══════════════════════════════════════════════════════════════════════════ */
const gaService = require('./googleAnalytics.service');
const { resolveRange } = require('./dateRange.util');

/** Express 4 does not catch a rejected async handler on its own. */
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ensureConfigured = () => {
  if (gaService.isConfigured()) return;
  const err = new Error(
    'Google Analytics is not configured on this server yet. Set GA_PROPERTY_ID and either '
    + 'GA_CLIENT_EMAIL + GA_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS in the backend .env, then restart.',
  );
  err.status = 503;
  err.code = 'GA_NOT_CONFIGURED';
  throw err;
};

// @route   GET /api/admin/analytics/overview
// @desc    The eight overview stat cards, current + previous period
// @access  Admin
const getOverview = asyncRoute(async (req, res) => {
  ensureConfigured();
  const range = resolveRange(req.query);
  const { current, previous } = await gaService.getOverview(range);
  res.json({ success: true, generatedAt: new Date().toISOString(), range, current, previous });
});

// @route   GET /api/admin/analytics/traffic
// @desc    Daily users/sessions/new users/page views + traffic-source split
// @access  Admin
const getTraffic = asyncRoute(async (req, res) => {
  ensureConfigured();
  const range = resolveRange(req.query);
  const { timeseries, sources } = await gaService.getTraffic(range);
  res.json({ success: true, generatedAt: new Date().toISOString(), range, timeseries, sources });
});

// @route   GET /api/admin/analytics/pages
// @desc    Top pages by views, with users and average engagement time
// @access  Admin
const getPages = asyncRoute(async (req, res) => {
  ensureConfigured();
  const range = resolveRange(req.query);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const pages = await gaService.getPages(range, limit);
  res.json({ success: true, generatedAt: new Date().toISOString(), range, pages });
});

// @route   GET /api/admin/analytics/users
// @desc    Device, browser and country breakdowns
// @access  Admin
const getUsers = asyncRoute(async (req, res) => {
  ensureConfigured();
  const range = resolveRange(req.query);
  const { devices, browsers, countries } = await gaService.getUsers(range);
  res.json({ success: true, generatedAt: new Date().toISOString(), range, devices, browsers, countries });
});

// @route   GET /api/admin/analytics/events
// @desc    Top GA4 events by count
// @access  Admin
const getEvents = asyncRoute(async (req, res) => {
  ensureConfigured();
  const range = resolveRange(req.query);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const events = await gaService.getEvents(range, limit);
  res.json({ success: true, generatedAt: new Date().toISOString(), range, events });
});

module.exports = { getOverview, getTraffic, getPages, getUsers, getEvents };
