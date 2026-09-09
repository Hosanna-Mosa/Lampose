/* ══════════════════════════════════════════════════════════════════════════
   Admin-console control over `hotel_refunds` — the queue of guests owed money.

   Reading is open to any signed-in administrator, the same as Monitor and
   Partner Payouts: the queue is the operational picture. Paying or refusing
   is Super Admin only, for the same reason Withdraw and Mark as paid are —
   it is somebody's money, and this one has a bank account number on it that
   a person is about to type into a banking app.

   Shaped like `partnerPayout.admin.routes.js` on purpose. Two queues of
   money leaving Lampose by hand should work the same way.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const router = express.Router();

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { rateLimit } = require('../../shared/middleware/rateLimit');
const audit = require('../admins/adminAuditLog.model');
const { HotelRefund } = require('./hotelRefund.model');
const refunds = require('./refund.service');

/* Paying or refusing a refund is `money.release` — Super Admin — from the
   one permission table in iam/iam.roles.js. Reading is any administrator. */
const { can } = require('../iam/iam.middleware');

const fail = (res, error) => res.status(error.status || 400).json({
  success: false, code: error.code || 'FAILED', message: error.message,
});

router.use(requireLamposeDb, verifyAdminToken);

// @route   GET /api/v1/admin/refunds
// @desc    The queue, newest first — ?status=pending|awaiting_details|paid|rejected|All
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && status !== 'All') query.status = status;

    const rows = await HotelRefund.find(query).sort({ createdAt: -1 }).limit(500);
    return res.json({ success: true, count: rows.length, data: rows.map((r) => r.toAdmin()) });
  } catch (error) {
    return next(error);
  }
});

/* Keyed by administrator, like Withdraw: an office shares an IP. */
const payLimit = rateLimit({
  name: 'admin-refund-mark-paid',
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyOf: (req) => (req.admin ? `admin:${req.admin._id}` : req.ip),
});

// @route   POST /api/v1/admin/refunds/:id/mark-paid
// @desc    Record a bank transfer a person made to the guest
router.post('/:id/mark-paid', can('money.release'), payLimit, async (req, res, next) => {
  try {
    const refund = await refunds.markPaid(req.params.id, {
      reference: req.body?.reference,
      admin: req.admin,
    });

    await audit.record(req, {
      action: 'refund.marked_paid',
      targetType: 'hotel_refunds',
      targetId: refund._id,
      after: { amountPaise: refund.amountPaise, reference: refund.reference, bookingId: refund.bookingId },
    });

    /* Tell the guest. Fire-and-forget, like every notifier. */
    require('../notifications/stayRequest.notifier')
      .notifyStudentRefundPaid(refund)
      .catch((error) => console.error('[refund] paid but the guest was not notified:', error.message));

    return res.json({ success: true, data: refund.toAdmin() });
  } catch (error) {
    if (error instanceof refunds.RefundError) return fail(res, error);
    return next(error);
  }
});

// @route   POST /api/v1/admin/refunds/:id/reject
// @desc    Refuse a refund, with a reason the guest reads
router.post('/:id/reject', can('money.release'), async (req, res, next) => {
  try {
    const refund = await refunds.reject(req.params.id, {
      reason: req.body?.reason,
      admin: req.admin,
    });

    await audit.record(req, {
      action: 'refund.rejected',
      targetType: 'hotel_refunds',
      targetId: refund._id,
      after: { amountPaise: refund.amountPaise, reason: refund.rejectedReason },
    });

    return res.json({ success: true, data: refund.toAdmin() });
  } catch (error) {
    if (error instanceof refunds.RefundError) return fail(res, error);
    return next(error);
  }
});

module.exports = router;
