/* Razorpay's own callback. Mounted apart from the visit-request routes
   because nothing of ours calls it: it is a gateway posting to us, and it
   authenticates with a signature over the raw body rather than a session. */
const express = require('express');

const { razorpayWebhook } = require('./razorpayWebhook.controller');

const router = express.Router();

router.post('/razorpay/webhook', razorpayWebhook);

module.exports = router;
