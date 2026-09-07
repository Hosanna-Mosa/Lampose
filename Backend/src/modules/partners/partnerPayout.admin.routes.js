/* ══════════════════════════════════════════════════════════════════════════
   Admin-console control over `partner_payouts` — the half `payout.service.js`
   itself deliberately does not do on its own.

   `POST /partner-payouts/:id/process` is the one action here that moves real
   money, over RazorpayX (`config.razorpayx` — unset, this answers a named
   503 rather than a silent no-op, the same rule every other integration in
   this codebase follows). The GET is read-only visibility into the queue an
   administrator is about to act on.

   Super-Admin-only, matching every other collection-level admin surface —
   see `visitRequest.admin.routes.js`, which this is deliberately shaped like.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const router = express.Router();

const requireSuperAdmin = require('../../shared/middleware/requireSuperAdmin');
const { PartnerPayout } = require('./partnerDomains.model');
const payoutService = require('./payout.service');

router.use(requireSuperAdmin);

// @route   GET /api/admin/partner-payouts
// @desc    The payout queue, newest first — filter with ?status=pending
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && status !== 'All') query.status = status;

    const items = await PartnerPayout.find(query).sort({ createdAt: -1 }).limit(500).lean();
    const data = items.map((p) => ({ ...p, id: String(p._id) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('❌ [GET /api/admin/partner-payouts Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error fetching payouts.' });
  }
});

// @route   POST /api/admin/partner-payouts/:id/process
// @desc    Dispatch a `pending` payout over RazorpayX
router.post('/:id/process', async (req, res) => {
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

module.exports = router;
