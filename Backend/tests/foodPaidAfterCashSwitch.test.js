/* ══════════════════════════════════════════════════════════════════════════
   Money for an order the diner had already switched to cash.

   They backed out of the online checkout, tapped "Pay in cash", and then the
   payment they abandoned was captured anyway. The rider collects at the door
   too, so the diner has paid twice. That online payment must:

     · be recorded against the order, once, however many confirmations arrive
       (the in-app verify and the webhook both do, routinely);
     · never mark the order paid — on a cash order `paymentStatus` is the
       rider's collection;
     · appear in the console's refund queue. It used to be a log line only.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
const { handleFoodOrderWebhook, confirmPayment } = require('../src/modules/foodpartners/foodPayment.controller');
const { refundOwedFilter } = require('../src/modules/foodpartners/foodOrderAdmin.controller');

withDatabase();

/* Inserted raw: only the fields this path reads matter, and the rest of an
   order's required shape is not what is under test. */
const cashOrder = async (orderNumber, over = {}) => {
  await FoodOrder.collection.insertOne({
    orderNumber,
    status: 'accepted',
    paymentMode: 'cod',
    paymentStatus: 'pending',
    grandTotal: 250,
    razorpay: { orderId: `order_${orderNumber}`, paymentId: '', paidAt: null },
    statusHistory: [],
    placedAt: new Date(),
    ...over,
  });
};

const refundLines = (order) => order.statusHistory
  .filter((e) => /refund this payment/.test(e.note || ''));

describe('an online payment captured after switching to cash', () => {
  it('is recorded once, not marked paid, and is in the refund queue', async () => {
    await cashOrder('LO100001');

    const payment = { orderNumber: 'LO100001', paymentId: 'pay_late', amountPaise: 25000 };
    await handleFoodOrderWebhook(payment);
    /* The in-app verify for the same payment arriving as well. */
    await confirmPayment(await FoodOrder.findOne({ orderNumber: 'LO100001' }), payment);

    const order = await FoodOrder.findOne({ orderNumber: 'LO100001' }).lean();
    assert.equal(order.paymentMode, 'cod');
    assert.equal(order.paymentStatus, 'pending');
    assert.equal(order.razorpay.paymentId, 'pay_late');
    assert.ok(order.razorpay.paidAt);
    assert.equal(refundLines(order).length, 1);

    assert.equal(await FoodOrder.countDocuments(refundOwedFilter()), 1);
  });

  it('an ordinary cash order is not in the refund queue', async () => {
    await cashOrder('LO100002');
    assert.equal(await FoodOrder.countDocuments(refundOwedFilter()), 0);
  });

  it('and leaves the queue once its refund is recorded', async () => {
    await cashOrder('LO100003', {
      razorpay: {
        orderId: 'order_LO100003', paymentId: 'pay_late', paidAt: new Date(), refundId: 'rfnd_1',
      },
    });
    assert.equal(await FoodOrder.countDocuments(refundOwedFilter()), 0);
  });
});
