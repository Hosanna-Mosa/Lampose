/* ══════════════════════════════════════════════════════════════════════════
   The checkout WebView's callback (`POST /visit-requests/:id/payment/callback`).

   The route is unauthenticated — Razorpay's browser checkout posts to it — so
   a request id is all a caller needs. Once a request is PAID nothing posted
   here may change that: a bad signature used to mark it `failed`, the app
   offered "Pay ₹X" again, and the student paid twice.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const VisitRequest = require('../src/modules/visits/visitRequest.model');
const { paymentCallback } = require('../src/modules/visits/visitPayment.controller');

withDatabase();

const makeRequest = (payment) => VisitRequest.create({
  listingId: 'listing-1', propertyName: 'Test PG',
  ownerName: 'Owner', ownerMobile: '+919000000001',
  customer: { name: 'Student', phone: '+919000000002' },
  payment: { required: true, orderId: 'order_test_1', ...payment },
});

/** Runs the handler and resolves with the HTML it sent. */
const callback = (id, body) => new Promise((resolve, reject) => {
  const res = {
    type() { return this; },
    send(html) { resolve(String(html)); return this; },
  };
  paymentCallback({ params: { id: String(id) }, body }, res, reject);
});

const forged = { razorpayPaymentId: 'pay_forged', razorpaySignature: 'not-a-signature' };

describe('the payment callback', () => {
  it('a bad signature on a PAID request leaves it paid', async () => {
    const doc = await makeRequest({ status: 'paid', paymentId: 'pay_real' });

    const html = await callback(doc._id, forged);

    const after = await VisitRequest.findById(doc._id).lean();
    assert.equal(after.payment.status, 'paid');
    assert.equal(after.payment.paymentId, 'pay_real');
    assert.match(html, /outcome=paid/);
  });

  it('a bad signature on an unpaid request is still refused', async () => {
    const doc = await makeRequest({ status: 'pending' });

    const html = await callback(doc._id, forged);

    const after = await VisitRequest.findById(doc._id).lean();
    assert.notEqual(after.payment.status, 'paid');
    assert.match(html, /outcome=unverified/);
  });
});
