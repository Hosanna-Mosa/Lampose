/* ══════════════════════════════════════════════════════════════════════════
   Collecting a cash-on-delivery order at the door — cash, or UPI on a QR.

   The diner chose "cash on delivery" at checkout. At the door the rider asks
   how they want to pay: cash into the hand, or a Razorpay UPI QR on the
   rider's phone. Either way the order ends `paid`, and `collection` records
   which, when, and which rider.

   ## Why a doorstep payment does NOT go through `confirmPayment`

   `foodPayment.confirmPayment` is how an ONLINE order becomes real: it tells
   the kitchen about a new order and the diner that it was placed. Run for a
   doorstep QR, it would ring the restaurant for food that is already at the
   customer's gate. So a QR payment is settled here, and the webhook sends it
   here by the `purpose` note the QR carries.

   ## One open QR, and no cash while one might still be paid

   A diner who scans and pays, and then also hands over cash because the
   screen had not updated yet, has paid twice. Two rules prevent it:

     · a new QR is minted only after the previous one is CLOSED and its
       payments checked — so there is never more than one code to pay;
     · "cash" is accepted only after the open QR is closed and checked. If
       the diner had in fact already paid on it, cash is refused and the
       rider is told so.

   ## Settling is one conditional write

   The webhook, the rider's status poll and the delivered check can all find
   the same payment at the same moment. `settleByQr` writes only where the
   order is not yet paid, so exactly one of them wins, and the others see an
   order that is already paid.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodOrder = require('../foodpartners/foodOrder.model');
const razorpay = require('../../infrastructure/razorpay/razorpay');
const realtime = require('../../infrastructure/realtime/realtime');
const dispatch = require('./foodDispatch.service');

const { qrIsOpen } = FoodOrder;

/** What a doorstep QR's `notes.purpose` says. The webhook routes on it. */
const DOORSTEP_PURPOSE = 'doorstep_collection';

/** How long a QR stays payable. Long enough for a diner to find their phone. */
const QR_LIFETIME_MS = 15 * 60 * 1000;

const LOG = '🧾 [doorstep]';

const totalPaise = (order) => Math.round(Number(order.grandTotal || 0) * 100);

/** An order a rider is collecting for: cash on delivery and not yet paid. */
const owesAtDoor = (order) => order.paymentMode === 'cod' && order.paymentStatus !== 'paid';

const tellParties = (order) => {
  try {
    realtime.toOrderParties(order, 'dispatch_update', dispatch.dispatchUpdate(order));
  } catch (error) {
    console.error(`${LOG} could not announce ${order.orderNumber}: ${error.message}`);
  }
};

/**
 * Mark an order paid by a UPI payment on its doorstep QR.
 *
 * @returns {Promise<{ settled: boolean, order: object|null, reason?: string }>}
 */
const settleByQr = async (orderNumber, { paymentId, amountPaise }) => {
  const order = await FoodOrder.findOne({ orderNumber });
  if (!order) return { settled: false, order: null, reason: 'unknown order' };

  if (Number.isFinite(amountPaise) && amountPaise < totalPaise(order)) {
    console.error(
      `${LOG} UNDERPAID ${orderNumber}: ${amountPaise} paise on the QR, ${totalPaise(order)} owed. `
      + 'NOT marked paid — somebody needs to refund or top this up.',
    );
    return { settled: false, order, reason: 'underpaid' };
  }

  if (order.paymentStatus === 'paid') {
    /* Two payments for one order is money a diner is owed back. Logged, not
       refunded: moving money is a person's decision here as everywhere. */
    if (paymentId && order.razorpay?.paymentId && order.razorpay.paymentId !== paymentId) {
      console.error(
        `${LOG} SECOND PAYMENT on ${orderNumber}: ${paymentId} arrived after the order was `
        + `already paid (${order.collection?.method || 'unknown'}). Refund it.`,
      );
    }
    return { settled: false, order, reason: 'already paid' };
  }

  const now = new Date();
  const updated = await FoodOrder.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $ne: 'paid' } },
    {
      $set: {
        paymentStatus: 'paid',
        'razorpay.paymentId': String(paymentId || ''),
        'razorpay.amountPaise': Number.isFinite(amountPaise) ? amountPaise : totalPaise(order),
        'razorpay.paidAt': now,
        'collection.method': 'upi_qr',
        'collection.amountPaise': Number.isFinite(amountPaise) ? amountPaise : totalPaise(order),
        'collection.collectedAt': now,
        'collection.collectedBy': order.delivery?.driverId || '',
        'collection.qr.closedAt': order.collection?.qr?.closedAt || now,
      },
      $push: {
        statusHistory: {
          status: order.status, at: now, by: 'system', note: 'Paid by UPI at the door',
        },
      },
    },
    { new: true },
  );

  if (!updated) {
    /* Lost the race to another path that settled it a moment earlier. */
    return { settled: false, order: await FoodOrder.findById(order._id), reason: 'already paid' };
  }

  console.log(`${LOG} ${orderNumber} paid by UPI · ₹${updated.grandTotal} · ${paymentId}`);
  tellParties(updated);
  return { settled: true, order: updated };
};

/**
 * Ask Razorpay whether the order's QR has been paid, and settle if so.
 * The catch-up for a webhook that is late or never arrives.
 *
 * @returns {Promise<object>} the order as it now stands
 */
const reconcileQr = async (order) => {
  const qrId = order.collection?.qr?.id;
  if (!qrId || !owesAtDoor(order) || !razorpay.isConfigured()) return order;

  const payments = await razorpay.fetchQrPayments(qrId);
  const paid = payments.find((p) => p.status === 'captured')
    || payments.find((p) => p.status === 'authorized');
  if (!paid) return order;

  const { order: after } = await settleByQr(order.orderNumber, {
    paymentId: paid.id, amountPaise: Number(paid.amount),
  });
  return after || order;
};

/**
 * Close the order's QR if it is still open, then check it one last time.
 * Called before anything that must be sure the QR can no longer take money.
 *
 * @returns {Promise<object>} the order as it now stands
 */
const closeQr = async (order) => {
  const qr = order.collection?.qr;
  if (!qr?.id || qr.closedAt || !razorpay.isConfigured()) return order;

  await razorpay.closeQrCode(qr.id);
  await FoodOrder.updateOne(
    { _id: order._id, 'collection.qr.id': qr.id },
    { $set: { 'collection.qr.closedAt': new Date() } },
  );
  const fresh = await FoodOrder.findById(order._id);
  return reconcileQr(fresh);
};

/**
 * The QR a rider shows the diner — the open one if there is one, a new one
 * if not.
 *
 * @returns {Promise<{ order: object, alreadyPaid: boolean }>}
 */
const openQrFor = async (order) => {
  let current = await reconcileQr(order);
  if (!owesAtDoor(current)) return { order: current, alreadyPaid: true };

  if (qrIsOpen(current.collection?.qr)) return { order: current, alreadyPaid: false };

  /* The previous one, if any, is closed and checked first — see the header. */
  current = await closeQr(current);
  if (!owesAtDoor(current)) return { order: current, alreadyPaid: true };

  const closeBy = Date.now() + QR_LIFETIME_MS;
  const qr = await razorpay.createQrCode({
    amountPaise: totalPaise(current),
    name: 'Lampose',
    description: `Order ${current.orderNumber}`,
    closeBy: closeBy / 1000,
    notes: { foodOrderNumber: current.orderNumber, purpose: DOORSTEP_PURPOSE },
  });

  const now = new Date();
  const saved = await FoodOrder.findOneAndUpdate(
    { _id: current._id },
    {
      $set: {
        'collection.qr': {
          id: qr.id,
          imageUrl: qr.image_url || '',
          amountPaise: totalPaise(current),
          expiresAt: new Date((Number(qr.close_by) || closeBy / 1000) * 1000),
          createdAt: now,
          closedAt: null,
        },
      },
    },
    { new: true },
  );
  console.log(`${LOG} ${current.orderNumber} QR ${qr.id} for ₹${current.grandTotal}`);
  return { order: saved, alreadyPaid: false };
};

/**
 * Record cash taken at the door onto an order about to be marked delivered.
 * Mutates the loaded document; the caller saves it with the delivery.
 */
const applyCash = (order, driverId, now = new Date()) => {
  order.paymentStatus = 'paid';
  order.collection = order.collection || {};
  order.collection.method = 'cash';
  order.collection.amountPaise = totalPaise(order);
  order.collection.collectedAt = now;
  order.collection.collectedBy = driverId || '';
};

module.exports = {
  DOORSTEP_PURPOSE,
  QR_LIFETIME_MS,
  owesAtDoor,
  settleByQr,
  reconcileQr,
  closeQr,
  openQrFor,
  applyCash,
};
