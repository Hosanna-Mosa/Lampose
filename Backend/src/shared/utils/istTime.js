/* ══════════════════════════════════════════════════════════════════════════
   Day boundaries in India time.

   The server runs on UTC, so `new Date().setHours(0,0,0,0)` is UTC midnight —
   05:30 in India. Every "today" built that way started five and a half hours
   late: an owner's or rider's evening counted towards tomorrow, and a chart's
   day labels were off by one for anything after 18:30 UTC. India has no
   daylight saving, so a fixed +05:30 is exact.
   ══════════════════════════════════════════════════════════════════════════ */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant India's day containing `at` began, as a real Date (UTC inside). */
const istStartOfDay = (at = new Date()) => {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
};

/** `days` whole Indian days before the start of today (0 = today's start). */
const istStartOfDaysAgo = (days, at = new Date()) => new Date(istStartOfDay(at).getTime() - days * DAY_MS);

/** "2026-10-01" — the Indian calendar date of `at`. */
const istDateKey = (at = new Date()) => new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** The instant India's calendar month containing `at` began. */
const istStartOfMonth = (at = new Date()) => {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - IST_OFFSET_MS);
};

module.exports = {
  IST_OFFSET_MS, istStartOfDay, istStartOfDaysAgo, istStartOfMonth, istDateKey,
};
