/* ══════════════════════════════════════════════════════════════════════════
   What an assisted visit costs — the tiers, the layout rule, and the cache.

   ## The rule

   A Bachelor or House / Co-live visit is priced by the LAYOUT the visitor
   picked (the request's `sharing.label`); a Commercial visit is priced by the
   category alone, because a shop has no layout. PG / Hostel is free and a
   Hotel pays for its stay — neither ever reaches this file.

     1 RK            ₹299     also "Single Private Room"
     1 BHK           ₹499
     2 BHK           ₹999
     3 BHK           ₹1,499
     4 BHK           ₹1,999
     5 BHK and above ₹2,499
     Commercial      ₹1,999   also any layout called a "Studio"

   Layout labels are free text typed by field agents ("1RK Independent",
   "2 BHK Apartment", "4 BHK Villa"), so the rule reads the number in front of
   BHK/RK rather than matching whole strings. A number is read BEFORE the word
   "studio", so "1 RK Studio" is a 1 RK and not a shop. A label nothing
   recognises is charged the lowest tier and logged: every bachelor visit paid
   before this change, and quietly making one free is the worse mistake.

   ## Why a synchronous cache

   The listing formatter is synchronous and runs for every card on a page, so
   it cannot await a database read. The table is held in memory, loaded at
   boot, re-read at most once a minute, and replaced immediately when the
   console saves. Mongo being down means the last known table — or the
   defaults below — keeps being served, which is the "nothing exits the
   process" rule applied to a price.

   The API runs as ONE process (see the dispatch note in CLAUDE.md), so the
   save that changes the table is the process that charges from it; the
   one-minute re-read covers a database that arrived after boot, or a second
   process should there ever be one. Charging does not read the database —
   an extra round trip there measurably delayed the owner's push.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const VisitFeeSettings = require('./visitFee.model');
const { normaliseCategory } = require('../../shared/constants/categories');

/** The tiers, in the order the console lists them. Defaults are in PAISE. */
const TIERS = Object.freeze([
  { key: '1RK', label: '1 RK', note: 'Also Single Private Room', defaultPaise: 29900 },
  { key: '1BHK', label: '1 BHK', note: '', defaultPaise: 49900 },
  { key: '2BHK', label: '2 BHK', note: '', defaultPaise: 99900 },
  { key: '3BHK', label: '3 BHK', note: '', defaultPaise: 149900 },
  { key: '4BHK', label: '4 BHK', note: '', defaultPaise: 199900 },
  { key: '5BHK', label: '5 BHK and above', note: '', defaultPaise: 249900 },
  { key: 'COMMERCIAL', label: 'Office / Shop / Commercial', note: 'Also Studio', defaultPaise: 199900 },
]);

const TIER_KEYS = Object.freeze(TIERS.map((t) => t.key));

/** Categories priced by the layout picked. COMMERCIAL is priced by category. */
const LAYOUT_PRICED_CATEGORIES = Object.freeze(['BACHELOR', 'COLIVE']);

/** What an unrecognised layout is charged — see the header. */
const FALLBACK_TIER = '1RK';

/* Razorpay's floor, and a ceiling that catches a rupee figure typed into a
   paise box (₹1,999 entered as 199900 rupees would be ₹19.99 lakh). */
const MIN_FEE_PAISE = 100;
const MAX_FEE_PAISE = 5000000;

const REFRESH_MS = 60 * 1000;

const defaults = () => Object.fromEntries(TIERS.map((t) => [t.key, t.defaultPaise]));

let table = defaults();
let meta = { updatedAt: null, updatedBy: null };
let loadedAt = 0;

/** Stored values over defaults; anything unusable in storage is ignored. */
const merge = (stored) => {
  const next = defaults();
  for (const key of TIER_KEYS) {
    const value = Number(stored && stored[key]);
    if (Number.isInteger(value) && value >= MIN_FEE_PAISE && value <= MAX_FEE_PAISE) next[key] = value;
  }
  return next;
};

/**
 * Which tier a layout label falls in, for a category.
 *
 * Returns `{ tier, recognised }`, or `null` for a category that does not pay
 * an assisted-visit fee at all.
 */
const tierForLayout = (category, label) => {
  const code = normaliseCategory(category);
  if (code === 'COMMERCIAL') return { tier: 'COMMERCIAL', recognised: true };
  if (!LAYOUT_PRICED_CATEGORIES.includes(code)) return null;

  const text = String(label || '').toLowerCase();

  const bhk = text.match(/(\d+)\s*-?\s*bhk/);
  if (bhk) {
    const rooms = Math.max(1, parseInt(bhk[1], 10));
    return { tier: rooms >= 5 ? '5BHK' : `${rooms}BHK`, recognised: true };
  }
  /* "1RK", "1 RK", "1-rk", "RK" — but not the "rk" inside "park". */
  if (/(^|[^a-z])rk\b/.test(text)) return { tier: '1RK', recognised: true };
  if (/single\s+(private\s+)?room/.test(text)) return { tier: '1RK', recognised: true };
  if (/studio/.test(text)) return { tier: 'COMMERCIAL', recognised: true };

  return { tier: FALLBACK_TIER, recognised: false };
};

/**
 * The fee for one visit, from the cached table. Synchronous.
 *
 * `{ tier, amountPaise, recognised }`, or null when the category pays none.
 */
const feeFor = (category, label) => {
  const hit = tierForLayout(category, label);
  if (!hit) return null;
  return { ...hit, amountPaise: table[hit.tier] };
};

/** Re-read the table. Never throws: a failed read keeps the last one. */
const refresh = async () => {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    const doc = await VisitFeeSettings.findById('current').lean();
    table = merge(doc && doc.tiers);
    meta = {
      updatedAt: doc && doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
      updatedBy: doc && doc.updatedBy && doc.updatedBy.adminId ? doc.updatedBy : null,
    };
    loadedAt = Date.now();
    return true;
  } catch (error) {
    console.warn('[visit-fees] could not read the fee table, keeping the last one:', error.message);
    return false;
  }
};

/** Refresh if the cache is older than a minute. For the charging path. */
const ensureFresh = async () => {
  if (Date.now() - loadedAt > REFRESH_MS) await refresh();
};

/**
 * Re-read every minute in the background, so listing pages pick up a change
 * (or the table itself, when the database arrives after boot). `unref` keeps
 * the timer from holding a script's process open.
 */
let timer = null;
const startAutoRefresh = () => {
  if (timer) return;
  timer = setInterval(() => { refresh(); }, REFRESH_MS);
  if (typeof timer.unref === 'function') timer.unref();
};

/** The table as the console and the public read it. */
const describe = () => ({
  tiers: TIERS.map((t) => ({
    key: t.key,
    label: t.label,
    note: t.note,
    amountPaise: table[t.key],
    defaultPaise: t.defaultPaise,
  })),
  updatedAt: meta.updatedAt,
  updatedBy: meta.updatedBy,
  limits: { minPaise: MIN_FEE_PAISE, maxPaise: MAX_FEE_PAISE },
});

class VisitFeeError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Change some or all tiers. `changes` is `{ tierKey: paise }`.
 *
 * Applies to requests created from now on only — every request freezes its
 * amount at creation (`paymentForNewRequest`).
 */
const updateFees = async (changes, req) => {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new VisitFeeError('BAD_TIERS', 'Send the fees as { tier: paise }.');
  }
  const entries = Object.entries(changes);
  if (!entries.length) throw new VisitFeeError('BAD_TIERS', 'Nothing to change.');

  for (const [key, value] of entries) {
    if (!TIER_KEYS.includes(key)) {
      throw new VisitFeeError('UNKNOWN_TIER', `"${key}" is not a fee tier.`);
    }
    if (!Number.isInteger(value) || value < MIN_FEE_PAISE || value > MAX_FEE_PAISE) {
      throw new VisitFeeError(
        'BAD_AMOUNT',
        `The fee for ${key} must be between ₹${MIN_FEE_PAISE / 100} and ₹${(MAX_FEE_PAISE / 100).toLocaleString('en-IN')}, in whole paise.`,
      );
    }
  }
  if (mongoose.connection.readyState !== 1) {
    throw new VisitFeeError('DB_DISCONNECTED', 'The database is not connected, so fees cannot be changed right now.', 503);
  }

  await refresh();
  const before = {};
  const after = {};
  for (const [key, value] of entries) {
    if (table[key] !== value) {
      before[key] = table[key];
      after[key] = value;
    }
  }
  if (!Object.keys(after).length) return describe();

  const admin = (req && req.admin) || {};
  const next = { ...table, ...after };
  await VisitFeeSettings.findByIdAndUpdate(
    'current',
    {
      $set: {
        tiers: next,
        updatedBy: {
          adminId: admin._id ? String(admin._id) : '',
          name: admin.name || '',
          email: admin.email || '',
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const { record } = require('../admins/adminAuditLog.model');
  await record(req, {
    action: 'visit_fees.changed',
    targetType: 'visit_fee_settings',
    targetId: 'current',
    before,
    after,
  });

  await refresh();
  return describe();
};

/** Recent changes, newest first, from the audit log. */
const history = async (limit = 20) => {
  if (mongoose.connection.readyState !== 1) return [];
  const { AdminAuditLog } = require('../admins/adminAuditLog.model');
  const rows = await AdminAuditLog.find({ action: 'visit_fees.changed' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return rows.map((row) => ({
    at: row.createdAt,
    by: { name: row.adminName, email: row.adminEmail, role: row.adminRole },
    before: row.before || {},
    after: row.after || {},
  }));
};

module.exports = {
  TIERS,
  TIER_KEYS,
  LAYOUT_PRICED_CATEGORIES,
  FALLBACK_TIER,
  MIN_FEE_PAISE,
  MAX_FEE_PAISE,
  VisitFeeError,
  tierForLayout,
  feeFor,
  refresh,
  ensureFresh,
  startAutoRefresh,
  describe,
  updateFees,
  history,
  /* Tests only: put the cache back to the defaults. */
  _reset: () => { table = defaults(); meta = { updatedAt: null, updatedBy: null }; loadedAt = 0; },
};
