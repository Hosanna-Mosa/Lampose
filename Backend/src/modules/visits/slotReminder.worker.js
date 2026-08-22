/* ══════════════════════════════════════════════════════════════════════════
   The nudge nobody triggers.

   A customer who paid ₹199 and never picked a slot has nobody to notice:
   the owner is waiting for a slot, the customer closed WhatsApp, and the
   team was never told there is anything to chase. Same reasoning as
   expiry.worker.js next door — a deadline with both phones dead needs a
   timer — and the same shape: a plain interval, one tick at a time, no
   state, safe with two instances (the sweep takes each row with a guarded
   update, so exactly one instance sends for it).

   The tick is minutes, not seconds: the deadline here is hours long, and a
   reminder that lands two minutes late is still exactly on time.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const { sweepSlotReminders } = require('./assistedSlot.controller');

const TICK_MS = 5 * 60 * 1000;

let timer = null;
let running = false;

let stats = { ticks: 0, reminded: 0, errors: 0, lastRunAt: null, startedAt: null };

const say = (...args) => { if (!config.isTest) console.log(...args); };

/** One pass. Exported so a test can drive it without waiting on an interval.
    Never throws — a worker that dies on one bad tick stops reminding
    everybody else. */
const tick = async () => {
  if (running) return { skipped: true, reminded: 0 };
  if (mongoose.connection.readyState !== 1) return { skipped: true, reminded: 0 };

  running = true;
  try {
    const reminded = await sweepSlotReminders();
    stats.ticks += 1;
    stats.lastRunAt = new Date();
    if (reminded) stats.reminded += reminded;
    return { skipped: false, reminded };
  } catch (error) {
    stats.errors += 1;
    console.error('[slot-reminder] tick failed:', error.message);
    return { skipped: false, reminded: 0, error: error.message };
  } finally {
    running = false;
  }
};

/** Start ticking. Idempotent, like the expiry worker — `node --watch` re-runs
    the boot path on every save. */
const startSlotReminderWorker = () => {
  if (timer) return timer;

  timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  /* Unref'd: a background timer must never be the reason a process refuses
     to exit. */
  if (timer.unref) timer.unref();

  stats.startedAt = new Date();
  say(
    `⏱️  [slot-reminder] watching paid visits every ${TICK_MS / 60000} min`
    + ` (nudge after ${config.razorpay.slotReminderHours}h without a slot)`,
  );
  return timer;
};

const stopSlotReminderWorker = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};

/** For the health endpoint and the boot banner. */
const slotReminderWorkerStatus = () => ({
  running: Boolean(timer),
  everyMs: TICK_MS,
  afterHours: config.razorpay.slotReminderHours,
  ...stats,
});

/** Tests only. */
const resetSlotReminderStats = () => {
  stats = { ticks: 0, reminded: 0, errors: 0, lastRunAt: null, startedAt: null };
};

module.exports = {
  tick,
  startSlotReminderWorker,
  stopSlotReminderWorker,
  slotReminderWorkerStatus,
  resetSlotReminderStats,
};
