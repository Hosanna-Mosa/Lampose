/* ══════════════════════════════════════════════════════════════════════════
   The timer that carries out deletion requests once they fall due.

   Hourly, because a grace period is measured in days and nobody is waiting on
   the minute. Each sweep is `processDueDeletions` — see accountDeletion.eraser.js
   for what "carry out" means (erase, not remove) and why work in hand postpones.

   ## Off unless this is production, or somebody says otherwise

   Every other worker in this process is harmless when idle. This one empties
   accounts and cannot be undone, and `npm run dev` pointed at the wrong
   database is the mistake CLAUDE.md already warns about. So:

     NODE_ENV=production              on
     ACCOUNT_DELETION_WORKER=on       on, anywhere (a staging box, a test)
     ACCOUNT_DELETION_WORKER=off      off, even in production

   Off means requests still pile up, correctly dated, and
   `node scripts/process-account-deletions.js` carries them out by hand.

   Never exits the process and never throws out of the timer: a failed sweep
   is logged and the next hour tries again.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const { processDueDeletions } = require('./accountDeletion.eraser');

const EVERY_MS = 60 * 60 * 1000;
/* A little after boot rather than at it, so a restart loop is not also a
   deletion loop and the boot banner is not buried under the sweep's lines. */
const FIRST_AFTER_MS = 2 * 60 * 1000;

let timer = null;
let first = null;
let running = false;

const enabled = () => {
  const flag = String(process.env.ACCOUNT_DELETION_WORKER || '').trim().toLowerCase();
  if (flag === 'off') return false;
  if (flag === 'on') return true;
  return process.env.NODE_ENV === 'production';
};

const tick = async () => {
  if (running || mongoose.connection.readyState !== 1) return;
  running = true;
  try {
    const summary = await processDueDeletions({
      log: (line) => console.log(`🗑️  [Account Deletion] ${line}`),
    });
    if (summary.erased || summary.postponed || summary.failed) {
      console.log(
        `🗑️  [Account Deletion] sweep: ${summary.erased} erased, `
        + `${summary.postponed} postponed (work in hand), ${summary.failed} failed`,
      );
    }
  } catch (error) {
    console.error(`🗑️  [Account Deletion] sweep failed: ${error.message}`);
  } finally {
    running = false;
  }
};

/** Returns whether it started, so the boot banner can say which. */
const startAccountDeletionWorker = () => {
  if (timer || !enabled()) return false;
  first = setTimeout(tick, FIRST_AFTER_MS);
  timer = setInterval(tick, EVERY_MS);
  if (first.unref) first.unref();
  if (timer.unref) timer.unref();
  return true;
};

const stopAccountDeletionWorker = () => {
  if (first) clearTimeout(first);
  if (timer) clearInterval(timer);
  first = null;
  timer = null;
};

module.exports = {
  startAccountDeletionWorker, stopAccountDeletionWorker, accountDeletionWorkerEnabled: enabled, tick,
};
