/* ══════════════════════════════════════════════════════════════════════════
   `/api/v1/admin/visit-fees` — the console's "Visit fees" page.

     GET   any signed-in administrator (`money.read`): the table, who last
           changed it, and the recent history.
     PUT   Super Admin only (`fees.set`): `{ tiers: { '2BHK': 99900, … } }`,
           in paise. Partial updates are fine; unknown tiers are refused.

   A change reprices requests created AFTER it. Every request freezes its fee
   at creation, so nothing already asked for — or paid — moves.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const router = express.Router();

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { can } = require('../iam/iam.middleware');
const fees = require('./visitFees.service');

router.use(verifyAdminToken);

// @route   GET /api/v1/admin/visit-fees
router.get('/', can('money.read'), async (req, res) => {
  try {
    await fees.refresh();
    return res.json({ success: true, data: { ...fees.describe(), history: await fees.history() } });
  } catch (error) {
    console.error('❌ [GET /api/admin/visit-fees Error]:', error.message);
    return res.status(500).json({ success: false, message: 'Could not read the visit fees.' });
  }
});

// @route   PUT /api/v1/admin/visit-fees
router.put('/', can('fees.set'), async (req, res) => {
  try {
    const data = await fees.updateFees(req.body && req.body.tiers, req);
    console.log(`💰 [Visit fees changed] by ${req.admin && req.admin.email}`);
    return res.json({ success: true, message: 'Visit fees updated.', data: { ...data, history: await fees.history() } });
  } catch (error) {
    if (error instanceof fees.VisitFeeError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    console.error('❌ [PUT /api/admin/visit-fees Error]:', error.message);
    return res.status(500).json({ success: false, message: 'Could not update the visit fees.' });
  }
});

module.exports = router;
