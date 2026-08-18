const mongoose = require('mongoose');
const FoodCoupon = require('./foodCoupon.model');

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

// @route   GET /api/v2/customers/food-coupon
// @desc    This customer's food-order discount, if a referral earned them one
// @access  Customer session
const getMyCoupon = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const coupon = await FoodCoupon.findOne({ customerId: req.customer.customerId }).lean();
    /* `null` data, not a 404 — not having a coupon is the ordinary case for
       most customers, not an error to report as one. */
    return res.json({
      success: true,
      data: coupon ? { ...coupon, id: String(coupon._id) } : null,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getMyCoupon };
