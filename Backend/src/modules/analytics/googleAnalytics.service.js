/* ══════════════════════════════════════════════════════════════════════════
   GA4 reporting — the only file in this module that talks to Google.

   Everything here reads a GA4 property through the Google Analytics Data API
   (BetaAnalyticsDataClient) using a service account with Viewer access. The
   controller never touches the client directly; it only sees the plain
   objects these functions return.

   Auth is never hardcoded. The client is built from whichever the deployment
   provides:

     GA_CLIENT_EMAIL + GA_PRIVATE_KEY   inline credentials, read from .env —
                                         the path used on this backend's own
                                         systemd deployment (see deploy/VPS.md:
                                         "Environment comes from .env ... read
                                         by dotenv"), so no second file needs
                                         to be shipped to the server.
     GOOGLE_APPLICATION_CREDENTIALS     a path to the downloaded service-
                                         account JSON — Google's own Application
                                         Default Credentials convention. Used
                                         automatically by `new
                                         BetaAnalyticsDataClient()` when the
                                         inline pair above is absent.

   Report requests are batched with `batchRunReports` wherever a dashboard
   tile needs more than one report shape (traffic + sources, devices +
   browsers + countries) so it costs one Data API call instead of several,
   and every result is cached for GA_CACHE_TTL_MS (analytics.cache.js) so
   flipping between admin tabs does not re-spend the property's daily quota.
   ══════════════════════════════════════════════════════════════════════════ */
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const { cached } = require('./analytics.cache');

let client = null;
let clientInitFailed = false;

const configError = (message) => {
  const err = new Error(message);
  err.status = 503;
  err.code = 'GA_NOT_CONFIGURED';
  return err;
};

/** `123456789` or `properties/123456789` in .env, either way — normalised to
 *  the `properties/<id>` resource name the API requires. */
const getPropertyResource = () => {
  const raw = String(process.env.GA_PROPERTY_ID || '').trim();
  if (!raw) {
    throw configError(
      'GA_PROPERTY_ID is not set. Add the GA4 property ID to the backend .env to enable analytics.',
    );
  }
  return raw.startsWith('properties/') ? raw : `properties/${raw}`;
};

/** Built once and reused — the client keeps its own gRPC connection pool. */
const getClient = () => {
  if (client) return client;
  if (clientInitFailed) {
    throw configError('Google Analytics client could not be initialised. Check server logs.');
  }

  try {
    const clientEmail = String(process.env.GA_CLIENT_EMAIL || '').trim();
    const privateKey = String(process.env.GA_PRIVATE_KEY || '').trim();

    /* Inline credentials, when both halves are present. `\n` is escaped in
       .env (a real newline would break the file), so it is unescaped here —
       the same trick the private_key field needs in any dotenv-based deploy. */
    const options = clientEmail && privateKey
      ? { credentials: { client_email: clientEmail, private_key: privateKey.replace(/\\n/g, '\n') } }
      : undefined; // → GOOGLE_APPLICATION_CREDENTIALS / ADC, resolved by the client itself

    client = new BetaAnalyticsDataClient(options);
    return client;
  } catch (err) {
    clientInitFailed = true;
    console.error('❌ [GoogleAnalyticsService] Failed to initialise BetaAnalyticsDataClient:', err.message);
    throw configError('Google Analytics client could not be initialised. Check server logs.');
  }
};

/** Google's client throws its own error shapes (gRPC codes, ADC lookup
 *  failures). Translated here into the {status, code, message} shape the
 *  shared error handler already knows how to render, so an admin sees why a
 *  request failed instead of a raw stack trace. */
const mapGaError = (err) => {
  const raw = String(err?.details || err?.message || '');

  if (/could not load the default credentials/i.test(raw) || /failed to load service account/i.test(raw)) {
    return configError(
      'Google Analytics credentials are missing or invalid. Set GA_CLIENT_EMAIL + GA_PRIVATE_KEY, '
      + 'or GOOGLE_APPLICATION_CREDENTIALS, in the backend .env.',
    );
  }

  const wrapped = new Error(raw || 'The Google Analytics Data API request failed.');
  wrapped.code = 'GA_REQUEST_FAILED';

  if (/permission/i.test(raw) || err?.code === 7) {
    wrapped.status = 403;
    wrapped.message = 'The service account does not have access to this GA4 property. '
      + 'Confirm it was added to the property with Viewer access.';
  } else if (/not found/i.test(raw) || err?.code === 5) {
    wrapped.status = 404;
    wrapped.message = 'GA_PROPERTY_ID does not match a GA4 property this service account can see.';
  } else if (/quota|resource_exhausted/i.test(raw) || err?.code === 8) {
    wrapped.status = 429;
    wrapped.message = 'The Google Analytics Data API quota was exceeded. Try again shortly.';
  } else {
    wrapped.status = 502;
  }

  return wrapped;
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Zips a row's `metricValues` (positional, same order as the request's
 *  `metrics` array) with the metric names, coercing every value to a number. */
const rowMetrics = (row, metricNames) => Object.fromEntries(
  metricNames.map((name, i) => [name, num(row?.metricValues?.[i]?.value)]),
);

const dim = (row, i = 0) => row?.dimensionValues?.[i]?.value ?? '';

/** GA4 returns the `date` dimension as `YYYYMMDD`. */
const toISODate = (yyyymmdd) => (
  /^\d{8}$/.test(yyyymmdd)
    ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
    : yyyymmdd
);

/* ── Traffic-source bucketing ─────────────────────────────────────────────
   GA4's own `sessionDefaultChannelGroup` dimension has ~10 values (Paid
   Search, Paid Social, Paid Shopping, Organic Social, Organic Shopping,
   Organic Video, Display, Email, Affiliates, Unassigned, ...). The dashboard
   asks for six: Organic Search, Direct, Referral, Social, Paid, Other — so
   they are grouped down here rather than showing every raw GA label. */
const CHANNEL_BUCKET = {
  'organic search': 'Organic Search',
  direct: 'Direct',
  referral: 'Referral',
  'organic social': 'Social',
  'organic video': 'Social',
  'paid search': 'Paid',
  'paid social': 'Paid',
  'paid shopping': 'Paid',
  'paid other': 'Paid',
  'paid video': 'Paid',
  display: 'Paid',
  'organic shopping': 'Other',
  email: 'Other',
  affiliates: 'Other',
  audio: 'Other',
  sms: 'Other',
  'mobile push notifications': 'Other',
  unassigned: 'Other',
};

const bucketChannel = (rawChannel) => CHANNEL_BUCKET[String(rawChannel || '').trim().toLowerCase()] || 'Other';

const CHANNEL_ORDER = ['Organic Search', 'Direct', 'Referral', 'Social', 'Paid', 'Other'];

/** Runs a single `runReport`, mapping a client-level failure through
 *  `mapGaError`. Google's own network/auth errors otherwise reach the
 *  controller as an opaque gRPC error. */
const runReport = async (request) => {
  try {
    const [response] = await getClient().runReport({ property: getPropertyResource(), ...request });
    return response;
  } catch (err) {
    if (err.code === 'GA_NOT_CONFIGURED') throw err;
    throw mapGaError(err);
  }
};

const runBatch = async (requests) => {
  try {
    const [batch] = await getClient().batchRunReports({ property: getPropertyResource(), requests });
    return batch.reports || [];
  } catch (err) {
    if (err.code === 'GA_NOT_CONFIGURED') throw err;
    throw mapGaError(err);
  }
};

/* ── Overview — the eight stat cards, current period + previous period ──── */
const OVERVIEW_METRICS = [
  'totalUsers', 'activeUsers', 'newUsers', 'sessions',
  'screenPageViews', 'engagementRate', 'userEngagementDuration', 'eventCount',
];

const shapeOverviewRow = (row) => {
  if (!row) {
    return {
      totalUsers: 0, activeUsers: 0, newUsers: 0, sessions: 0,
      screenPageViews: 0, engagementRate: 0, avgEngagementTime: 0, eventCount: 0,
    };
  }
  const m = rowMetrics(row, OVERVIEW_METRICS);
  return {
    totalUsers: m.totalUsers,
    activeUsers: m.activeUsers,
    newUsers: m.newUsers,
    sessions: m.sessions,
    screenPageViews: m.screenPageViews,
    // GA4 reports this as a fraction (0–1); the dashboard shows a percentage.
    engagementRate: m.engagementRate * 100,
    // GA4's own UI defines "average engagement time" as total engaged seconds
    // over active users — there is no single metric for it in the Data API.
    avgEngagementTime: m.activeUsers > 0 ? m.userEngagementDuration / m.activeUsers : 0,
    eventCount: m.eventCount,
  };
};

async function getOverview(range) {
  const key = `overview:${range.startDate}:${range.endDate}:${range.previousStartDate}:${range.previousEndDate}`;
  return cached(key, async () => {
    // Two date ranges, no other dimension → exactly one row per range, in
    // request order: rows[0] is current, rows[1] is the comparison period.
    const response = await runReport({
      dateRanges: [
        { startDate: range.startDate, endDate: range.endDate },
        { startDate: range.previousStartDate, endDate: range.previousEndDate },
      ],
      metrics: OVERVIEW_METRICS.map((name) => ({ name })),
    });
    const rows = response.rows || [];
    return { current: shapeOverviewRow(rows[0]), previous: shapeOverviewRow(rows[1]) };
  });
}

/* ── Traffic — daily time series + channel breakdown, one Data API call ── */
async function getTraffic(range) {
  const key = `traffic:${range.startDate}:${range.endDate}`;
  return cached(key, async () => {
    const [seriesReport, sourcesReport] = await runBatch([
      {
        dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
        dimensions: [{ name: 'date' }],
        metrics: ['totalUsers', 'sessions', 'newUsers', 'screenPageViews'].map((name) => ({ name })),
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      },
      {
        dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: ['sessions', 'totalUsers'].map((name) => ({ name })),
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      },
    ]);

    const timeseries = (seriesReport.rows || []).map((row) => ({
      date: toISODate(dim(row)),
      ...rowMetrics(row, ['totalUsers', 'sessions', 'newUsers', 'screenPageViews']),
    }));

    // Fold GA's raw channel groups into the six dashboard buckets, summing
    // duplicates (e.g. Paid Search + Paid Social both land on "Paid").
    const bucketed = new Map(CHANNEL_ORDER.map((label) => [label, { channel: label, sessions: 0, totalUsers: 0 }]));
    (sourcesReport.rows || []).forEach((row) => {
      const bucket = bucketed.get(bucketChannel(dim(row)));
      const m = rowMetrics(row, ['sessions', 'totalUsers']);
      bucket.sessions += m.sessions;
      bucket.totalUsers += m.totalUsers;
    });

    return {
      timeseries,
      sources: CHANNEL_ORDER.map((label) => bucketed.get(label)),
    };
  });
}

/* ── Top pages ─────────────────────────────────────────────────────────── */
async function getPages(range, limit = 10) {
  const key = `pages:${range.startDate}:${range.endDate}:${limit}`;
  return cached(key, async () => {
    const response = await runReport({
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: ['screenPageViews', 'totalUsers', 'userEngagementDuration'].map((name) => ({ name })),
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit,
    });

    return (response.rows || []).map((row) => {
      const m = rowMetrics(row, ['screenPageViews', 'totalUsers', 'userEngagementDuration']);
      return {
        pagePath: dim(row, 0) || '/',
        pageTitle: dim(row, 1) || '(untitled)',
        screenPageViews: m.screenPageViews,
        totalUsers: m.totalUsers,
        avgEngagementTime: m.screenPageViews > 0 ? m.userEngagementDuration / m.screenPageViews : 0,
      };
    });
  });
}

/* ── Users — device, browser and geography breakdowns, one Data API call ─ */
async function getUsers(range) {
  const key = `users:${range.startDate}:${range.endDate}`;
  return cached(key, async () => {
    const [deviceReport, browserReport, countryReport] = await runBatch([
      {
        dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: ['totalUsers', 'sessions'].map((name) => ({ name })),
        orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
      },
      {
        dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
        dimensions: [{ name: 'browser' }],
        metrics: [{ name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
        limit: 6,
      },
      {
        dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
        dimensions: [{ name: 'country' }],
        metrics: ['totalUsers', 'sessions'].map((name) => ({ name })),
        orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
        limit: 10,
      },
    ]);

    return {
      devices: (deviceReport.rows || []).map((row) => ({
        category: dim(row) || 'Unknown',
        ...rowMetrics(row, ['totalUsers', 'sessions']),
      })),
      browsers: (browserReport.rows || []).map((row) => ({
        browser: dim(row) || 'Unknown',
        totalUsers: rowMetrics(row, ['totalUsers']).totalUsers,
      })),
      countries: (countryReport.rows || []).map((row) => ({
        country: dim(row) || 'Unknown',
        ...rowMetrics(row, ['totalUsers', 'sessions']),
      })),
    };
  });
}

/* ── Events ────────────────────────────────────────────────────────────── */
async function getEvents(range, limit = 10) {
  const key = `events:${range.startDate}:${range.endDate}:${limit}`;
  return cached(key, async () => {
    const response = await runReport({
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit,
    });

    return (response.rows || []).map((row) => ({
      eventName: dim(row) || '(not set)',
      eventCount: rowMetrics(row, ['eventCount']).eventCount,
    }));
  });
}

/** Whether enough configuration is present to attempt a request at all —
 *  used by the controller to fail fast with a clear message rather than
 *  letting a request reach Google first. */
const isConfigured = () => {
  const hasProperty = Boolean(String(process.env.GA_PROPERTY_ID || '').trim());
  const hasInlineCreds = Boolean(process.env.GA_CLIENT_EMAIL) && Boolean(process.env.GA_PRIVATE_KEY);
  const hasCredentialFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  return hasProperty && (hasInlineCreds || hasCredentialFile);
};

module.exports = {
  isConfigured,
  getOverview,
  getTraffic,
  getPages,
  getUsers,
  getEvents,
};
