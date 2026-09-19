/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/food-payouts — the staff side of a restaurant's payout.

   The FOURTH admin router in this module, and the second one about money:

     foodAdmin.routes.js       staff approving restaurants
     foodOrderAdmin.routes.js  staff reading orders, and refunding a diner
     restaurantAdmin.routes.js an OWNER working their own shop
     foodPayoutAdmin.routes.js staff settling what a shop asked to be paid

   A restaurant presses "Request payout" in its own console; the row lands
   here; a member of Lampose staff makes the bank transfer themselves and
   records it with the bank's reference. Nothing in this file moves money —
   `PAYOUTS_MANUAL` is the arrangement, not an interim one, and the Stay
   side's RazorpayX dispatch has no equivalent here yet.

   ## Reading is wide. Settling is not.

   Any signed-in administrator may read the queue, exactly as they may read
   the order queue and the refund queue. "Has that restaurant been paid" is
   an everyday question and should never need a permission.

   Marking one PAID is `money.release` — Super Admin — and that is the
   narrow gate on purpose. It is the same capability
   `partnerPayout.admin.routes.js` requires to settle the Stay side's
   equivalent, and the reasoning `foodOrderAdmin.routes.js` gives about
   recording an out-of-app refund applies here word for word: this route
   moves no money, but it is a CLAIM that money moved. It closes the request,
   tells the restaurant they have been paid, and releases nothing for anyone
   to check afterwards except the reference typed into it. A false one is
   worse than a slow payout, because nobody ever looks again.

   Rejecting is the same gate. Refusing a payout takes money out of a
   kitchen's pending column and puts it back in their balance — visible and
   reversible — but it is still an answer to a request for money, and the
   person who may say yes is the person who may say no.

   ## The reference is required, not optional

   A row marked paid with no bank reference is a claim nobody can check. The
   route refuses it rather than defaulting it to an empty string, which is
   why the check is here and not in the service.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { can } = require('../iam/iam.middleware');
const { tagFoodPartnerRequest } = require('./foodPartner.log');
const FoodPayout = require('./foodPayout.model');
const payouts = require('./foodPayout.service');

const router = express.Router();

/* Settling a payout is `money.release` — Super Admin — from the one
   permission table in iam/iam.roles.js. Reading is wider. See the header. */
const requireReleaser = can('money.release');

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const LIST_LIMIT = 100;

router.use(tagFoodPartnerRequest);
router.use(verifyAdminToken);
router.use(requireLamposeDb);

/* ── Reading ─────────────────────────────────────────────────────────── */

/**
 * @route   GET /api/v1/admin/food-payouts
 * @desc    The queue. `?status=pending` by default — the work, not the archive.
 * @access  Any signed-in administrator
 */
router.get('/', async (req, res) => {
  try {
    const asked = String(req.query.status || '').trim();
    const query = {};
    if (asked && asked !== 'all') {
      const wanted = asked.split(',').map((s) => s.trim())
        .filter((s) => FoodPayout.PAYOUT_STATUSES.includes(s));
      if (wanted.length) query.status = { $in: wanted };
    }
    if (req.query.restaurantId) query.restaurantId = String(req.query.restaurantId).trim();

    const limit = Math.min(Number(req.query.limit) || LIST_LIMIT, LIST_LIMIT);

    const [rows, grouped] = await Promise.all([
      FoodPayout.find(query).sort({ requestedAt: -1 }).limit(limit).lean(),
      /* The tab badges, computed UNFILTERED so a number cannot depend on
         which tab is open. `owed` is the one somebody opens this page for:
         money Lampose has been asked for and not yet sent. */
      FoodPayout.aggregate([
        { $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
    ]);

    const counts = {};
    const amounts = {};
    grouped.forEach((row) => { counts[row._id] = row.n; amounts[row._id] = row.amount; });

    return res.json({
      success: true,
      count: rows.length,
      counts,
      /* What is owed right now, in one number, for the nav badge and the
         top of the page. */
      owed: amounts.pending || 0,
      data: rows.map(payouts.present),
    });
  } catch (error) {
    console.error('❌ [Food Payout List Error]', error);
    return fail(res, 500, 'FAILED', 'Could not read the payout queue.');
  }
});

/**
 * @route   GET /api/v1/admin/food-payouts/:payoutId
 * @desc    One request, with the orders it covers.
 * @access  Any signed-in administrator
 */
router.get('/:payoutId', async (req, res) => {
  try {
    const row = await FoodPayout.findOne({ payoutId: String(req.params.payoutId).trim() }).lean();
    if (!row) return fail(res, 404, 'NOT_FOUND', 'No payout with that id.');
    return res.json({ success: true, data: payouts.present(row) });
  } catch (error) {
    console.error('❌ [Food Payout Read Error]', error);
    return fail(res, 500, 'FAILED', 'Could not read that payout.');
  }
});

/* ── Settling ────────────────────────────────────────────────────────── */

/**
 * @route   POST /api/v1/admin/food-payouts/:payoutId/paid
 * @desc    Record a bank transfer that has already been made.
 * @access  money.release (Super Admin)
 */
router.post('/:payoutId/paid', requireReleaser, async (req, res) => {
  try {
    const reference = String((req.body || {}).reference || '').trim();
    /* Required, not defaulted — see the header. This is the only thread
       between the row and the money actually leaving a bank. */
    if (!reference) {
      return fail(
        res, 400, 'VALIDATION',
        'Enter the bank transfer reference. A payout marked paid without one cannot be checked afterwards.',
      );
    }

    const payout = await payouts.markPaid(String(req.params.payoutId).trim(), {
      reference,
      admin: req.admin,
      note: (req.body || {}).note,
    });

    console.log(`💸 [Food Payout Paid] ${payout.payoutId} · ${payout.restaurantId} · ₹${payout.amount} · ref ${reference} · by ${req.admin.email}`);
    return res.json({ success: true, data: payouts.present(payout) });
  } catch (error) {
    if (error instanceof payouts.PayoutError) {
      return fail(res, error.status || 400, error.code, error.message);
    }
    console.error('❌ [Food Payout Mark-Paid Error]', error);
    return fail(res, 500, 'FAILED', 'Could not mark that payout paid.');
  }
});

/**
 * @route   POST /api/v1/admin/food-payouts/:payoutId/reject
 * @desc    Refuse a request. The orders it held go back to the shop's balance.
 * @access  money.release (Super Admin)
 */
router.post('/:payoutId/reject', requireReleaser, async (req, res) => {
  try {
    const reason = String((req.body || {}).reason || '').trim();
    /* The restaurant is shown this sentence. "Refused" with no reason is a
       support call somebody else has to take. */
    if (!reason) {
      return fail(res, 400, 'VALIDATION', 'Give a reason — the restaurant is shown it.');
    }

    const payout = await payouts.rejectPayout(String(req.params.payoutId).trim(), {
      reason,
      admin: req.admin,
    });

    console.log(`↩️  [Food Payout Rejected] ${payout.payoutId} · ${payout.restaurantId} · ₹${payout.amount} · by ${req.admin.email} · ${reason}`);
    return res.json({ success: true, data: payouts.present(payout) });
  } catch (error) {
    if (error instanceof payouts.PayoutError) {
      return fail(res, error.status || 400, error.code, error.message);
    }
    console.error('❌ [Food Payout Reject Error]', error);
    return fail(res, 500, 'FAILED', 'Could not refuse that payout.');
  }
});

module.exports = router;
