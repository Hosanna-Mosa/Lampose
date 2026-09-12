/* ══════════════════════════════════════════════════════════════════════════
   The ₹199 assisted-visit payment — the ONE charge on a bachelor or co-live
   visit.

   ## The order of events, and why it is this order

     1  the student asks, with a LAYOUT and nothing else
     2  the owner accepts
     3  the customer pays ₹199 — ₹100 for the representative who accompanies
        them, ₹99 Lampose fee — via the WhatsApp link, the website, or the
        app's checkout. All of them settle the same record.
     4  only then do they pick a date and time (WhatsApp on the web channel,
        the app on the app channel — see assistedSlot.controller.js)
     5  and only when the slot is fixed do they get the street address

   Paying releases NOTHING by itself — no address, no owner number, no PIN,
   no bed. The address comes with the slot, the representative deals with
   the owner, and there is no PIN because the representative is at the door.
   (This file used to be the ₹20 visit token, which released all of those;
   the ₹20 and the separate ₹99 contact unlock are both retired.)

   ## What may mark a request paid

   Exactly one thing: `razorpay.verifySignature` (or the webhook's own
   signature check), over an HMAC only this server can compute. A client
   saying "it worked" is not evidence and is never treated as any.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const razorpay = require('../../infrastructure/razorpay/razorpay');
const VisitRequest = require('./visitRequest.model');
const { generateEntryPin } = require('./otp.util');
const { chargesUpFront } = require('../../shared/constants/categories');
const twilio = require('../../infrastructure/twilio/twilio');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/* The note that travels on every order and payment link this flow mints, and
   that the webhook dispatches on. Its ABSENCE also routes here — that is what
   a payment link minted before purposes existed looks like — which is why the
   webhook guards on the amount as well. */
const ASSISTED_PURPOSE = 'assisted_visit';
const STAY_PURPOSE = 'stay_booking';

/**
 * What THIS request charges for, read off the request rather than the listing.
 *
 * The category decided it once, at creation, and froze it — so a listing
 * re-categorised since must not change what an outstanding payment buys.
 * `assisted_visit` is the fallback because every row written before hotels
 * charged is one.
 */
const purposeOf = (doc) => doc?.payment?.purpose || ASSISTED_PURPOSE;

/**
 * The figure to charge, in paise, or null when there is none to charge.
 *
 * The fallback to the configured platform fee is correct for an assisted visit
 * — it is a fixed price and the request may not have an amount stamped yet —
 * and catastrophic for a stay, which has no configured price at all. A hotel
 * with no amount on the request would be charged ₹199 for a room.
 */
const amountFor = (doc) => (
  purposeOf(doc) === ASSISTED_PURPOSE
    ? (doc.payment?.amountPaise || config.razorpay.assistedVisitAmountPaise)
    : (doc.payment?.amountPaise || null)
);

/** What the guest sees on the Razorpay page and their statement. */
const describePayment = (doc) => (
  purposeOf(doc) === ASSISTED_PURPOSE
    ? `Assisted visit · ${doc.propertyName || 'Lampose'}`
    : `Stay booking · ${doc.propertyName || 'Lampose'}`
);

const fail = (res, status, code, message) =>
  res.status(status).json({ success: false, code, message, error: message });

/**
 * True when this property takes money through Lampose, of either kind.
 *
 * It used to test `TOKEN_CATEGORIES` — the assisted-visit categories — which
 * was the same question while they were the only ones that charged. A hotel
 * charges too, for the stay rather than a viewing, so the question this
 * answers is now "is there a payment step" and `paymentPurposeFor` answers
 * "which kind".
 *
 * The name is kept because it is exported and read at several call sites that
 * only care about the boolean.
 */
const needsToken = (property) => chargesUpFront(property && property.category);

const load = async (res, id) => {
  if (!OBJECT_ID.test(String(id))) {
    fail(res, 404, 'NOT_FOUND', 'That request no longer exists.');
    return null;
  }
  const doc = await VisitRequest.findById(id);
  if (!doc) {
    fail(res, 404, 'NOT_FOUND', 'That request no longer exists.');
    return null;
  }
  return doc;
};

/**
 * The payment link the confirmed customer is sent on WhatsApp.
 *
 * Created once and reused: reopening the same link is how somebody who closed
 * it comes back, and minting a second would leave two live ways to pay for one
 * visit.
 *
 * Returns null when payments are not configured or Razorpay refuses. The
 * caller carries on without it — an owner's confirmation must not fail because
 * a payment gateway did.
 */
const ensurePaymentLink = async (doc) => {
  if (!doc.payment?.required || doc.payment.status === 'paid') return null;
  if (doc.payment.linkUrl) return doc.payment.linkUrl;
  if (!razorpay.isConfigured()) return null;

  /* A stay with no price on it cannot be given a link. See `amountFor`. */
  const linkAmount = amountFor(doc);
  if (!linkAmount) return null;

  try {
    const link = await razorpay.createPaymentLink({
      amountPaise: linkAmount,
      description: describePayment(doc),
      name: doc.customer?.name,
      phone: doc.customer?.phone,
      /* The id AND the purpose ride along on the webhook, so the money finds
         its way home without a lookup table — and cannot be mistaken for a
         legacy payment. The purpose is the REQUEST's, so a hotel booking and a
         visit fee are distinguishable on the payment itself. */
      notes: { visitRequestId: String(doc._id), purpose: purposeOf(doc) },
      expiresAt: doc.payment.dueBy ? Math.floor(doc.payment.dueBy.getTime() / 1000) : null,
    });

    doc.payment.linkId = link.id || null;
    doc.payment.linkUrl = link.short_url || null;
    doc.payment.status = 'pending';
    await doc.save();
    return doc.payment.linkUrl;
  } catch (error) {
    console.error('[visit-pay] Could not create the payment link:', error.message);
    return null;
  }
};

/**
 * Mark the visit paid, and start the slot step.
 *
 * One implementation, called by the API verify, the browser callback and the
 * webhook, so a payment made anywhere lands identically. Deliberately narrow:
 * it settles the money, flips the visit to `slot_pending`, and tells the
 * customer what to do next. It releases nothing — the address waits for the
 * slot, and the owner is not told until there is a slot to tell them.
 *
 * The messages are fire-and-forget. The payment has already committed; making
 * a verified rupee depend on WhatsApp or push being reachable would be the
 * wrong way round. A customer whose T2 never arrived is caught by the slot
 * reminder sweep two hours later.
 */
const markVisitPaid = async (doc, paymentId) => {
  if (doc.payment.status === 'paid') return;

  /*
   * The held ₹100 becomes a spent ₹100.
   *
   * Here rather than at request creation, because this is the moment the
   * discount actually cost anything: a student who opened a Razorpay page and
   * closed it has not spent their reward, and burning it there would take it
   * for a booking that never happened.
   *
   * Guarded on `reserved` inside `consume`, so a redelivered webhook — the
   * same redelivery the `status === 'paid'` line above guards the rest of
   * this function against — cannot spend a coupon twice.
   */
  require('../customers/stayCoupon.service')
    .consume(doc._id)
    .catch((error) => {
      console.error('[stay-coupon] payment cleared but the hold was not spent:', error.message);
    });

  doc.payment.status = 'paid';
  doc.payment.paymentId = paymentId ? String(paymentId) : null;
  doc.payment.verifiedAt = new Date();
  doc.payment.failureReason = '';

  /*
   * The entry PIN, for a category that pays for its visit.
   *
   * A free category is minted one the moment the owner confirms
   * (`stayRequest.service.js`), because that tap IS the confirmation. A paid
   * one deliberately is not: at that point nobody has paid, and the reference
   * reads to both sides as a confirmed arrangement. So the mint waits here,
   * which is the equivalent moment — `markVisitPaid` is the ONE funnel a
   * visit or stay payment clears through (the in-app verify, the WebView
   * callback and the webhook all arrive here), so there is one place a PIN
   * comes into existence and it is the same place `payment.status` becomes
   * `paid`.
   *
   * Until now it was minted at neither end: the accept path skipped it
   * because the token was outstanding, the WhatsApp branch skipped it for
   * the same reason, and nothing ever came back for it once the money
   * cleared. So every bachelor booking reached the door with
   * `entryPin: null`, `hasEntryPin: false` on the owner's side, and a
   * check-in screen that asked for no code at all — `checkInBooking` skips
   * its comparison entirely when the booking has no PIN, so a guest could be
   * marked in by anybody holding the owner's phone.
   *
   * Guarded on absence, like the free path's: a redelivered webhook must not
   * hand out a second number, or the two sides end up holding different PINs
   * and neither of them is wrong.
   */
  if (!doc.entryPin) {
    doc.entryPin = generateEntryPin();
    doc.entryPinIssuedAt = new Date();
  }
  /*
   * Only an assisted VISIT has a slot to pick.
   *
   * A stay booking is finished by the payment: the guest chose their dates
   * before the owner ever saw the request, nobody is being sent to meet them,
   * and there is nothing to schedule. Putting it in `slot_pending` would park
   * a paid hotel booking in a queue waiting for a slot it can never need — and
   * the reminder sweep would chase the guest for one two hours later.
   *
   * A slot fixed before the money cannot happen in this flow, but a redelivered
   * webhook after scheduling can — and must not knock a scheduled visit back
   * to the picker.
   */
  if (purposeOf(doc) === ASSISTED_PURPOSE
    && !['scheduled', 'manual'].includes(doc.lamposeVisit.status)) {
    doc.lamposeVisit.status = 'slot_pending';
    doc.lamposeVisit.slotStage = 'none';
  }

  /*
   * A stay booking's address is released BY THE PAYMENT.
   *
   * `addressReleasedAt` is the one gate on the street address, and until now
   * only `confirmSchedule` set it — "the slot is what the ₹199 was for, and
   * the address comes with it". A hotel has no slot, so nothing would ever
   * have set it: a guest who had paid in full for a room would never be told
   * where it is.
   *
   * Paying for the stay is the equivalent moment, and a stronger one. The
   * assisted flow withholds the address until a viewing is actually booked
   * because a ₹199 fee is a smaller commitment than a visit; here the whole
   * stay is paid for and there is no later step to wait for.
   */
  if (purposeOf(doc) === STAY_PURPOSE) {
    doc.addressReleasedAt = doc.addressReleasedAt || new Date();
  }

  await doc.save();

  /*
   * The owner's copy of the PIN.
   *
   * The booking row was written when the owner ACCEPTED — before this
   * payment existed — so `acceptAndBook` copied across the `entryPin` the
   * request had at that moment, which was null. `checkInBooking` compares
   * what the owner types against the BOOKING's own PIN, so without this the
   * code is minted, shown to the student, and still not checkable at the
   * door: `hasEntryPin` stays false and the check-in screen asks for
   * nothing.
   *
   * Guarded on absence so a redelivered webhook cannot replace a PIN already
   * in use, and wrapped because the payment has ALREADY COMMITTED — a PIN
   * that failed to copy is a loud log and a booking an owner can still check
   * in by hand, never a failed payment for a student whose card was charged.
   */
  if (doc.bookingId && doc.entryPin) {
    try {
      const { PartnerBooking } = require('../partners/partnerDomains.model');
      await PartnerBooking.updateOne(
        { _id: doc.bookingId, $or: [{ entryPin: null }, { entryPin: { $exists: false } }] },
        { $set: { entryPin: doc.entryPin } },
      );
    } catch (error) {
      console.error(`[visit-pay] request ${doc._id} paid but its booking kept no entry PIN:`, error.message);
    }
  }

  /*
   * The settlement ledger, for a HOTEL stay only.
   *
   * This is where a captured payment becomes a record of who is owed what:
   * the gross, Lampose's commission, the hotel's share, and a Route transfer
   * holding that share until the guest actually arrives. See
   * `settlements/settlement.service.js` for the state machine.
   *
   * Awaited rather than fired and forgotten, unlike the notifications below —
   * a payment with no ledger row is money in our account that nothing in the
   * system says is owed to anybody, and that must not depend on a promise
   * nobody is watching. But it is wrapped, because the payment has ALREADY
   * COMMITTED: a settlement that could not be written must be a loud log and a
   * row an administrator can repair, never a failed payment for a guest whose
   * card was charged.
   *
   * `createForPaidBooking` is idempotent on `bookingId`, so a redelivered
   * webhook that reaches this twice creates one row.
   */
  if (purposeOf(doc) === STAY_PURPOSE && doc.bookingId) {
    try {
      const { PartnerBooking } = require('../partners/partnerDomains.model');
      const settlements = require('../settlements/settlement.service');
      const booking = await PartnerBooking.findById(doc.bookingId);
      if (booking) {
        await settlements.createForPaidBooking({ request: doc, booking });
      } else {
        console.error(`[settlement] request ${doc._id} paid but booking ${doc.bookingId} is missing.`);
      }
    } catch (error) {
      console.error(`[settlement] request ${doc._id} paid but no ledger row was written:`, error.message);
    }
  }

  if (doc.channel === 'app') {
    /* An app request is answered in the app: the push says "pick your slot"
       and the picker is a screen, not a chat. */
    try {
      const notifier = require('../notifications/stayRequest.notifier');
      notifier.notifyVisitPaid(doc).catch((e) => console.error('[visit-pay] push failed:', e.message));
    } catch (error) {
      console.error('[visit-pay] notifier unavailable:', error.message);
    }
    return;
  }

  /* Web channel: T2, whose quick-reply button opens the session the two list
     pickers ride in. Only where they opted in — WhatsApp will not carry a
     business message to someone who never agreed to hear from us. */
  if (doc.consentWhatsApp && doc.customer?.phone) {
    twilio.sendPaymentReceived({
      customerPhone: doc.customer.phone,
      customerName: doc.customer.name,
      propertyName: doc.propertyName,
    }).then((r) => {
      if (!r?.success) console.error('[visit-pay] Payment-received message failed:', r?.error);
    }).catch((e) => console.error('[visit-pay] Payment-received message threw:', e.message));
  }
};

/**
 * Give the browser or the app an order to open Razorpay's checkout against.
 *
 * Only the key ID goes back. The secret stays here — it is what makes the
 * signature check below mean anything, and a secret in a bundle is not a
 * secret.
 *
 * @route POST /api/v2/visit-requests/:id/payment/order
 */
const createPaymentOrder = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, 'DB_DISCONNECTED', 'The server is not connected to the database.');
    }
    if (!razorpay.isConfigured()) {
      return fail(res, 503, 'PAYMENTS_UNAVAILABLE',
        'Payments are not set up on this server yet. Nothing has been charged.');
    }

    const doc = await load(res, req.params.id);
    if (!doc) return undefined;

    if (!doc.payment?.required) {
      return fail(res, 400, 'NO_PAYMENT_REQUIRED', 'This visit has nothing to pay for.');
    }
    if (doc.status !== 'confirmed') {
      return fail(res, 409, 'NOT_CONFIRMED',
        'The owner has not confirmed this visit yet, so there is nothing to pay for.');
    }
    if (doc.payment.status === 'paid') {
      /* Idempotent: reopening a finished checkout should not create a second
         order, and must not look like an error to a customer who tapped twice. */
      return res.json({ success: true, data: { alreadyPaid: true, payment: doc.payment } });
    }
    if (doc.payment.dueBy && doc.payment.dueBy.getTime() < Date.now()) {
      if (doc.payment.status !== 'expired') {
        doc.payment.status = 'expired';
        await doc.save();
      }
      return fail(res, 410, 'CONFIRMATION_LAPSED',
        'This confirmation has lapsed. Ask the owner again to arrange a visit.');
    }

    /* A stay booking with no amount stamped on it is a broken request, not a
       free room — see `amountFor`. Refused here rather than sent to Razorpay,
       which would reject a null amount with a less useful message. */
    const amountPaise = amountFor(doc);
    if (!amountPaise) {
      return fail(res, 409, 'NO_AMOUNT',
        'We could not work out what this booking costs. Please ask again from the property.');
    }

    const order = await razorpay.createOrder({
      amountPaise,
      /* Our own id, so a payment in their dashboard traces straight back. */
      receipt: String(doc._id),
      notes: {
        visitRequestId: String(doc._id),
        /* The REQUEST's purpose, so a hotel booking and a visit fee are told
           apart on the payment itself rather than by looking it up. */
        purpose: purposeOf(doc),
        property: doc.propertyName || '',
      },
    });

    doc.payment.status = 'pending';
    doc.payment.orderId = order.id;
    doc.payment.amountPaise = amountPaise;
    await doc.save();

    return res.json({
      success: true,
      data: {
        orderId: order.id,
        amountPaise,
        currency: order.currency || 'INR',
        /* Publishable by design — it identifies the account, it does not
           authorise anything. */
        keyId: config.razorpay.keyId,
        propertyName: doc.propertyName,
        customerName: doc.customer?.name || '',
        customerPhone: doc.customer?.phone || '',
      },
    });
  } catch (error) {
    if (error.code === 'RAZORPAY_ORDER_FAILED' || error.code === 'RAZORPAY_NOT_CONFIGURED') {
      return fail(res, 502, error.code, error.message);
    }
    return next(error);
  }
};

/**
 * Check the signature, and only then call it paid.
 *
 * @route POST /api/v2/visit-requests/:id/payment/verify
 */
const verifyPayment = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, 'DB_DISCONNECTED', 'The server is not connected to the database.');
    }

    const doc = await load(res, req.params.id);
    if (!doc) return undefined;

    if (doc.payment?.status === 'paid') {
      return res.json({ success: true, data: { payment: doc.payment, alreadyPaid: true } });
    }
    if (!doc.payment?.required) {
      return fail(res, 400, 'NO_PAYMENT_REQUIRED', 'This visit has nothing to pay for.');
    }

    const { razorpayPaymentId, razorpaySignature } = req.body || {};
    const orderId = doc.payment.orderId;

    if (!orderId) {
      return fail(res, 409, 'NO_ORDER', 'Start the payment before confirming it.');
    }

    const genuine = razorpay.verifySignature({
      orderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!genuine) {
      /* Recorded rather than only refused: a bad signature is either a bug in
         a client or somebody trying, and both are worth being able to see. */
      doc.payment.status = 'failed';
      doc.payment.failureReason = 'signature did not verify';
      await doc.save();
      return fail(res, 400, 'PAYMENT_NOT_VERIFIED',
        'That payment could not be verified. If money left your account it has not been taken — contact support.');
    }

    await markVisitPaid(doc, razorpayPaymentId);

    return res.json({ success: true, data: doc.toPublic() });
  } catch (error) {
    return next(error);
  }
};

/**
 * DEVELOPMENT ONLY — mark this visit's token paid, without a payment.
 *
 * ## What this is, and what it is not
 *
 * It is a bypass so the screens BEHIND the paywall — the slot picker, the
 * address release, the owner's side — can be worked on while the real
 * checkout is unavailable. It is not a payment method: no money is collected,
 * nothing is owed afterwards, and nobody is expected to hand anything over.
 * A row settled this way represents a waived token, not a received one.
 *
 * ## The fences
 *
 * Everything else in this file obeys one rule: a request is paid only when an
 * HMAC over `orderId|paymentId` verified against a secret only this server
 * holds. This settles a visit on nothing but a tap, so it is fenced four ways:
 *
 *   · `config.razorpay.devAllowMarkPaid` is false unless DEV_ALLOW_MARK_PAID
 *     is explicitly `true`;
 *   · env.js refuses that flag outright when NODE_ENV=production, so this
 *     cannot be switched on where it would matter;
 *   · off, this answers 404 rather than 403 — a disabled bypass should not
 *     advertise that it exists;
 *   · what it writes is DISTINGUISHABLE. `payment.mode: 'dev'` with a null
 *     `orderId` and `paymentId` marks every bypassed row, so
 *     `{'payment.mode': 'dev'}` lists them all and none can be mistaken for
 *     revenue. A bypass indistinguishable from a real payment would be the
 *     genuinely dangerous version of this.
 *
 * ## Why it goes through `markVisitPaid` anyway
 *
 * Because the point is to exercise the REST of the flow. The slot step, the
 * address release, the notifications and the owner's view must behave exactly
 * as they will when the money is real; a second implementation of "what
 * happens next" would be the one that drifts and would test nothing.
 *
 * Remove: this function, its route, the `mode`/`devMarkPaidAllowed` fields,
 * the app's button, and the environment variable.
 *
 * @route POST /api/v2/visit-requests/:id/payment/dev-mark-paid
 */
const devMarkPaid = async (req, res, next) => {
  try {
    if (!config.razorpay.devAllowMarkPaid) {
      return fail(res, 404, 'NOT_FOUND', 'That route does not exist on this server.');
    }
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, 'DB_DISCONNECTED', 'The server is not connected to the database.');
    }

    const doc = await load(res, req.params.id);
    if (!doc) return undefined;

    /* The same preconditions the online path enforces, in the same order, so
       the bypass cannot reach a state a real payment could not. */
    if (!doc.payment?.required) {
      return fail(res, 400, 'NO_PAYMENT_REQUIRED', 'This visit has nothing to pay for.');
    }
    if (doc.status !== 'confirmed') {
      return fail(res, 409, 'NOT_CONFIRMED',
        'The owner has not confirmed this visit yet, so there is nothing to pay for.');
    }
    if (doc.payment.status === 'paid') {
      return res.json({ success: true, data: doc.toPublic() });
    }
    if (doc.payment.dueBy && doc.payment.dueBy.getTime() < Date.now()) {
      if (doc.payment.status !== 'expired') {
        doc.payment.status = 'expired';
        await doc.save();
      }
      return fail(res, 410, 'CONFIRMATION_LAPSED',
        'This confirmation has lapsed. Ask the owner again to arrange a visit.');
    }

    /* Stamped BEFORE `markVisitPaid`, which saves — so the mode lands in the
       same write that settles it and there is never an instant where a row
       reads as an online payment with no payment id. */
    doc.payment.mode = 'dev';
    doc.payment.orderId = null;
    doc.payment.paymentId = null;

    console.warn(
      `🛠️  [DEV BYPASS] request ${doc._id} marked paid WITHOUT a payment `
      + '(DEV_ALLOW_MARK_PAID is on). No money was collected.',
    );

    await markVisitPaid(doc, null);

    return res.json({ success: true, data: doc.toPublic() });
  } catch (error) {
    return next(error);
  }
};

/*
 * The redirect a checkout page may bounce to.
 *
 * Prefix-checked AND charset-checked. The prefix keeps it ours; the charset
 * is what stops a crafted `redirect` breaking out of the meta-refresh
 * attribute it is interpolated into — `"` and `>` are simply not in the set.
 */
const SAFE_REDIRECT = /^lampose:\/\/[A-Za-z0-9\-._~/?=&:%]*$/;
const safeRedirect = (raw) =>
  (SAFE_REDIRECT.test(String(raw || '')) ? String(raw) : 'lampose://visit');

/**
 * A checkout page the mobile app renders in its own WebView.
 *
 * ## Why a server-rendered page rather than a native SDK
 *
 * Razorpay's React Native SDK needs a native module, which needs a prebuild
 * and a config plugin, on both platforms, for one screen. This route renders
 * the same checkout the website uses, verifies the result HERE where the
 * secret already lives, and hands control back through the app's own deep
 * link. The app never sees the payment id or the signature.
 *
 * @route GET /api/v2/visit-requests/:id/payment/checkout
 */
const renderCheckout = async (req, res, next) => {
  try {
    if (!razorpay.isConfigured()) {
      return res.status(503).type('html').send(page('Payments are not set up yet',
        'Nothing has been charged. Please try again later.'));
    }

    const doc = await VisitRequest.findById(req.params.id).catch(() => null);
    if (!doc || !doc.payment?.required) {
      return res.status(404).type('html').send(page('That request no longer exists', ''));
    }
    if (doc.status !== 'confirmed') {
      return res.status(409).type('html').send(page('Not confirmed yet',
        'The owner has not confirmed this visit, so there is nothing to pay for.'));
    }
    /* The same deadline the JSON route enforces. The two paths refusing
       different things is how somebody pays for a hold that ended. */
    if (doc.payment.dueBy && doc.payment.dueBy.getTime() < Date.now()) {
      if (doc.payment.status !== 'expired') {
        doc.payment.status = 'expired';
        await doc.save();
      }
      return res.status(410).type('html').send(page('This confirmation has lapsed',
        'The owner held the place for a while and nothing was arranged. Ask again and they can confirm a fresh visit.'));
    }

    const redirect = safeRedirect(req.query.redirect);

    if (doc.payment.status === 'paid') {
      return res.type('html').send(bounce(redirect, 'paid'));
    }
    /* Same guard as the JSON path above: no amount is a broken request, and
       Razorpay's own refusal would surface here as a blank page. */
    const pageAmount = amountFor(doc);
    if (!pageAmount) {
      return res.type('html').send(bounce(redirect, 'failed'));
    }

    const order = await razorpay.createOrder({
      amountPaise: pageAmount,
      receipt: String(doc._id),
      notes: { visitRequestId: String(doc._id), purpose: purposeOf(doc) },
    });
    doc.payment.status = 'pending';
    doc.payment.orderId = order.id;
    await doc.save();

    const opts = {
      key: config.razorpay.keyId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Lampose',
      description: `Assisted visit · ${doc.propertyName || ''}`.trim(),
      prefill: { name: doc.customer?.name || '', contact: doc.customer?.phone || '' },
      theme: { color: '#45855a' },
    };

    /* The handler POSTs back to this server, which verifies and only then
       bounces to the app. The browser is a courier, not an authority. */
    return res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lampose · Assisted visit</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7f9f7;color:#14201a}p{color:#46564d}</style>
</head><body>
<div><p>Opening the payment window…</p></div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var opts = ${JSON.stringify(opts)};
  opts.handler = function (r) {
    var f = document.createElement('form');
    f.method = 'POST';
    f.action = ${JSON.stringify(`/api/v2/visit-requests/${doc._id}/payment/callback`)};
    [['razorpayPaymentId', r.razorpay_payment_id],
     ['razorpaySignature', r.razorpay_signature],
     ['redirect', ${JSON.stringify(redirect)}]].forEach(function (kv) {
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = kv[0]; i.value = kv[1];
      f.appendChild(i);
    });
    document.body.appendChild(f); f.submit();
  };
  opts.modal = { ondismiss: function () { window.location = ${JSON.stringify(`${redirect}?paid=0`)}; } };

  var rzp = new Razorpay(opts);

  /*
   * Razorpay FAILING and Razorpay never opening were indistinguishable from
   * outside until this existed. Reported with \`keepalive\` so it still
   * leaves if the page is navigating, and wrapped so that reporting a
   * failure can never itself break the retry the customer is about to make.
   */
  rzp.on('payment.failed', function (e) {
    var err = (e && e.error) || {};
    try {
      var f = new FormData();
      f.append('code', err.code || '');
      f.append('description', err.description || '');
      f.append('reason', err.reason || '');
      f.append('step', err.step || '');
      f.append('source', err.source || '');
      f.append('paymentId', (err.metadata && err.metadata.payment_id) || '');
      fetch(${JSON.stringify(`/api/v2/visit-requests/${doc._id}/payment/failed`)}, {
        method: 'POST', body: f, keepalive: true,
      });
    } catch (ignored) { /* Never block the retry. */ }
  });

  rzp.open();
</script>
</body></html>`);
  } catch (error) {
    return next(error);
  }
};

/**
 * Where the rendered checkout posts its result. Same verification as the API
 * route — one implementation, so a browser flow and an app flow cannot end up
 * trusting different things.
 *
 * @route POST /api/v2/visit-requests/:id/payment/callback
 */
const paymentCallback = async (req, res, next) => {
  try {
    const doc = await VisitRequest.findById(req.params.id).catch(() => null);
    const redirect = safeRedirect(req.body?.redirect);

    if (!doc || !doc.payment?.orderId) {
      return res.type('html').send(bounce(redirect, 'error'));
    }

    const genuine = razorpay.verifySignature({
      orderId: doc.payment.orderId,
      paymentId: req.body?.razorpayPaymentId,
      signature: req.body?.razorpaySignature,
    });

    if (!genuine) {
      doc.payment.status = 'failed';
      doc.payment.failureReason = 'signature did not verify';
      await doc.save();
      return res.type('html').send(bounce(redirect, 'unverified'));
    }

    await markVisitPaid(doc, req.body.razorpayPaymentId);

    return res.type('html').send(bounce(redirect, 'paid'));
  } catch (error) {
    return next(error);
  }
};

/** A bare page that hands control back to the app. The redirect has already
    been through `safeRedirect`, whose charset admits nothing that can close
    an attribute or a tag. */
const bounce = (redirect, outcome) => `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${redirect}?paid=${outcome === 'paid' ? '1' : '0'}&outcome=${outcome}">
<title>Returning to Lampose</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0">
<p>Returning to the app…</p>
<script>window.location = ${JSON.stringify(`${redirect}?paid=`)} + ${outcome === 'paid' ? "'1'" : "'0'"} + '&outcome=${outcome}';</script>
</body></html>`;

const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:2rem">
<div><h1 style="font-size:1.1rem">${title}</h1><p style="color:#46564d">${body}</p></div>
</body></html>`;

/**
 * What Razorpay said when it refused.
 *
 * Records only — it never marks anything paid, and it deliberately does not
 * end the request: a declined card is a reason to try another one, and the
 * checkout stays open behind this call. `payment.status` stays `pending`: the
 * order is still open and a retry on the same order is exactly what the
 * customer is being offered.
 *
 * @route POST /api/v2/visit-requests/:id/payment/failed
 */
const recordPaymentFailure = async (req, res, next) => {
  try {
    const doc = await VisitRequest.findById(req.params.id).catch(() => null);
    /* 204 either way. This is telemetry from a page that is mid-retry; an
       error status here would surface in the checkout as a failed fetch and
       tell the customer about a problem that is not theirs. */
    if (!doc || !doc.payment?.required) return res.status(204).end();

    const trim = (value) => String(value || '').slice(0, 200);
    const detail = [
      trim(req.body?.code),
      trim(req.body?.step),
      trim(req.body?.source),
      trim(req.body?.reason),
      trim(req.body?.description),
    ].filter(Boolean).join(' · ');

    doc.payment.failureReason = detail || 'razorpay declined, no reason given';
    if (req.body?.paymentId) doc.payment.paymentId = trim(req.body.paymentId);
    await doc.save();

    console.warn(`💳 [payment failed] request ${doc._id} — ${doc.payment.failureReason}`);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createPaymentOrder, verifyPayment, needsToken,
  ensurePaymentLink, markVisitPaid, devMarkPaid,
  renderCheckout, paymentCallback, recordPaymentFailure,
  ASSISTED_PURPOSE,
};
