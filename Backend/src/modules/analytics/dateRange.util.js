/* ══════════════════════════════════════════════════════════════════════════
   Turns the admin console's date-range filter into the calendar dates the
   GA4 Data API and the "vs previous period" comparison both need.

   Every preset is a trailing window that includes today, matching the
   `days` convention already used by /api/admin/stats (src/modules/admins/
   stats.routes.js) — "7 days" means the last 7 calendar days, today included.
   The "previous period" is the same number of days immediately before that,
   so a StatCard delta compares like-for-like window lengths.
   ══════════════════════════════════════════════════════════════════════════ */
const DAY_MS = 24 * 60 * 60 * 1000;

const RANGE_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  custom: 'Custom range',
};

const pad2 = (n) => String(n).padStart(2, '0');
const toISODate = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const addDays = (d, days) => new Date(d.getTime() + days * DAY_MS);

const todayUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

/** Strict `YYYY-MM-DD` parse — anything else (including an invalid calendar
 *  date like 2024-02-30) is rejected rather than silently coerced. */
const parseISODate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const valid = date.getUTCFullYear() === Number(y)
    && date.getUTCMonth() === Number(m) - 1
    && date.getUTCDate() === Number(d);
  return valid ? date : null;
};

const invalid = (message) => {
  const err = new Error(message);
  err.status = 400;
  err.code = 'INVALID_RANGE';
  return err;
};

/**
 * @param query  `req.query` — reads `range` and, for `range=custom`,
 *               `startDate`/`endDate`.
 * @returns { preset, label, startDate, endDate, previousStartDate, previousEndDate }
 *          all calendar dates as `YYYY-MM-DD`.
 */
function resolveRange(query = {}) {
  const preset = String(query.range || '7d').trim().toLowerCase();
  const today = todayUTC();

  let start;
  let end;

  if (preset === 'custom') {
    start = parseISODate(query.startDate);
    end = parseISODate(query.endDate);
    if (!start || !end) throw invalid('A custom range needs startDate and endDate as YYYY-MM-DD.');
    if (start > end) throw invalid('startDate must not be after endDate.');
    if (end > today) throw invalid('endDate cannot be in the future.');
    if (Math.round((end - start) / DAY_MS) + 1 > 366) throw invalid('Custom range cannot exceed 366 days.');
  } else if (preset === 'today') {
    start = today;
    end = today;
  } else if (preset === 'yesterday') {
    start = addDays(today, -1);
    end = addDays(today, -1);
  } else if (preset === '30d') {
    start = addDays(today, -29);
    end = today;
  } else if (preset === '90d') {
    start = addDays(today, -89);
    end = today;
  } else {
    // '7d' and anything unrecognised — a typo'd range should not 500.
    start = addDays(today, -6);
    end = today;
  }

  const spanDays = Math.round((end - start) / DAY_MS) + 1;
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(spanDays - 1));

  const resolvedPreset = preset === 'custom' ? 'custom' : (RANGE_LABELS[preset] ? preset : '7d');

  return {
    preset: resolvedPreset,
    label: RANGE_LABELS[resolvedPreset] || RANGE_LABELS['7d'],
    startDate: toISODate(start),
    endDate: toISODate(end),
    previousStartDate: toISODate(previousStart),
    previousEndDate: toISODate(previousEnd),
  };
}

module.exports = { resolveRange, RANGE_LABELS };
