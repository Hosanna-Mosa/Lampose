/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/rider-ledger — the rider ledger, by hand.

     GET   /settings                       the cash limit and minimum withdrawal
     PATCH /settings                       { codLimit, minWithdrawal } in rupees
     GET   /:driverId                      one rider's balances and history
     POST  /:driverId/corrections          { wallet, outstanding, reason }

   Reading is any administrator. Writing is `riders.ledger` — Super Admin —
   because both writes change what somebody is owed: a correction is money
   on a rider's account that no delivery or payment put there, and the limit
   decides who may be handed cash. Each is audited.

   ## A correction is a new row, never an edit

   The ledger is append-only (riderLedgerEntry.model.js). A refund after
   delivery, a hand-over recorded twice, a rider short-changed at a door —
   each is put right by one `correction` row with the reason on it, and both
   the mistake and the fix stay on the record. Amounts are SIGNED rupees: +50
   outstanding means the rider owes ₹50 more; −50 wallet takes ₹50 out of it.
   A correction that would take either balance below zero is refused.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { can } = require('../iam/iam.middleware');
const audit = require('../admins/adminAuditLog.model');
const Driver = require('./driver.model');
const RiderLedgerSettings = require('./riderLedgerSettings.model');
const riderLedger = require('./riderLedger.service');
const withdrawals = require('./riderWithdrawal.service');

const { LedgerRefusal } = riderLedger;
const { SETTINGS_ID } = RiderLedgerSettings;

const router = express.Router();

const requireLedgerWriter = can('riders.ledger');

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const adminName = (req) => req.admin?.name || req.admin?.email || 'admin';

/** Rupees as typed (signed, two places at most) → paise, or null. */
const toPaise = (value, { signed = false } = {}) => {
  if (value == null || value === '') return 0;
  const rupees = Number(value);
  if (!Number.isFinite(rupees)) return null;
  const paise = Math.round(rupees * 100);
  if (Math.abs(rupees * 100 - paise) > 1e-6) return null;
  if (!signed && paise < 0) return null;
  return paise;
};

const settingsView = (s) => ({
  opened: Boolean(s.startedAt),
  startedAt: s.startedAt,
  codLimitPaise: s.codLimitPaise,
  minWithdrawalPaise: s.minWithdrawalPaise,
  updatedBy: s.updatedBy || '',
});

router.use(verifyAdminToken);
router.use(requireLamposeDb);

/* ── Settings ─────────────────────────────────────────────────────────── */

router.get('/settings', async (req, res, next) => {
  try {
    return res.json({ success: true, data: settingsView(await riderLedger.getSettings()) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/settings', requireLedgerWriter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const set = {};
    if (body.codLimit != null) {
      const paise = toPaise(body.codLimit);
      if (paise == null || paise < 100) {
        return fail(res, 400, 'INVALID_LIMIT', 'The cash limit must be at least ₹1, in rupees.');
      }
      set.codLimitPaise = paise;
    }
    if (body.minWithdrawal != null) {
      const paise = toPaise(body.minWithdrawal);
      if (paise == null || paise < 100) {
        return fail(res, 400, 'INVALID_MINIMUM', 'The minimum withdrawal must be at least ₹1, in rupees.');
      }
      set.minWithdrawalPaise = paise;
    }
    if (!Object.keys(set).length) {
      return fail(res, 400, 'NOTHING_TO_CHANGE', 'Send codLimit and/or minWithdrawal, in rupees.');
    }

    const before = await riderLedger.getSettings();
    /* Upserted without touching `startedAt`: changing the limit never opens
       the ledger — only scripts/open-rider-ledger.js does that. */
    await RiderLedgerSettings.updateOne(
      { _id: SETTINGS_ID },
      { $set: { ...set, updatedBy: adminName(req) } },
      { upsert: true },
    );
    const after = await riderLedger.getSettings();
    await audit.record(req, {
      action: 'rider_ledger.settings_changed',
      targetType: 'rider_ledger_settings',
      targetId: SETTINGS_ID,
      before: { codLimitPaise: before.codLimitPaise, minWithdrawalPaise: before.minWithdrawalPaise },
      after: { codLimitPaise: after.codLimitPaise, minWithdrawalPaise: after.minWithdrawalPaise },
    });
    return res.json({ success: true, data: settingsView(after) });
  } catch (error) {
    return next(error);
  }
});

/* ── One rider ────────────────────────────────────────────────────────── */

router.get('/:driverId', async (req, res, next) => {
  try {
    const driverId = String(req.params.driverId || '').trim();
    const before = Number.parseInt(req.query.before, 10);
    const [statement, recent] = await Promise.all([
      riderLedger.statementFor(driverId, { limit: 50, beforeSeq: Number.isFinite(before) ? before : undefined }),
      withdrawals.withdrawalsFor(driverId, { limit: 10 }),
    ]);
    return res.json({ success: true, data: { ...statement, withdrawals: recent } });
  } catch (error) {
    return next(error);
  }
});

router.post('/:driverId/corrections', requireLedgerWriter, async (req, res, next) => {
  try {
    const driverId = String(req.params.driverId || '').trim();
    const driver = await Driver.findOne({ driverId }).select('driverId name').lean();
    if (!driver) return fail(res, 404, 'NOT_FOUND', 'We could not find that rider.');

    const { startedAt } = await riderLedger.getSettings();
    if (!startedAt) return fail(res, 409, 'LEDGER_NOT_OPEN', 'The rider ledger has not been opened yet.');

    const body = req.body || {};
    const walletPaise = toPaise(body.wallet, { signed: true });
    const outstandingPaise = toPaise(body.outstanding, { signed: true });
    if (walletPaise == null || outstandingPaise == null) {
      return fail(res, 400, 'INVALID_AMOUNT', 'Enter amounts in rupees, e.g. 50 or -50.');
    }
    if (!walletPaise && !outstandingPaise) {
      return fail(res, 400, 'NOTHING_TO_CHANGE', 'Change the wallet, the outstanding, or both.');
    }
    const reason = String(body.reason || '').trim().slice(0, 500);
    if (!reason) return fail(res, 400, 'REASON_REQUIRED', 'Say why — it is kept on the rider’s history.');

    const by = adminName(req);
    const { entry, balance } = await riderLedger.post(driverId, () => ({
      kind: 'correction', walletPaise, outstandingPaise, note: reason, by,
    }));
    /* A wallet credit clears outstanding first, the same as any other. */
    await riderLedger.autoAdjust(driverId);

    await audit.record(req, {
      action: 'rider_ledger.corrected',
      targetType: 'app_drivers',
      targetId: driverId,
      before: null,
      after: {
        walletPaise, outstandingPaise, reason, seq: entry.seq,
        walletAfterPaise: balance.walletPaise, outstandingAfterPaise: balance.outstandingPaise,
      },
    });
    console.log(`📒 [rider-ledger] correction for ${driverId} by ${by}: wallet ${walletPaise}, outstanding ${outstandingPaise} — ${reason}`);

    const statement = await riderLedger.statementFor(driverId, { limit: 50 });
    return res.status(201).json({ success: true, data: statement });
  } catch (error) {
    if (error instanceof LedgerRefusal) return fail(res, error.status, error.code, error.message);
    return next(error);
  }
});

module.exports = router;
