/* ══════════════════════════════════════════════════════════════════════════
   Admin-console control over `partner_payouts` — the half `payout.service.js`
   itself deliberately does not do on its own.

   `POST /partner-payouts/:id/process` is the one action here that moves real
   money, over RazorpayX (`config.razorpayx` — unset, this answers a named
   503 rather than a silent no-op, the same rule every other integration in
   this codebase follows). The GET is read-only visibility into the queue an
   administrator is about to act on.

   Reading the queue is any signed-in administrator (`money.read`), the same
   as the refund queue beside it in the console; paying, sending or refusing
   is `money.release` — Super Admin — from the one permission table in
   `iam/iam.roles.js`.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const router = express.Router();

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { can } = require('../iam/iam.middleware');
const { PartnerPayout } = require('./partnerDomains.model');
const payoutService = require('./payout.service');
const audit = require('../admins/adminAuditLog.model');
const config = require('../../config/env');

router.use(verifyAdminToken);
const requireReleaser = can('money.release');

// @route   GET /api/admin/partner-payouts
// @desc    The payout queue, newest first — filter with ?status=pending
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && status !== 'All') query.status = status;

    const items = await PartnerPayout.find(query).sort({ createdAt: -1 }).limit(500).lean();

    /* The owner's NAME, because a queue of ten-digit numbers is unusable when
       somebody rings up asking about their money. One query for the page
       rather than one per row. */
    // eslint-disable-next-line global-require
    const Partner = require('./partner.model');
    const digits = [...new Set(items.map((p) => p.partnerPhoneDigits).filter(Boolean))];
    const owners = digits.length
      ? await Partner.find({ phoneDigits: { $in: digits } }).select('phoneDigits name phone').lean()
      : [];
    const nameOf = new Map(owners.map((o) => [o.phoneDigits, o.name || '']));

    const data = items.map((p) => ({
      ...p,
      id: String(p._id),
      ownerName: nameOf.get(p.partnerPhoneDigits) || '',
    }));
    /* Which rail this deployment is on, so the console can label its button
       honestly rather than keeping its own copy of the same setting. */
    return res.json({
      success: true, count: data.length, data, manualPayouts: config.razorpayx.manualPayouts,
    });
  } catch (error) {
    console.error('❌ [GET /api/admin/partner-payouts Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error fetching payouts.' });
  }
});

// @route   POST /api/admin/partner-payouts/:id/process
// @desc    Dispatch a `pending` payout over RazorpayX
router.post('/:id/process', requireReleaser, async (req, res) => {
  try {
    const payout = await payoutService.processPayout(req.params.id);
    return res.json({ success: true, data: { ...payout.toObject(), id: String(payout._id) } });
  } catch (error) {
    if (error instanceof payoutService.PayoutError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    console.error('❌ [POST /api/admin/partner-payouts/:id/process Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Could not process this payout.' });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   The manual rail.

   While `PAYOUTS_MANUAL` is on, an owner is paid by a person making a bank
   transfer. These two endpoints are how that person records what they did:
   one says "I sent it, here is the reference", the other says "I am not
   sending this" and gives the owner their balance back.

   Both are Super Admin, like `process` above — marking a payout paid is not a
   smaller act than dispatching one. It is the same money, and this one has no
   bank refusing it if it is wrong.
   ══════════════════════════════════════════════════════════════════════════ */

// @route   POST /api/admin/partner-payouts/:id/mark-paid
// @desc    Record a bank transfer a person made by hand
router.post('/:id/mark-paid', requireReleaser, async (req, res) => {
  try {
    const payout = await payoutService.markPaidManually(req.params.id, {
      reference: req.body?.reference,
      admin: req.admin,
    });

    await audit.record(req, {
      action: 'partner_payout.marked_paid',
      targetType: 'partner_payouts',
      targetId: payout._id,
      after: {
        amount: payout.amount,
        reference: payout.razorpayReferenceId,
        settlements: payout.settlementCount,
      },
    });

    return res.json({ success: true, data: { ...payout.toObject(), id: String(payout._id) } });
  } catch (error) {
    if (error instanceof payoutService.PayoutError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    console.error('❌ [POST /api/admin/partner-payouts/:id/mark-paid Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Could not record that payment.' });
  }
});

// @route   POST /api/admin/partner-payouts/:id/reject
// @desc    Refuse a request and hand the owner's balance back
router.post('/:id/reject', requireReleaser, async (req, res) => {
  try {
    const payout = await payoutService.rejectPayout(req.params.id, {
      reason: req.body?.reason,
      admin: req.admin,
    });

    await audit.record(req, {
      action: 'partner_payout.rejected',
      targetType: 'partner_payouts',
      targetId: payout._id,
      after: { amount: payout.amount, reason: payout.failureReason },
    });

    return res.json({ success: true, data: { ...payout.toObject(), id: String(payout._id) } });
  } catch (error) {
    if (error instanceof payoutService.PayoutError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    console.error('❌ [POST /api/admin/partner-payouts/:id/reject Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Could not refuse that payout.' });
  }
});

module.exports = router;
