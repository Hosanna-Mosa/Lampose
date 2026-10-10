/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/rider-withdrawals — the staff side of a rider's withdrawal.

     GET  /                    the queue (?status=requested|paid|rejected|all&search=&method=bank|upi)
     GET  /:withdrawalId       one request — with the full account number for
                               the person who may pay it
     POST /:withdrawalId/paid    { reference }   the transfer was made
     POST /:withdrawalId/reject  { reason }      refused; money back to wallet

   The same gates as restaurant payouts (`foodPayoutAdmin.routes.js`), for
   the same reasons: reading is any administrator; marking paid or refused is
   `money.release` — Super Admin — because it is a CLAIM that money moved,
   and the reference is required because a claim nobody can check is worse
   than a slow payout. Nothing here moves money.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { can } = require('../iam/iam.middleware');
const withdrawals = require('./riderWithdrawal.service');
const { LedgerRefusal } = require('./riderLedger.service');
const audit = require('../admins/adminAuditLog.model');

const router = express.Router();

const requireReleaser = can('money.release');

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const adminName = (req) => req.admin?.name || req.admin?.email || 'admin';

const answer = (handler) => async (req, res, next) => {
  try {
    return await handler(req, res);
  } catch (error) {
    if (error instanceof LedgerRefusal) return fail(res, error.status, error.code, error.message);
    return next(error);
  }
};

router.use(verifyAdminToken);
router.use(requireLamposeDb);

router.get('/', answer(async (req, res) => {
  const status = String(req.query.status || 'requested');
  const data = await withdrawals.listWithdrawals({
    status,
    search: String(req.query.search || ''),
    method: String(req.query.method || ''),
  });
  return res.json({ success: true, data });
}));

router.get('/:withdrawalId', answer(async (req, res) => {
  /* The account number goes only to an administrator who could pay it. */
  const full = (req.capabilities || []).includes('money.release');
  const data = await withdrawals.getWithdrawal(String(req.params.withdrawalId).toUpperCase(), { full });
  if (!data) return fail(res, 404, 'NOT_FOUND', 'No withdrawal with that reference.');
  return res.json({ success: true, data });
}));

router.post('/:withdrawalId/paid', requireReleaser, answer(async (req, res) => {
  const data = await withdrawals.markPaid(String(req.params.withdrawalId).toUpperCase(), {
    reference: (req.body || {}).reference, by: adminName(req),
  });
  await audit.record(req, {
    action: 'rider_withdrawal.marked_paid', targetType: 'rider_withdrawals', targetId: data.withdrawalId,
    after: { driverId: data.driverId, amountPaise: data.amountPaise, reference: data.reference },
  });
  return res.json({ success: true, data });
}));

router.post('/:withdrawalId/reject', requireReleaser, answer(async (req, res) => {
  const data = await withdrawals.rejectWithdrawal(String(req.params.withdrawalId).toUpperCase(), {
    reason: (req.body || {}).reason, by: adminName(req),
  });
  await audit.record(req, {
    action: 'rider_withdrawal.rejected', targetType: 'rider_withdrawals', targetId: data.withdrawalId,
    after: { driverId: data.driverId, amountPaise: data.amountPaise, reason: data.rejectionReason },
  });
  return res.json({ success: true, data });
}));

module.exports = router;
