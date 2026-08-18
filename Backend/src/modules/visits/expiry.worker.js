/* ══════════════════════════════════════════════════════════════════════════
   The clock that runs out, with both phones dead.

   ## Why a worker exists at all

   Every other transition has somebody triggering it: an owner taps, a student
   taps. Expiry has nobody. If the only thing that noticed a deadline was a
   read, then a request whose owner never opened the app and whose student
   closed theirs would sit `pending_owner` forever — no status change and, more
   to the point, no notification. The whole promise of the flow is that the
   student finds out either way.

   So: a plain interval in this process, started once the database is up.

   ## Why not a queue

   Because there is exactly one timer in this product and it fires every few
   seconds against an indexed query. A job runner would be a new dependency, a
   new deployment concern and a new failure mode, in exchange for durability
   this does not need — the deadline is recomputed from `expiresAt` on every
   tick, so a process that dies and restarts loses nothing. There is no state
   in the worker. That is the design, not an omission.

   ## Two instances are fine

   Each runs its own interval, and both will find the same overdue rows. They
   cannot both expire one: `expireDue` transitions row by row with a guarded
   update, so of two workers exactly one matches each row, and only the one
   that matched is told to notify. Scaling out needs no leader election and no
   lock.

   ## What it is NOT allowed to do

   Touch the web channel. Those requests belong to guests on lampose.com whose
   owners have twenty-four hours and answer on WhatsApp; expiring them on a
   three-minute clock would close a day's worth of real requests. The filter
   lives in `expireDue`, and there is a test for it.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const { expireDue } = require('./stayRequest.service');

let timer = null;
/* One tick at a time. A tick that overruns its interval — a slow database, a
   large backlog — must not have a second one start beside it: both would find
   the same rows, and while the guarded update makes that harmless it is pure
   waste against a database that is already struggling. */
let running = false;

let stats = { ticks: 0, expired: 0, errors: 0, lastRunAt: null, startedAt: null };

/* Quiet under `node --test`, the same way requestLogger is. Not cosmetic: the
   test runner multiplexes each file's stdout over an IPC channel, and a
   multi-byte character written across a chunk boundary corrupts the stream —
   the whole file then fails to report with a deserialization error while
   every test inside it passed. */
const say = (...args) => { if (!config.isTest) console.log(...args); };

/**
 * What happens to a request whose three minutes are up.
 *
 * Injected rather than imported so this module stays free of the notification
 * layer: the worker's job is the transition, and "tell the student" is M6's.
 * Until that lands this logs, which is honest — the status IS changing, and
 * nothing is pretending a push went out.
 */
let onExpired = async (requests) => {
  for (const request of requests) {
    say(
      `[expiry] ${request._id} expired — ${request.propertyName}`
      + ` (${(request.customer && request.customer.name) || 'a student'})`,
    );
  }
};

/** M6 replaces the logger with the real fan-out. */
const setExpiryHandler = (handler) => {
  onExpired = typeof handler === 'function' ? handler : onExpired;
};

/**
 * One pass. Exported so a test can drive it without waiting on an interval.
 *
 * Never throws. A worker that dies on one bad tick stops expiring everything
 * else, which is a far worse failure than the tick itself — and the next tick
 * recomputes from scratch, so a transient error costs five seconds.
 */
const tick = async () => {
  if (running) return { skipped: true, expired: 0 };
  if (mongoose.connection.readyState !== 1) return { skipped: true, expired: 0 };

  running = true;
  try {
    const expired = await expireDue();
    stats.ticks += 1;
    stats.lastRunAt = new Date();

    if (expired.length) {
      stats.expired += expired.length;
      /* Notification failures must not stop the transition being recorded —
         it already is. Reported and moved past. */
      try {
        await onExpired(expired);
      } catch (error) {
        console.error('[expiry] transition recorded but notifying failed:', error.message);
      }
    }

    return { skipped: false, expired: expired.length };
  } catch (error) {
    stats.errors += 1;
    console.error('[expiry] tick failed:', error.message);
    return { skipped: false, expired: 0, error: error.message };
  } finally {
    running = false;
  }
};

/**
 * Start ticking.
 *
 * Idempotent — calling it twice does not produce two intervals, which matters
 * because `node --watch` re-runs the boot path on every save.
 */
const startExpiryWorker = () => {
  if (timer) return timer;

  const every = config.booking.expiryTickMs;
  timer = setInterval(() => { tick().catch(() => {}); }, every);

  /* Unref'd: a background timer must never be the reason a process refuses to
     exit. The shutdown path clears it properly; this is for the cases that do
     not go through it, like a script that boots the app to make one call. */
  if (timer.unref) timer.unref();

  stats.startedAt = new Date();
  say(
    `⏱️  [expiry] watching stay requests every ${every / 1000}s`
    + ` (deadline ${config.booking.expiryMinutes} min)`,
  );
  return timer;
};

const stopExpiryWorker = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};

/** For the health endpoint and the boot banner. */
const expiryWorkerStatus = () => ({
  running: Boolean(timer),
  everyMs: config.booking.expiryTickMs,
  deadlineMinutes: config.booking.expiryMinutes,
  ...stats,
});

/** Tests only. */
const resetExpiryStats = () => {
  stats = { ticks: 0, expired: 0, errors: 0, lastRunAt: null, startedAt: null };
};

module.exports = {
  tick,
  startExpiryWorker,
  stopExpiryWorker,
  expiryWorkerStatus,
  setExpiryHandler,
  resetExpiryStats,
};
