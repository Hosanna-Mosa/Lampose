/* ═══════════════════════════════════════════════════════════════════════════
   What a confirmed customer is offered next, and there are two of them.

   The owner has replied AVAILABLE. From here the customer picks how they
   actually get to see the room, and this file owns both options:

     Direct Access     ₹99    the owner's number and a map pin, go alone
     Assisted Visit    ₹199   pick a date and time; a Lampose representative
                              meets them there and walks them round

   ## They are separate purchases, and that is the whole design

   Neither includes the other. Paying for an assisted visit does NOT release
   the owner's number — the agent handles the owner, so the customer never
   needs it — and paying for Direct Access books nobody's time. A customer
   who wants both buys both.

   ## Three payments, one request

   `visitPayment.controller.js` charges a ₹20 visit token as well, and that
   flow is untouched by this file. So ONE confirmed request can carry three
   independent Razorpay orders, all of them carrying the same
   `visitRequestId` home. Everything below is written so they can never be
   mistaken for one another:

     · each order carries a `purpose` note — `contact_unlock` or
       `assisted_visit`. `razorpayWebhook.controller.js` dispatches on it, and
       an ABSENT purpose means the visit token, which is what every payment
       made before these existed looks like. Old events keep their meaning.
     · each has its own receipt — `unlock_<id>`, `assist_<id>`, and the bare
       `<id>` for the token. Razorpay folds a repeated receipt into the order
       it already made, so a shared one would hand a checkout the wrong order
       and the wrong amount.

   ## What may mark any of them paid

   The same single thing: `razorpay.verifySignature`, an HMAC over
   `order_id|payment_id` keyed with a secret no browser holds. A client saying
   it paid is not evidence and is never treated as any.
   ═══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const razorpay = require('../../infrastructure/razorpay/razorpay');
const VisitRequest = require('./visitRequest.model');
const { readListingContact } = require('./visitAddress.util');
const { isISODate } = require('../listings/stayIntent.util');
const twilio = require('../../infrastructure/twilio/twilio');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/* The note that tells this order's money apart from the token's. Read by the
   webhook; changing the string here without changing it there silently sends
   ₹99 payments down the token path. */
const UNLOCK_PURPOSE = 'contact_unlock';

/* And the note for the assisted visit's money. Three payments can be open
   against one request; these two strings plus their absence are how the
   webhook tells all three apart. */
const ASSISTED_PURPOSE = 'assisted_visit';

/* The second half of the assisted visit, taken when the room is confirmed.
   Its own purpose because it is its own order: without this, a paid balance
   would be read as a paid advance and re-book a visit that already exists. */
const ASSISTED_BALANCE_PURPOSE = 'assisted_balance';

/* When an agent can actually be somewhere. A time picker with no floor and no
   ceiling accepts 03:00, and the first anybody hears of it is a customer
   waiting outside a building at three in the morning. Half-open at the top:
   20:00 is the last slot that can be offered. */
const VISIT_HOURS = { from: 8, to: 20 };

/* How far ahead a Lampose visit can be booked. Same shape of reasoning as the
   joining-date window — a date two years out is a typo, not a plan. */
const MAX_DAYS_AHEAD = 30;

const fail = (res, status, code, message) =>
  res.status(status).json({ success: false, code, message, error: message });

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
 * The gate both handlers share.
 *
 * Confirmed, and a category that pays for visits. The second test is what
 * scopes this to bachelor and co-live without naming them: `payment.required`
 * was decided from the category when the request was made and frozen there,
 * so this reads the same answer the rest of the flow reads rather than
 * re-deriving it from a listing that may since have been edited.
 *
 * Returns true when it has already answered `res`.
 */
const notOffered = (res, doc) => {
  if (!doc.payment?.required) {
    fail(res, 400, 'NOT_APPLICABLE', 'This visit does not use the Lampose visit options.');
    return true;
  }
  if (doc.status !== 'confirmed') {
    fail(res, 409, 'NOT_CONFIRMED', 'The owner has not confirmed this visit yet.');
    return true;
  }

  /*
   * A confirmation that has lapsed buys nothing.
   *
   * The owner held a layout for a window and it closed. `status` is still
   * `confirmed` — the owner did say yes, and rewriting that would tell them
   * they never answered — so the deadline is what has to be read, exactly as
   * `createPaymentOrder` reads it.
   *
   * `dueBy` rather than `payment.status`: the token's status is only moved to
   * `expired` lazily, when somebody next tries to pay it, so a request can sit
   * for days past its deadline still reading `pending`. Charging ₹99 for the
   * number of an owner whose hold ran out last Tuesday is the mistake worth
   * spending four lines to avoid.
   */
  if (doc.payment.dueBy && doc.payment.dueBy.getTime() < Date.now()) {
    fail(res, 410, 'CONFIRMATION_LAPSED',
      'This confirmation has lapsed. Ask the owner again to arrange a visit.');
    return true;
  }
  return false;
};

/** Today, in the same `YYYY-MM-DD` shape the picker submits. */
const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const addDaysISO = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * The date, the time and the note, checked.
 *
 * Returns null when it has already answered `res`. Pulled out of the handler
 * because the slot is validated where the order is created and read again
 * where it is paid for, and two copies of "is 03:00 a sensible time to send
 * somebody" is one copy too many.
 */
const readSlot = (res, body) => {
  const date = String(body?.date || '').trim();
  const time = String(body?.time || '').trim();
  const note = String(body?.note || '').trim().slice(0, 300);

  if (!isISODate(date)) {
    fail(res, 400, 'BAD_DATE', 'Pick a date for the visit.');
    return null;
  }

  const min = todayISO();
  const max = addDaysISO(min, MAX_DAYS_AHEAD);
  if (date < min) {
    fail(res, 400, 'DATE_IN_PAST', 'Pick a date from today onwards.');
    return null;
  }
  if (date > max) {
    fail(res, 400, 'DATE_TOO_FAR', `Pick a date within the next ${MAX_DAYS_AHEAD} days.`);
    return null;
  }

  const clock = time.match(/^(\d{2}):(\d{2})$/);
  if (!clock) {
    fail(res, 400, 'BAD_TIME', 'Pick a time for the visit.');
    return null;
  }
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  if (hour < VISIT_HOURS.from || hour > VISIT_HOURS.to || minute > 59
    || (hour === VISIT_HOURS.to && minute > 0)) {
    fail(res, 400, 'TIME_OUT_OF_HOURS',
      `Visits are arranged between ${VISIT_HOURS.from}:00 and ${VISIT_HOURS.to}:00.`);
    return null;
  }

  return { date, time, note };
};

/**
 * What is taken now and what is left owing.
 *
 * One place, because three numbers that must add up should never be written
 * down twice. The advance is clamped to the total so a misconfigured
 * `VISIT_ASSISTED_ADVANCE_PAISE` charges everything up front and owes nothing
 * rather than producing a negative balance.
 *
 * Reads the snapshot on the document when there is one, so a booking made
 * before a reprice keeps the halves it was actually sold.
 */
const assistedSplit = (doc) => {
  const total = doc?.lamposeVisit?.amountPaise
    || config.razorpay.assistedVisitAmountPaise;
  const advance = doc?.lamposeVisit?.advancePaise
    || Math.min(config.razorpay.assistedAdvancePaise, total);
  return { total, advance, balance: Math.max(0, total - advance) };
};

/* ── The ₹99 unlock ───────────────────────────────────────────────────────── */

/**
 * Mark the unlock paid.
 *
 * One implementation, called by both the in-page verification and the
 * webhook, so a payment made on the page and one made on a phone release
 * exactly the same thing.
 *
 * Deliberately narrow: it sets four fields and saves. It does not touch
 * `payment`, `addressReleasedAt` or the bed pool — those belong to the visit
 * token, and a ₹99 unlock must not move them.
 */
const markContactUnlocked = async (doc, paymentId) => {
  doc.contactUnlock.status = 'paid';
  doc.contactUnlock.paymentId = paymentId ? String(paymentId) : null;
  doc.contactUnlock.verifiedAt = new Date();
  doc.contactUnlock.failureReason = '';
  await doc.save();
  return doc;
};

/**
 * Open a ₹99 checkout.
 *
 * @route POST /api/v2/visit-requests/:id/unlock/order
 */
const createUnlockOrder = async (req, res, next) => {
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
    if (notOffered(res, doc)) return undefined;

    if (doc.contactUnlock?.status === 'paid') {
      /* Idempotent, and it answers with the contact rather than an empty
         success: somebody who taps Pay again on a paid unlock wants the
         number, not a second charge. */
      const contact = await readListingContact(doc.listingId);
      return res.json({ success: true, data: { alreadyPaid: true, contact } });
    }

    const amountPaise = doc.contactUnlock?.amountPaise
      || config.razorpay.contactUnlockAmountPaise;

    const order = await razorpay.createOrder({
      amountPaise,
      /* NOT the bare id — see the header. The token's order already uses that
         receipt, and Razorpay would hand back the token's ₹20 order. */
      receipt: `unlock_${doc._id}`,
      notes: {
        visitRequestId: String(doc._id),
        /* The whole of how the webhook tells the two orders apart. */
        purpose: UNLOCK_PURPOSE,
        property: doc.propertyName || '',
      },
    });

    doc.contactUnlock.status = 'pending';
    doc.contactUnlock.orderId = order.id;
    doc.contactUnlock.amountPaise = amountPaise;
    await doc.save();

    return res.json({
      success: true,
      data: {
        orderId: order.id,
        amountPaise,
        currency: order.currency || 'INR',
        /* Publishable by design — it names the account, it authorises
           nothing. */
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
 * Check the signature, and only then hand over the number.
 *
 * @route POST /api/v2/visit-requests/:id/unlock/verify
 */
const verifyUnlockPayment = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, 'DB_DISCONNECTED', 'The server is not connected to the database.');
    }

    const doc = await load(res, req.params.id);
    if (!doc) return undefined;

    if (doc.contactUnlock?.status === 'paid') {
      const contact = await readListingContact(doc.listingId);
      return res.json({ success: true, data: { alreadyPaid: true, contact } });
    }

    const { razorpayPaymentId, razorpaySignature } = req.body || {};
    const orderId = doc.contactUnlock?.orderId;

    if (!orderId) {
      return fail(res, 409, 'NO_ORDER', 'Start the payment before confirming it.');
    }

    const genuine = razorpay.verifySignature({
      orderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!genuine) {
      /* Recorded, not thrown away: a run of these on one request is what a
         forged callback looks like. The status stays payable so an honest
         customer whose network dropped can try again. */
      doc.contactUnlock.failureReason = 'Signature did not verify.';
      await doc.save();
      return fail(res, 400, 'PAYMENT_NOT_VERIFIED',
        'That payment could not be verified. If money has left your account, contact Lampose and we will sort it out.');
    }

    await markContactUnlocked(doc, razorpayPaymentId);
    const contact = await readListingContact(doc.listingId);

    return res.json({ success: true, data: { paid: true, contact } });
  } catch (error) {
    return next(error);
  }
};

/* ── The assisted visit ───────────────────────────────────────────────────
   A Lampose representative meets the customer at the property and walks them
   round. Paid, and its own money: it books a person's time and releases
   NOTHING — not the address, not the owner's number, not a bed. A customer
   who wants the owner's number as well buys the contact unlock separately.
   ─────────────────────────────────────────────────────────────────────── */

/**
 * Validate the slot, hold it, and open a checkout for it.
 *
 * The slot is written before the order so that a customer who pays and then
 * loses their connection still has the date and time recorded against the
 * request — the webhook can then turn it into a booking with no help from
 * the browser. `pending_payment` is what that half-finished state is called,
 * and nobody is told about it.
 *
 * @route POST /api/v2/visit-requests/:id/assisted/order
 */
const createAssistedOrder = async (req, res, next) => {
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
    if (notOffered(res, doc)) return undefined;

    const slot = readSlot(res, req.body);
    if (!slot) return undefined;

    /*
     * The balance has to be agreed to, explicitly, before anything is taken.
     *
     * Only when there IS one: a deployment that charges the whole fee up
     * front owes nothing, and asking somebody to tick a box promising to pay
     * zero would be asking them to agree to nonsense.
     */
    const { balance: owing } = assistedSplit(doc);
    if (owing > 0 && req.body?.balanceConsent !== true) {
      return fail(res, 400, 'BALANCE_NOT_ACCEPTED',
        'Please accept the amount due on confirmation before paying the advance.');
    }

    if (doc.lamposeVisit?.status === 'requested') {
      /* Already booked and paid for. Changing the time is a conversation with
         the agent who has it in their day, not a second ₹199. */
      return res.json({
        success: true,
        data: { alreadyBooked: true, lamposeVisit: doc.toPublic().lamposeVisit },
      });
    }

    const { total, advance } = assistedSplit(doc);

    /* ONLY the advance. The balance is not owed until the visit is booked and
       the room confirmed, and taking it here would be charging for something
       that has not happened. */
    const order = await razorpay.createOrder({
      amountPaise: advance,
      /* Its own receipt, like the unlock's. Razorpay folds a repeated receipt
         into the order it already made, so sharing one with either of the
         other two payments would hand this checkout the wrong order. */
      receipt: `assist_${doc._id}`,
      notes: {
        visitRequestId: String(doc._id),
        purpose: ASSISTED_PURPOSE,
        property: doc.propertyName || '',
      },
    });

    doc.lamposeVisit.status = 'pending_payment';
    doc.lamposeVisit.date = slot.date;
    doc.lamposeVisit.time = slot.time;
    doc.lamposeVisit.note = slot.note;
    doc.lamposeVisit.orderId = order.id;
    /* Both halves snapshotted together, so a later reprice cannot leave a
       booking whose advance and balance no longer add up to its total. */
    doc.lamposeVisit.amountPaise = total;
    doc.lamposeVisit.advancePaise = advance;
    if (owing > 0) {
      doc.lamposeVisit.balanceConsent = true;
      doc.lamposeVisit.balanceConsentAt = new Date();
    }
    /* Cleared with every new attempt, so a tick left over from an earlier
       booking cannot make an unpaid slot look confirmed. */
    doc.lamposeVisit.teamNotifiedAt = null;
    await doc.save();

    return res.json({
      success: true,
      data: {
        orderId: order.id,
        /* The figure Razorpay will actually charge — the advance, not the
           total. A checkout opened with the total would take the whole fee
           now, which is the one thing this split exists to avoid. */
        amountPaise: advance,
        totalPaise: total,
        balancePaise: owing,
        currency: order.currency || 'INR',
        keyId: config.razorpay.keyId,
        propertyName: doc.propertyName,
        customerName: doc.customer?.name || '',
        customerPhone: doc.customer?.phone || '',
        date: slot.date,
        time: slot.time,
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
 * Turn a verified payment into a booking, and tell the roster.
 *
 * One implementation for the in-page callback and the webhook, so a payment
 * made on the page and one made anywhere else produce the same booking and
 * the same message.
 *
 * ## Why a failed WhatsApp still leaves the booking standing
 *
 * The money has already changed hands. Meta only carries a free-form message
 * inside a 24-hour session, so a quiet roster can refuse one through no fault
 * of the customer — and voiding a paid booking because our own notification
 * bounced would be exactly the wrong way round. `teamNotifiedAt` stays null,
 * the page says so plainly, and somebody can chase it.
 */
const markAssistedBooked = async (doc, paymentId) => {
  doc.lamposeVisit.status = 'requested';
  doc.lamposeVisit.paymentId = paymentId ? String(paymentId) : null;
  doc.lamposeVisit.verifiedAt = new Date();
  doc.lamposeVisit.requestedAt = new Date();
  doc.lamposeVisit.failureReason = '';

  /* The balance becomes owed HERE and not before: there is nothing to owe on
     a visit that was never booked. An already-paid balance is left alone, so
     a webhook redelivery cannot reopen one that is settled. */
  const { balance } = assistedSplit(doc);
  if (balance > 0 && doc.lamposeVisit.balance?.status !== 'paid') {
    doc.lamposeVisit.balance.status = 'due';
    doc.lamposeVisit.balance.amountPaise = balance;
  }
  await doc.save();

  const roster = String(process.env.VERIFICATION_TEAM_NUMBERS || '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean);

  const body = '🏠 Assisted visit booked (paid)\n\n'
    + `Property: ${doc.propertyName || 'Unnamed'}\n`
    + (doc.sharing?.label ? `Room: ${doc.sharing.label}\n` : '')
    + `When: ${doc.lamposeVisit.date} at ${doc.lamposeVisit.time}\n\n`
    + `Customer: ${doc.customer?.name || 'Not given'}\n`
    + `Phone: ${doc.customer?.phone || 'Not given'}\n`
    + (doc.lamposeVisit.note ? `Note: ${doc.lamposeVisit.note}\n` : '')
    + `\nPaid now: ₹${((doc.lamposeVisit.advancePaise || 0) / 100).toLocaleString('en-IN')}`
    + (doc.lamposeVisit.balance?.status === 'due'
      ? ` · ₹${((doc.lamposeVisit.balance.amountPaise || 0) / 100).toLocaleString('en-IN')} due on confirmation`
      : '')
    + `\nRequest: ${doc._id}`;

  let notified = false;
  if (!roster.length) {
    console.warn('[assisted-visit] No VERIFICATION_TEAM_NUMBERS configured; nobody was told.');
  } else {
    /* All of them, and one that refuses does not stop the next. */
    const sent = await Promise.all(roster.map(async (number) => {
      const result = await twilio.sendOwnerText({ ownerMobile: number, body });
      if (!result?.success) {
        console.warn(`[assisted-visit] Could not reach ${twilio.maskPhone(number)}: ${result?.error}`);
      }
      return result?.success === true;
    }));
    notified = sent.some(Boolean);
  }

  if (notified) {
    doc.lamposeVisit.teamNotifiedAt = new Date();
    await doc.save();
  }

  return notified;
};

/**
 * Check the signature, and only then call an agent's morning spoken for.
 *
 * @route POST /api/v2/visit-requests/:id/assisted/verify
 */
const verifyAssistedPayment = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, 'DB_DISCONNECTED', 'The server is not connected to the database.');
    }

    const doc = await load(res, req.params.id);
    if (!doc) return undefined;

    if (doc.lamposeVisit?.status === 'requested') {
      return res.json({
        success: true,
        data: { alreadyBooked: true, lamposeVisit: doc.toPublic().lamposeVisit },
      });
    }

    const { razorpayPaymentId, razorpaySignature } = req.body || {};
    const orderId = doc.lamposeVisit?.orderId;

    if (!orderId) {
      return fail(res, 409, 'NO_ORDER', 'Pick a date and time before paying.');
    }

    const genuine = razorpay.verifySignature({
      orderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!genuine) {
      /* Recorded, not thrown away: a run of these on one request is what a
         forged callback looks like. The slot stays payable so an honest
         customer whose network dropped can try again. */
      doc.lamposeVisit.failureReason = 'Signature did not verify.';
      await doc.save();
      return fail(res, 400, 'PAYMENT_NOT_VERIFIED',
        'That payment could not be verified. If money has left your account, contact Lampose and we will sort it out.');
    }

    const notified = await markAssistedBooked(doc, razorpayPaymentId);

    return res.json({
      success: true,
      data: { ...doc.toPublic().lamposeVisit, teamNotified: notified },
    });
  } catch (error) {
    return next(error);
  }
};


/* ── The balance ──────────────────────────────────────────────────────────
   The other half of the assisted visit, taken when the room is confirmed.
   The customer agreed to it when they paid the advance — `balanceConsent` on
   the document is the record of that — and this is where it is collected.
   ─────────────────────────────────────────────────────────────────────── */

/**
 * Mark the balance paid. Shared by the in-page callback and the webhook.
 *
 * Deliberately narrow: it settles the balance and nothing else. It does not
 * re-book the visit, re-notify the roster, or touch the token or the unlock.
 */
const markBalancePaid = async (doc, paymentId) => {
  doc.lamposeVisit.balance.status = 'paid';
  doc.lamposeVisit.balance.paymentId = paymentId ? String(paymentId) : null;
  doc.lamposeVisit.balance.verifiedAt = new Date();
  doc.lamposeVisit.balance.failureReason = '';
  await doc.save();
  return doc;
};

/**
 * Open a checkout for the outstanding half.
 *
 * @route POST /api/v2/visit-requests/:id/assisted/balance/order
 */
const createBalanceOrder = async (req, res, next) => {
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

    /* No `notOffered` here, and that is deliberate. This is a debt on a visit
       already booked and paid into; a confirmation window closing afterwards
       does not cancel what is owed, and refusing to let somebody settle it
       would strand them. */
    if (doc.lamposeVisit?.status !== 'requested') {
      return fail(res, 409, 'NO_ASSISTED_VISIT',
        'There is no booked assisted visit on this request.');
    }
    if (doc.lamposeVisit.balance?.status === 'paid') {
      return res.json({
        success: true,
        data: { alreadyPaid: true, lamposeVisit: doc.toPublic().lamposeVisit },
      });
    }
    if (doc.lamposeVisit.balance?.status !== 'due') {
      return fail(res, 400, 'NOTHING_DUE', 'There is nothing outstanding on this visit.');
    }

    const amountPaise = doc.lamposeVisit.balance.amountPaise || assistedSplit(doc).balance;
    if (amountPaise <= 0) {
      return fail(res, 400, 'NOTHING_DUE', 'There is nothing outstanding on this visit.');
    }

    const order = await razorpay.createOrder({
      amountPaise,
      /* A fourth distinct receipt. Sharing the advance's would hand this
         checkout the advance's order — and its amount. */
      receipt: `assistbal_${doc._id}`,
      notes: {
        visitRequestId: String(doc._id),
        purpose: ASSISTED_BALANCE_PURPOSE,
        property: doc.propertyName || '',
      },
    });

    doc.lamposeVisit.balance.orderId = order.id;
    doc.lamposeVisit.balance.amountPaise = amountPaise;
    await doc.save();

    return res.json({
      success: true,
      data: {
        orderId: order.id,
        amountPaise,
        currency: order.currency || 'INR',
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
 * Check the signature, and only then call the balance settled.
 *
 * @route POST /api/v2/visit-requests/:id/assisted/balance/verify
 */
const verifyBalancePayment = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, 'DB_DISCONNECTED', 'The server is not connected to the database.');
    }

    const doc = await load(res, req.params.id);
    if (!doc) return undefined;

    if (doc.lamposeVisit?.balance?.status === 'paid') {
      return res.json({
        success: true,
        data: { alreadyPaid: true, lamposeVisit: doc.toPublic().lamposeVisit },
      });
    }

    const { razorpayPaymentId, razorpaySignature } = req.body || {};
    const orderId = doc.lamposeVisit?.balance?.orderId;

    if (!orderId) {
      return fail(res, 409, 'NO_ORDER', 'Start the payment before confirming it.');
    }

    const genuine = razorpay.verifySignature({
      orderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!genuine) {
      doc.lamposeVisit.balance.failureReason = 'Signature did not verify.';
      await doc.save();
      return fail(res, 400, 'PAYMENT_NOT_VERIFIED',
        'That payment could not be verified. If money has left your account, contact Lampose and we will sort it out.');
    }

    await markBalancePaid(doc, razorpayPaymentId);

    return res.json({ success: true, data: doc.toPublic().lamposeVisit });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createUnlockOrder,
  verifyUnlockPayment,
  markContactUnlocked,
  createAssistedOrder,
  verifyAssistedPayment,
  markAssistedBooked,
  createBalanceOrder,
  verifyBalancePayment,
  markBalancePaid,
  UNLOCK_PURPOSE,
  ASSISTED_PURPOSE,
  ASSISTED_BALANCE_PURPOSE,
  VISIT_HOURS,
};
