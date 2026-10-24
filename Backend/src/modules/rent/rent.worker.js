/* ══════════════════════════════════════════════════════════════════════════
   The owner's morning rent alert.

   Once a day, after 9am India time, every owner with residents who owe rent
   (or whose rent falls due within the owner's `daysBefore`) gets one inbox
   row and one push: "2 due today, 3 overdue (₹18,000)". Residents are never
   messaged by this — reminding a tenant is the owner's call, made from the
   Reminders screen.

   ## Off unless this is production, or somebody says otherwise

   Like the account-deletion worker, and for the same reason CLAUDE.md gives:
   push is one shared Expo account, and `npm run dev` against the wrong
   database would buzz real owners' phones.

     NODE_ENV=production        on
     RENT_REMINDER_WORKER=on    on, anywhere
     RENT_REMINDER_WORKER=off   off, even in production

   ## Once a day, exactly

   `partner_rent_settings.lastDigestOn` is claimed with a conditional upsert
   BEFORE anything is sent. A second process, or the next hourly tick, finds
   today already claimed and does nothing.

   Never throws out of the timer and never exits the process.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const { PartnerBooking, PartnerNotification } = require('../partners/partnerDomains.model');
const { OCCUPYING } = require('../inventory/inventory.service');
const { todayInIndia } = require('../partners/bookingStage.util');
const { RentSettings } = require('./rent.model');
const { loadResidents, settingsFor } = require('./rent.service');

const EVERY_MS = 60 * 60 * 1000;
const FIRST_AFTER_MS = 3 * 60 * 1000;
const SEND_FROM_HOUR = 9;

let timer = null;
let first = null;
let running = false;

const enabled = () => {
  const flag = String(process.env.RENT_REMINDER_WORKER || '').trim().toLowerCase();
  if (flag === 'off') return false;
  if (flag === 'on') return true;
  return process.env.NODE_ENV === 'production';
};

const hourInIndia = (now = new Date()) => Number(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false,
}).format(now));

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** The sentence for one owner, or null when there is nothing to say. */
const digestFor = (rows, daysBefore) => {
  let dueToday = 0;
  let overdue = 0;
  let upcoming = 0;
  let owed = 0;
  for (const { periods } of rows) {
    let late = false;
    for (const p of periods) {
      if (p.status === 'due') { dueToday += 1; owed += p.balance; }
      if (p.status === 'overdue') { late = true; owed += p.balance; }
      if (p.status === 'upcoming' && p.daysUntil <= daysBefore) upcoming += 1;
    }
    if (late) overdue += 1;
  }
  if (!dueToday && !overdue && !upcoming) return null;

  const parts = [];
  if (dueToday) parts.push(`${dueToday} due today`);
  if (overdue) parts.push(`${overdue} overdue`);
  if (upcoming) parts.push(`${upcoming} due in the next ${daysBefore} day${daysBefore === 1 ? '' : 's'}`);
  const body = parts.join(', ') + (owed ? ` — ${inr(owed)} to collect` : '');
  return { title: 'Rent today', body: body.charAt(0).toUpperCase() + body.slice(1) };
};

/** Claim today for this owner. False when another tick already has. */
const claimToday = async (key, today) => {
  try {
    await RentSettings.findOneAndUpdate(
      { partnerPhoneDigits: key, lastDigestOn: { $ne: today } },
      { $set: { lastDigestOn: today } },
      { upsert: true },
    );
    return true;
  } catch (error) {
    if (error && error.code === 11000) return false;
    throw error;
  }
};

const notifyOwner = async (key, message) => {
  await PartnerNotification.create({
    partnerPhoneDigits: key, title: message.title, message: message.body,
    /* 'payment', not a new category: the app's inbox draws a fixed set of kinds. */
    category: 'payment', read: false,
  });
  try {
    const Partner = require('../partners/partner.model');
    const push = require('../../infrastructure/push/push');
    const account = await Partner.findOne({ phoneDigits: key }).select('devices').lean();
    const tokens = (account && account.devices ? account.devices : []).map((d) => d.token);
    if (!tokens.length) return;
    const result = await push.sendPush(tokens, { ...message, data: { kind: 'rent.digest' } });
    if (result && result.invalid && result.invalid.length) {
      await Partner.updateOne({ phoneDigits: key }, { $pull: { devices: { token: { $in: result.invalid } } } });
    }
  } catch (error) {
    console.error('[rent] push failed:', error.message);
  }
};

const runDigest = async ({ now = new Date(), log = () => {} } = {}) => {
  const today = todayInIndia(now);
  const keys = await PartnerBooking.distinct('partnerPhoneDigits', { status: { $in: OCCUPYING } });
  let sent = 0;
  for (const key of keys) {
    try {
      const settings = await settingsFor(key);
      if (!settings.ownerAlerts) continue;
      if (!(await claimToday(key, today))) continue;
      const message = digestFor(await loadResidents(key, { today }), settings.daysBefore);
      if (!message) continue;
      await notifyOwner(key, message);
      sent += 1;
    } catch (error) {
      log(`owner ${key}: ${error.message}`);
    }
  }
  return { owners: keys.length, sent };
};

const tick = async () => {
  if (running || mongoose.connection.readyState !== 1) return;
  if (hourInIndia() < SEND_FROM_HOUR) return;
  running = true;
  try {
    const summary = await runDigest({ log: (line) => console.error(`💸 [Rent] ${line}`) });
    if (summary.sent) console.log(`💸 [Rent] morning alert sent to ${summary.sent} owner(s)`);
  } catch (error) {
    console.error(`💸 [Rent] digest failed: ${error.message}`);
  } finally {
    running = false;
  }
};

const startRentReminderWorker = () => {
  if (timer || !enabled()) return false;
  first = setTimeout(tick, FIRST_AFTER_MS);
  timer = setInterval(tick, EVERY_MS);
  if (first.unref) first.unref();
  if (timer.unref) timer.unref();
  return true;
};

const stopRentReminderWorker = () => {
  if (first) clearTimeout(first);
  if (timer) clearInterval(timer);
  first = null;
  timer = null;
};

module.exports = {
  startRentReminderWorker, stopRentReminderWorker, rentReminderWorkerEnabled: enabled, runDigest, digestFor,
};
