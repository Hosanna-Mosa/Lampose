const mongoose = require('mongoose');

const service = require('./stayCoupon.service');

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

/**
 * What the app is told about a coupon.
 *
 * `spendable` is computed here rather than left to the client to work out from
 * `status` and `expiresAt`. Three states and a date is a rule, and a rule
 * evaluated in two apps is a rule that will eventually be evaluated two
 * different ways — the checkout would offer a coupon the server then refuses,
 * which reads as the discount being taken away at the till.
 */
const toPublic = (coupon) => ({
  id: String(coupon._id),
  code: coupon.code,
  amountRupees: coupon.amountRupees,
  status: coupon.status,
  spendable: coupon.status === 'active' && new Date(coupon.expiresAt) > new Date(),
  propertyName: coupon.propertyName || '',
  expiresAt: coupon.expiresAt,
  usedAt: coupon.usedAt || null,
  earnedAt: coupon.createdAt,
});

// @route   GET /api/v2/customers/stay-coupons
// @desc    Every ₹100 move-in reward this customer holds, newest first
// @access  Customer session
const listMine = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const rows = await service.listFor(req.customer.customerId);
    return res.json({ success: true, data: rows.map(toPublic) });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listMine, toPublic };
