/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/order-link — the page behind the link in "you have a new order".

   Three routes, all for ONE order, all authenticated by the code in the link
   (`?token=`) and by nothing else. See `orderLink.service.js` for what the code
   is, how long it lives, and why a link is not a console session.

   The handlers are the console's own — `getMyOrder`, `setOrderStatus`,
   `setDeliveryMethod` — reached through a different door. So an owner who
   accepts from the link gets exactly what one who accepts in the console does:
   the cooking time, the choice of who delivers, the WhatsApp to the delivery
   desk, the customer's code before "delivered". Nothing is reimplemented here,
   which is the only way the two can stay the same.

   Deliberately NOT here: the queue, the menu, earnings, payouts, the profile.
   A link is good for the order it was made for.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const { requireOrderLink } = require('./orderLink.service');
const { getMyOrder, setOrderStatus, setDeliveryMethod } = require('./foodOrder.controller');

const router = express.Router();

router.get('/:orderNumber', requireOrderLink, getMyOrder);
router.patch('/:orderNumber/status', requireOrderLink, setOrderStatus);
router.patch('/:orderNumber/delivery', requireOrderLink, setDeliveryMethod);

module.exports = router;
