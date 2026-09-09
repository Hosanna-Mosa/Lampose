const mongoose = require('mongoose');
const config = require('../../config/env');
const { CATEGORIES } = require('../../shared/constants/categories');
const Partner = require('./partner.model');
const {
  PartnerBooking,
  PartnerPayout,
  PartnerPaymentMethod,
  PartnerComplaint,
  PartnerNotification,
  PartnerStaff,
  PartnerReview,
  PartnerReferral,
  PartnerShareType,
} = require('./partnerDomains.model');
const { withStage } = require('./bookingStage.util');

/**
 * A booking as the OWNER'S app may see it.
 *
 * `entryPin` is removed and replaced with `hasEntryPin`. The owner's screen
 * needs to know whether to ask for a code — a walk-in has none — but never
 * needs the code itself: the server checks it (`checkInBooking`). Sending it
 * down was what made the check theatre.
 */
const forOwner = (booking, now = new Date()) => {
  if (!booking) return booking;
  const { entryPin, ...rest } = booking;
  const { withStage } = require('./bookingStage.util');
  return { ...withStage(rest, now), hasEntryPin: Boolean(entryPin) };
};


const { phoneKey } = Partner;

const {
  releaseBed, shareTypeIdForBooking, OCCUPYING,
} = require('../inventory/inventory.service');
const payoutService = require('./payout.service');
const {
  notifyStudentBookingCancelled, notifyStudentCheckedIn, notifyStudentCheckedOut,
} = require('../notifications/stayRequest.notifier');

/* ══════════════════════════════════════════════════════════════════════════
   Freeing a bed.

   Two of the three ways `availableBeds` goes back up live here — a booking
   cancelled and a tenant checked out. (The third is the accept handler giving
   back a bed it took for a request it then lost.) Without these the counter
   only ever falls, and every property drifts to zero and stops being
   requestable.

   ## Both had to become guarded updates first

   They were `findOneAndUpdate({ _id, partner }, { status })` with no status
   filter, which was harmless while nothing depended on the transition. It is
   not harmless now: a cancel tapped twice would match twice and hand back two
   beds for one departure, inventing a bed the building does not have. The
   filter on `status: { $in: OCCUPYING }` is what makes the release happen
   exactly once — the second tap matches nothing.

   `releaseBed` is capped at `totalBeds` as a second line of defence, so even
   a bug here cannot push a counter above capacity.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Move a booking out of occupancy and give its bed back.
 *
 * Returns the booking when this call was the one that moved it, and `null`
 * when somebody else already had. A null means DO NOT release — that is the
 * whole idempotency guarantee.
 */
const freeBookingBed = async (bookingId, partnerKeyDigits, nextStatus, extra = {}) => {
  const booking = await PartnerBooking.findOneAndUpdate(
    { _id: bookingId, partnerPhoneDigits: partnerKeyDigits, status: { $in: OCCUPYING } },
    { status: nextStatus, ...extra },
    { new: true },
  ).lean();

  if (!booking) return null;

  /* Best effort, and deliberately after the status write. A booking that was
     cancelled but whose counter did not move is a drift `npm run
     reconcile:inventory` reports; a counter moved for a cancellation that did
     not commit is a bed sold twice. */
  const shareTypeId = shareTypeIdForBooking(booking);
  if (shareTypeId) await releaseBed(shareTypeId);

  return booking;
};

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

const getDigits = (partner) => partner.phoneDigits || phoneKey(partner.phone);

// ── Bookings ────────────────────────────────────────────────────────────────

const getBookings = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const filter = { partnerPhoneDigits: key };
    if (req.query.propertyId) filter.propertyId = req.query.propertyId;
    if (req.query.status) filter.status = req.query.status;

    /*
     * `?source=manual` — walk-ins the owner logged by hand on the Add Customer
     * form, as opposed to `request`, which came from a customer's own visit
     * request through the User App.
     *
     * Whitelisted rather than passed through: an unchecked query value reaching
     * a Mongo filter is how `?source[$ne]=x` becomes a way to read rows the
     * caller was never meant to see. The partner scope above would still hold,
     * but the habit is the dangerous part.
     */
    if (req.query.source === 'manual' || req.query.source === 'request') {
      filter.source = req.query.source;
    }

    /*
     * `?category=PG_HOSTEL` — the Bookings tab's category filter.
     *
     * `PartnerBooking.category` is a mirrored copy of the property's category
     * AT THE TIME OF BOOKING (see the note on the field in
     * `partnerDomains.model.js`), not a live join, so this reads whatever the
     * booking itself was actually made under even if the listing was
     * recategorised since. Whitelisted against the real enum for the same
     * reason `source` is above — a query string is never trusted into a Mongo
     * filter unchecked, partner scope or not. An unrecognised or missing
     * value is simply not filtered, same as the other optional filters here.
     */
    if (CATEGORIES.includes(req.query.category)) {
      filter.category = req.query.category;
    }

    const bookings = await PartnerBooking.find(filter).sort({ createdAt: -1 }).lean();
    /* `stage` beside `status`: what the CALENDAR says, next to what a person
       last set. One clock for the whole page, so two rows in the same list
       cannot straddle midnight and disagree — see `bookingStage.util.js`. */
    const now = new Date();
    const data = bookings.map((b) => forOwner(b, now));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const getBookingById = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const booking = await PartnerBooking.findOne({ _id: req.params.id, partnerPhoneDigits: key }).lean();
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    return res.json({ success: true, data: forOwner(booking) });
  } catch (error) {
    return next(error);
  }
};

/**
 * The owner's half of moving in.
 *
 * They have checked the PIN and let somebody through a door, so this is the
 * first of the two confirmations. It does NOT put the booking in house on its
 * own — the student confirms from their side, and only then is somebody
 * actually moved in. See the note on the fields.
 *
 * Guarded and idempotent: stamping twice keeps the first time. The moment an
 * owner says somebody arrived is a fact, and a second tap is not a second
 * arrival.
 */
/*
 * Digits only — what the owner's app actually collects and sends.
 *
 * `generateEntryPin` mints `LV-123456`; every screen that SHOWS the code
 * (the student's confirmation, the request screen, this booking's own
 * `checkInCode`) draws the six digits as the thing to read out, with
 * `LV-123456` underneath as a secondary reference — and the Stay Partner
 * check-in screen asks for exactly those six digits, in six boxes, with no
 * way to type a letter into it. Comparing that against `normaliseCode(entryPin)`
 * — which keeps the "LV" — meant `req.body.code` could never equal the
 * stored PIN no matter what was typed: "985663" against "LV985663" is a
 * mismatch every single time, so `BAD_PIN` was the only answer this route
 * had ever been able to give a correct code. Stripping to digits on both
 * sides is what makes "985663", "LV-985663" and "lv 985663" all compare
 * equal, so whichever shape a caller sends verifies correctly.
 */
const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

/**
 * Mark a guest as arrived.
 *
 * ## The PIN is checked HERE now
 *
 * It used to be checked on the owner's phone: the API sent the booking down
 * with `entryPin` on it, the app compared what was typed against that, and
 * then called this route with no body at all. The server never saw the code.
 * Anyone holding the owner's handset — or a modified build — could stamp any
 * booking as checked in with no guest present, and for a hotel that stamp is
 * what releases the money.
 *
 * So the code travels up, is compared against the booking's own `entryPin`,
 * and a mismatch is refused BEFORE anything is stamped. The owner's app no
 * longer receives the PIN at all (see `forOwner`); the guest holds the only
 * copy, which is what makes it a key rather than a label.
 *
 * ## Not before the check-in date
 *
 * Enforced here as well, not only greyed out in the app. The app's own date
 * lock was a rule the server did not have — the one place it could be
 * bypassed enforced it, the one place it could not did not. "Today" is
 * India's today, like the booking's dates.
 *
 * ## Walk-ins have no PIN
 *
 * A booking the owner keyed in by hand never had a request accepted, so it
 * has no `entryPin`. Those are stamped without a code, as before — the owner
 * typed this guest in themselves and is the only proof there is.
 */
const checkInBooking = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { id } = req.params;

    const current = await PartnerBooking.findOne({ _id: id, partnerPhoneDigits: key }).lean();
    if (!current) return res.status(404).json({ success: false, message: 'Booking not found' });

    /* Already stamped. Not an error — an owner tapping again should see the
       same answer, not a failure — and no code is asked for a second time. */
    if (current.movedInByOwnerAt) return res.json({ success: true, data: forOwner(current) });

    if (current.status === 'cancelled' || current.status === 'completed') {
      return res.status(409).json({
        success: false, code: 'NOT_CHECKABLE', message: `This booking is ${current.status}.`,
      });
    }

    const { todayInIndia } = require('./bookingStage.util');
    if (current.checkInDate && todayInIndia() < String(current.checkInDate)) {
      return res.status(409).json({
        success: false,
        code: 'TOO_EARLY',
        message: `Check-in opens on ${current.checkInDate}. It cannot be done before then.`,
        checkInDate: current.checkInDate,
      });
    }

    if (current.entryPin) {
      const typed = digitsOnly((req.body || {}).code);
      if (!typed) {
        return res.status(400).json({
          success: false, code: 'CODE_REQUIRED', message: 'Enter the guest’s entry code.',
        });
      }
      if (typed !== digitsOnly(current.entryPin)) {
        return res.status(403).json({
          success: false, code: 'BAD_PIN', message: 'That code does not match this booking.',
        });
      }
    }

    /* Verified. Now stamp — guarded on `movedInByOwnerAt: null` so two taps
       racing produce one stamp. */
    const booking = await PartnerBooking.findOneAndUpdate(
      { _id: id, partnerPhoneDigits: key, movedInByOwnerAt: null },
      { $set: { movedInByOwnerAt: new Date() } },
      { new: true },
    ).lean();
    if (!booking) {
      const again = await PartnerBooking.findOne({ _id: id, partnerPhoneDigits: key }).lean();
      return res.json({ success: true, data: forOwner(again || current) });
    }

    /* Only both sides together put somebody in house. The student has almost
       certainly not confirmed yet — they are standing there — but the check
       belongs here rather than being assumed. */
    if (booking.movedInByStudentAt) {
      await PartnerBooking.updateOne({ _id: booking._id }, { $set: { status: 'in_house' } });
      booking.status = 'in_house';
    }

    /*
     * Tell the student.
     *
     * This used to reach nobody — a check-in only ever showed up the next
     * time `GET /customers/bookings` happened to be polled. Fire-and-forget,
     * like every other notification here: the owner's tap must not wait on a
     * push, and a push that fails must not fail the check-in.
     */
    notifyStudentCheckedIn(booking).catch((error) => {
      console.error('[booking] checked in but the student was not notified:', error.message);
    });

    /*
     * A hotel guest arriving is what unlocks their hotel's money.
     *
     * The owner's share has been held on a Route transfer since the payment
     * cleared, because a cancellation before check-in is refunded out of it.
     * Once the guest is actually here that window has closed, so the
     * settlement becomes releasable and an administrator may withdraw it.
     *
     * `markReleasable` only ever moves `held → releasable` and matches on
     * `bookingId`, so this is safe to reach for on EVERY check-in: a PG,
     * Co-living or Bachelor booking has no settlement row and the update
     * matches nothing. There is no category test here for that reason — the
     * absence of a row is the test, and it cannot drift from the rule that
     * decides which categories get one.
     *
     * Fire-and-forget for the same reason the push is: an owner's tap must
     * not wait on it, and a settlement that did not advance is repairable
     * from the admin queue, where the booking will simply still read `held`.
     */
    require('../settlements/settlement.service')
      .markReleasable(String(booking._id))
      .catch((error) => {
        console.error('[settlement] check-in did not release the hold:', error.message);
      });

    return res.json({ success: true, data: forOwner(booking) });
  } catch (error) {
    return next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   DEVELOPMENT ONLY — force a move-in from the OWNER's own app, both halves
   at once, without waiting for the check-in date.

   ## What it exists for

   `checkInBooking` above enforces a real calendar day — the Stay Partner
   button reads "Check-in available 25 September" and the server refuses
   `TOO_EARLY` even if a build lets the tap through. That is correct, and it
   also means a booking made for next week cannot be walked through the rest
   of the app — active stay, checkout, the hotel settlement chain — until
   that day actually arrives.

   The customer app already has this exact bypass (`devForceCheckIn` in
   `customerBooking.controller.js`), reachable from the STUDENT's own
   booking screen. This is the same power, reachable from the OWNER's,
   because the "🛠 DEV: check in now" button on the Stay Partner booking
   screen led to the PIN entry screen and then stopped there — the date gate
   still refused the real `POST /bookings/:id/checkin` underneath it, so
   typing the correct code never actually worked in a build being tested
   ahead of the date. This skips straight to the answer that button was
   promising.

   ## What it is NOT

   Not a way to check in early on a production server. Refused with a 404
   unless `DEV_ALLOW_FORCE_CHECKIN` is on, which `env.js` refuses outright
   under NODE_ENV=production — so this route does not exist on a real
   deployment, exactly like the payment bypass beside it. Still scoped to
   this partner's OWN booking; a development flag widens what an account may
   do to its own data, never whose data it may touch.

   Delete this function, its route and `DEV_ALLOW_FORCE_CHECKIN` when the
   settlement flow no longer needs walking through by hand.
   ══════════════════════════════════════════════════════════════════════════ */
const devForceCheckInOwner = async (req, res, next) => {
  try {
    if (!config.razorpay.devAllowForceCheckIn) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'That route does not exist on this server.',
      });
    }
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const key = getDigits(req.partner);
    const booking = await PartnerBooking.findOne({ _id: req.params.id, partnerPhoneDigits: key });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const now = new Date();
    booking.movedInByOwnerAt = booking.movedInByOwnerAt || now;
    booking.movedInByStudentAt = booking.movedInByStudentAt || now;
    booking.status = 'in_house';
    await booking.save();

    console.warn(
      `🛠️  [DEV BYPASS] booking ${booking._id} forced to in_house from the owner app without a `
      + 'real check-in (DEV_ALLOW_FORCE_CHECKIN is on).',
    );

    /* The same two calls the real check-in makes — see the notes on both in
       `checkInBooking` just above. A dev-forced check-in that left the
       student unnotified or a hotel settlement stuck on `held` would not
       actually exercise the thing this bypass exists to test. */
    notifyStudentCheckedIn(booking).catch((error) => {
      console.error('[booking] dev-forced check-in but the student was not notified:', error.message);
    });
    require('../settlements/settlement.service')
      .markReleasable(String(booking._id))
      .catch((error) => {
        console.error('[settlement] dev-forced check-in did not release the hold:', error.message);
      });

    return res.json({ success: true, data: forOwner(booking.toObject()) });
  } catch (error) {
    return next(error);
  }
};

const checkOutBooking = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { id } = req.params;
    /* The bed comes back here. Guarded, so checking out twice frees one bed. */
    const booking = await freeBookingBed(id, key, 'completed');
    if (!booking) {
      /* Either it is not theirs, or it has already left occupancy. The second
         is not an error worth alarming an owner about — they tapped twice. */
      const existing = await PartnerBooking.findOne({ _id: id, partnerPhoneDigits: key }).lean();
      if (existing) return res.json({ success: true, data: forOwner(existing) });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    /* Same shape as check-in: the owner's action, told to the student it
       actually happened to. See notifyStudentCheckedOut for why this is also
       where a review gets suggested. */
    notifyStudentCheckedOut(booking).catch((error) => {
      console.error('[booking] checked out but the student was not notified:', error.message);
    });

    return res.json({ success: true, data: forOwner(booking) });
  } catch (error) {
    return next(error);
  }
};

const cancelBooking = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { id } = req.params;

    /* Recorded with the same guarded write that moves the status, so a reason
       can never be stamped on a booking this call did not actually cancel.
       Both are optional: an older build of the app sends neither. */
    const reason = String((req.body || {}).reason || '').trim().slice(0, 120) || null;
    const note = String((req.body || {}).note || '').trim().slice(0, 500) || null;

    const booking = await freeBookingBed(id, key, 'cancelled', {
      cancelReason: reason,
      cancelNote: note,
      cancelledAt: new Date(),
      cancelledBy: 'owner',
    });
    if (!booking) {
      const existing = await PartnerBooking.findOne({ _id: id, partnerPhoneDigits: key }).lean();
      /* Already cancelled. Idempotent for the owner, and deliberately silent —
         re-notifying on a repeat tap would tell the student twice. */
      if (existing) return res.json({ success: true, data: forOwner(existing) });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    /*
     * Tell the student.
     *
     * This was the one owner action after confirmation that reached nobody. A
     * cancellation is not something to discover on next open: they have a
     * move-in date and possibly a train booked against it. Fire-and-forget for
     * the same reason the accept path is — the owner's response must not wait
     * on a push, and a push that fails must not fail the cancellation.
     */
    /*
     * The guest's money comes back in full, and they are asked where to send
     * it — they were not at a form when the owner pressed Cancel, so the
     * notification below carries that request. Null for the free categories.
     */
    let refund = null;
    try {
      refund = await require('../settlements/refund.service')
        .openForCancelledBooking({ booking, cancelledBy: 'owner', reason });
    } catch (error) {
      console.error('[booking] cancelled but the refund could not be opened:', error.message);
    }

    notifyStudentBookingCancelled(booking, refund).catch((error) => {
      console.error('[booking] cancelled but the student was not notified:', error.message);
    });

    return res.json({ success: true, data: forOwner(booking) });
  } catch (error) {
    return next(error);
  }
};

// ── Earnings & Payouts ──────────────────────────────────────────────────────

const getEarningsSummary = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);

    const payouts = await PartnerPayout.find({ partnerPhoneDigits: key }).lean();
    const paymentMethods = await PartnerPaymentMethod.find({ partnerPhoneDigits: key }).lean();

    /*
     * Zero is an answer. `|| 9600` is not.
     *
     * These read `.reduce(…) || 9600` and `|| 58400`, and since `0 || 9600` is
     * `9600` in JavaScript, an owner who had been paid nothing was told they
     * had earned ₹9,600 today and ₹58,400 this week. That is the screen
     * somebody checks before deciding whether to chase a payout.
     *
     * The week filter was also wrong independently of the fallback: it summed
     * every completed payout ever recorded while being labelled "this week".
     * It is now a real seven-day window.
     */
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6);

    const completed = payouts.filter((p) => p.status === 'completed' && p.payoutDate);

    const todayAmount = completed
      .filter((p) => new Date(p.payoutDate) >= startOfToday)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const weekAmount = completed
      .filter((p) => new Date(p.payoutDate) >= startOfWeek)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const pendingPayout = payouts.find((p) => p.status === 'pending' || p.status === 'processing') || null;

    /* What the "Request payout" button would actually move right now:
       completed bookings nothing has claimed, plus the owner's share of hotel
       settlements whose guest has already checked in. See
       `payout.service.js`. */
    const availableBalance = await payoutService.availableBalance(key);

    /* Hotel money a guest has paid that is not requestable yet, because the
       guest has not arrived. Shown separately rather than hidden — an owner
       whose guest paid last night should see it exists. */
    const heldBalance = await payoutService.heldBalance(key);

    return res.json({
      success: true,
      data: {
        todayEarnings: `₹${todayAmount.toLocaleString('en-IN')}`,
        weekEarnings: `₹${weekAmount.toLocaleString('en-IN')}`,
        todayAmount,
        weekAmount,
        availableBalance,
        heldBalance,
        pendingPayout: pendingPayout ? { ...pendingPayout, id: String(pendingPayout._id) } : null,
        payoutsCount: payouts.length,
        paymentMethodsCount: paymentMethods.length,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * "Request payout" — the owner's own button.
 *
 * @route POST /api/v2/partners/payouts/request
 */
const requestPayout = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const payout = await payoutService.requestPayout(req.partner);
    return res.status(201).json({ success: true, data: { ...payout.toObject(), id: String(payout._id) } });
  } catch (error) {
    if (error instanceof payoutService.PayoutError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    return next(error);
  }
};

const getPayouts = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const payouts = await PartnerPayout.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).lean();
    const data = payouts.map((p) => ({ ...p, id: String(p._id) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const getPayoutById = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const payout = await PartnerPayout.findOne({ _id: req.params.id, partnerPhoneDigits: key }).lean();
    if (!payout) return res.status(404).json({ success: false, message: 'Payout not found' });
    return res.json({ success: true, data: { ...payout, id: String(payout._id) } });
  } catch (error) {
    return next(error);
  }
};

/**
 * The owner's saved payout accounts — MASKED.
 *
 * The full account number stays on the server. It is stored, because a payout
 * has to be addressed to something and a person making the bank transfer needs
 * it, but nothing on a phone does: every screen that shows a saved account
 * shows `Bank •••• 4321`, and `toPayoutMethod` in the app only ever reads the
 * last four.
 *
 * This used to return the whole document. Sending a full bank account number
 * back over the wire to be displayed as four digits is a needless copy of it
 * in a cache, a log and a screenshot — and the form that collects it promises
 * the owner "we keep only the last four digits", which was not true of what
 * this endpoint sent.
 *
 * `accountLast4` rather than a mangled `accountNumber`, so nothing downstream
 * can mistake a masked value for a real one and try to pay it.
 */
/**
 * The owner answers a review.
 *
 * Scoped to a review of THEIR property — the id alone is not enough, since a
 * review id is guessable and an owner must not be able to sign somebody
 * else's guest's review. Replaces any earlier reply rather than appending.
 *
 * @route POST /api/v2/partners/reviews/:id/reply
 */
const replyToReview = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);

    const text = String((req.body || {}).text || '').trim().slice(0, 1000);
    if (!text) {
      return res.status(400).json({ success: false, code: 'EMPTY', message: 'Write a reply first.' });
    }

    const review = await PartnerReview.findOneAndUpdate(
      { _id: req.params.id, partnerPhoneDigits: key },
      { $set: { reply: { text, at: new Date() } } },
      { new: true },
    ).lean();
    if (!review) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'That review does not exist.' });
    }

    return res.json({ success: true, data: { ...review, id: String(review._id) } });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'That review does not exist.' });
    }
    return next(error);
  }
};

const getPaymentMethods = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const methods = await PartnerPaymentMethod.find({ partnerPhoneDigits: key }).lean();

    const data = methods.map((m) => {
      const { accountNumber, ...rest } = m;
      return {
        ...rest,
        id: String(m._id),
        accountLast4: String(accountNumber || '').slice(-4),
      };
    });

    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

/* An IFSC is four letters, a zero, then six of either. The SAME rule
   `payoutOnboarding.controller.js` applies — a bank account reaches RazorpayX
   from both places and must not be accepted by one and refused by the other. */
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Save a bank account or a UPI id.
 *
 * ## Validated here, not only in the form
 *
 * These details are what a payout is addressed to. An account number with a
 * typo is not refused by us and not refused by RazorpayX either — it is
 * refused by a BANK, days later, after the owner has been told their money is
 * on its way. So the shape is checked at the one boundary every client shares.
 *
 * ## `isPrimary` is not taken at face value
 *
 * The first method saved is always primary, whatever the body says: an
 * account nothing can pay to is not a saved account. After that the flag is
 * honoured, and promoting one demotes the rest in the same request.
 */
const addPaymentMethod = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const body = req.body || {};
    const type = body.type === 'upi' ? 'upi' : 'bank_account';

    const fail = (code, message) => res.status(400).json({ success: false, code, message });

    let fields;
    if (type === 'upi') {
      const upiId = String(body.upiId || '').trim().toLowerCase();
      if (!/^[\w.\-]{2,64}@[a-z]{2,32}$/.test(upiId)) {
        return fail('BAD_UPI', 'That does not look like a UPI id — it should be like name@bank.');
      }
      fields = { upiId, accountName: String(body.accountName || '').trim() };
    } else {
      const accountName = String(body.accountName || '').trim();
      const accountNumber = String(body.accountNumber || '').replace(/\s/g, '');
      const ifsc = String(body.ifsc || '').trim().toUpperCase();

      if (!accountName) {
        return fail('NO_NAME', 'We need the account holder’s name, exactly as the bank has it.');
      }
      if (!/^\d{6,20}$/.test(accountNumber)) {
        return fail('BAD_ACCOUNT', 'That does not look like an account number.');
      }
      if (!IFSC_PATTERN.test(ifsc)) {
        return fail('BAD_IFSC', 'That does not look like an IFSC — it should be like HDFC0001234.');
      }
      fields = { accountName, accountNumber, ifsc };
    }

    /* Nothing to defer to on the first one. */
    const existing = await PartnerPaymentMethod.countDocuments({ partnerPhoneDigits: key });
    const isPrimary = existing === 0 ? true : Boolean(body.isPrimary);

    if (isPrimary) {
      await PartnerPaymentMethod.updateMany({ partnerPhoneDigits: key }, { isPrimary: false });
    }

    const created = await PartnerPaymentMethod.create({
      partnerPhoneDigits: key, type, ...fields, isPrimary,
    });

    return res.status(201).json({ success: true, data: { ...created.toObject(), id: String(created._id) } });
  } catch (error) {
    return next(error);
  }
};

/**
 * Make one saved method the primary one.
 *
 * The endpoint that did not exist, which is why the app's "Make default"
 * button had nothing to call. Scoped to this owner's own rows on both the
 * match and the demotion, so an id belonging to somebody else changes nothing.
 */
const setPrimaryPaymentMethod = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);

    const method = await PartnerPaymentMethod.findOne({
      _id: req.params.id, partnerPhoneDigits: key,
    });
    if (!method) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'That payout method does not exist.',
      });
    }

    await PartnerPaymentMethod.updateMany({ partnerPhoneDigits: key }, { isPrimary: false });
    method.isPrimary = true;
    await method.save();

    return res.json({ success: true, data: { ...method.toObject(), id: String(method._id) } });
  } catch (error) {
    return next(error);
  }
};

/**
 * Remove a saved method.
 *
 * Deleting the primary one PROMOTES the survivor, the same rule the customer
 * address book follows (`shared/utils/address.js`): something has to be
 * primary or a payout has nowhere to land, and leaving that to the next screen
 * means an owner can end up with accounts and no default.
 *
 * The last method may be deleted. Refusing that would trap an owner who typed
 * the wrong number into an account they cannot correct — and `requestPayout`
 * already refuses with `NO_PAYMENT_METHOD` when there are none.
 */
const deletePaymentMethod = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);

    const method = await PartnerPaymentMethod.findOne({
      _id: req.params.id, partnerPhoneDigits: key,
    }).lean();
    if (!method) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'That payout method does not exist.',
      });
    }

    await PartnerPaymentMethod.deleteOne({ _id: method._id });

    if (method.isPrimary) {
      const survivor = await PartnerPaymentMethod.findOne({ partnerPhoneDigits: key })
        .sort({ createdAt: 1 });
      if (survivor) {
        survivor.isPrimary = true;
        await survivor.save();
      }
    }

    return res.json({ success: true, message: 'Payment method removed' });
  } catch (error) {
    return next(error);
  }
};

// ── Complaints & Support ────────────────────────────────────────────────────

const getComplaints = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const complaints = await PartnerComplaint.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).lean();
    const data = complaints.map((c) => ({ ...c, id: String(c._id) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const getComplaintById = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const complaint = await PartnerComplaint.findOne({ _id: req.params.id, partnerPhoneDigits: key }).lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });
    return res.json({ success: true, data: { ...complaint, id: String(complaint._id) } });
  } catch (error) {
    return next(error);
  }
};

/**
 * Log a complaint — about a property this owner actually owns.
 *
 * Used to default a missing `propertyId`/`propertyName` to `'prop_1'` /
 * `'Sea View Villa'` — placeholders from before this had a form in front of
 * it, and precisely the wrong failure mode for a form that DID get one: a
 * typo or a stale client silently filed the complaint against a fake
 * property instead of refusing. `propertyId` is now required and checked
 * against this partner's own phone number, the same ownership test
 * `propertyEdit.controller.js`'s `findOwnedProperty` runs — never trusted
 * from the body, and `propertyName` is read off the property record rather
 * than whatever the client sent alongside it.
 */
const createComplaint = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { propertyId, title, category, priority, description } = req.body || {};

    if (!mongoose.isValidObjectId(propertyId)) {
      return res.status(400).json({
        success: false, code: 'BAD_INPUT', message: 'Choose which property this is about.',
      });
    }
    if (!String(title || '').trim() || !String(description || '').trim()) {
      return res.status(400).json({
        success: false, code: 'BAD_INPUT', message: 'Add a title and a description.',
      });
    }

    // eslint-disable-next-line global-require
    const Property = require('../properties/property.model');
    const property = await Property.findById(propertyId).select('name ownerMobile').lean();
    /* Same 404 whether the id is nobody's or somebody else's — a complaint
       screen must not become a way to discover which ids exist. */
    if (!property || phoneKey(property.ownerMobile) !== key) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    const created = await PartnerComplaint.create({
      partnerPhoneDigits: key,
      propertyId: String(property._id),
      propertyName: property.name,
      title: String(title).trim().slice(0, 200),
      category: category || 'Maintenance',
      priority: priority || 'medium',
      description: String(description).trim().slice(0, 2000),
      status: 'open',
    });

    return res.status(201).json({ success: true, data: { ...created.toObject(), id: String(created._id) } });
  } catch (error) {
    return next(error);
  }
};

/**
 * Close a complaint, or reopen one.
 *
 * The app's "Mark resolved" button had nothing to call — it was reaching for a
 * `resolveComplaint` helper that mutates a fixture array in `lib/complaints.ts`,
 * so the row changed on screen and reverted on the next load. This is what it
 * calls now.
 *
 * Scoped on `partnerPhoneDigits` as well as `_id`, like every other read here:
 * a route that updates by id alone lets one owner close another owner's
 * complaint by changing a character in a URL.
 */
const updateComplaintStatus = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);

    const { status } = req.body || {};
    if (!['open', 'in_progress', 'resolved'].includes(String(status))) {
      return res.status(400).json({
        success: false, code: 'BAD_INPUT', message: 'Unknown complaint status.',
      });
    }

    const complaint = await PartnerComplaint.findOneAndUpdate(
      { _id: req.params.id, partnerPhoneDigits: key },
      { $set: { status, ...(status === 'resolved' ? { resolvedAt: new Date() } : {}) } },
      { new: true },
    ).lean();

    /* Same 404 for "does not exist" and "is not yours", so the id cannot be
       used to discover whether another owner's complaint exists. */
    if (!complaint) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'Complaint not found',
      });
    }

    return res.json({ success: true, data: { ...complaint, id: String(complaint._id) } });
  } catch (error) {
    return next(error);
  }
};

// ── Notifications ───────────────────────────────────────────────────────────

const getNotifications = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const items = await PartnerNotification.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).lean();
    const data = items.map((n) => ({ ...n, id: String(n._id) }));
    const unreadCount = items.filter((n) => !n.read).length;
    return res.json({ success: true, unreadCount, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const markNotificationRead = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { id } = req.params;
    if (id === 'all') {
      await PartnerNotification.updateMany({ partnerPhoneDigits: key }, { read: true });
    } else {
      await PartnerNotification.updateOne({ _id: id, partnerPhoneDigits: key }, { read: true });
    }
    return res.json({ success: true, message: 'Notification(s) marked read' });
  } catch (error) {
    return next(error);
  }
};

// ── Staff ───────────────────────────────────────────────────────────────────

const getStaff = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const staff = await PartnerStaff.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).lean();
    const data = staff.map((s) => ({ ...s, id: String(s._id) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const inviteStaff = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { name, phone, email, role, permissions } = req.body;
    const created = await PartnerStaff.create({
      partnerPhoneDigits: key,
      name,
      phone,
      email: email || '',
      role: role || 'Manager',
      permissions: permissions || ['requests', 'bookings'],
      status: 'invited',
    });
    return res.status(201).json({ success: true, data: { ...created.toObject(), id: String(created._id) } });
  } catch (error) {
    return next(error);
  }
};

const removeStaff = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    await PartnerStaff.deleteOne({ _id: req.params.id, partnerPhoneDigits: key });
    return res.json({ success: true, message: 'Staff member removed' });
  } catch (error) {
    return next(error);
  }
};

// ── Reviews ─────────────────────────────────────────────────────────────────

const getReviews = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const reviews = await PartnerReview.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).lean();
    const data = reviews.map((r) => ({ ...r, id: String(r._id) }));

    /* Null, not '4.8'. An owner with no reviews has no average, and a number
       invented for them was reaching the screen they open to find out what
       guests think. */
    const averageRating = data.length
      ? Math.round((data.reduce((sum, r) => sum + r.rating, 0) / data.length) * 10) / 10
      : null;

    return res.json({
      success: true,
      averageRating,
      count: data.length,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

// ── Referrals ───────────────────────────────────────────────────────────────

const getReferralInfo = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    let ref = await PartnerReferral.findOne({ partnerPhoneDigits: key }).lean();
    if (!ref) {
      /* Zero, not a stand-in — same rule `getEarningsSummary` follows above.
         This used to seed 500 points, ₹500 and 5 invites on a partner's very
         first visit to this screen, which is fabricated history for an owner
         who has referred nobody. A partner who has actually earned points
         gets here through the `findOne` above and never touches this branch. */
      ref = await PartnerReferral.create({
        partnerPhoneDigits: key,
        code: `PAR-${key.slice(-4)}`,
        points: 0,
        earningsRupees: 0,
        invitedCount: 0,
        history: [],
      });
      ref = ref.toObject();
    }
    return res.json({ success: true, data: { ...ref, id: String(ref._id) } });
  } catch (error) {
    return next(error);
  }
};

const withdrawReferral = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const ref = await PartnerReferral.findOneAndUpdate(
      { partnerPhoneDigits: key },
      { points: 0, earningsRupees: 0 },
      { new: true }
    ).lean();
    return res.json({ success: true, data: { ...ref, id: String(ref._id) } });
  } catch (error) {
    return next(error);
  }
};

// ── Share Types & Availability ──────────────────────────────────────────────

const getShareTypes = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const items = await PartnerShareType.find({ partnerPhoneDigits: key }).lean();
    const data = items.map((st) => ({ ...st, id: String(st._id) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const updateShareTypeAvailability = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { isAvailable } = req.body;

    /* The Dashboard's actual "accepting bookings" answer — see the note on
       `acceptingBookings` in partner.model.js for why this is a flag on the
       partner record rather than derived from PartnerShareType. */
    req.partner.acceptingBookings = Boolean(isAvailable);
    await req.partner.save();

    /*
     * Only a PAUSE bulk-writes every room type. Going online must not.
     *
     * This route is the dashboard's single partner-wide switch — flipping it
     * off is deliberately "stop sending me anyone, everywhere", so every
     * `partner_share_types` row this owner has goes to `isAvailable: false`
     * together. Flipping it ON used to do the mirror-image bulk write, which
     * silently turned every room type back on — including ones the owner had
     * individually paused from Share Types — the moment they went online.
     * `updateOneShareTypeAvailability` is the one place a single row is
     * switched now, so going online here only has to raise the partner flag
     * and leave whatever each row was already set to alone.
     */
    if (!isAvailable) {
      await PartnerShareType.updateMany({ partnerPhoneDigits: key }, { isAvailable: false });
    }

    return res.json({ success: true, isAvailable: Boolean(isAvailable) });
  } catch (error) {
    return next(error);
  }
};

// @route   PATCH /api/v2/partners/share-types/:shareTypeId/availability
// @desc    Take ONE room type off, or put it back on — not the whole property
// @access  Partner session (owner of the row only)
/**
 * Availability, per room type.
 *
 * `updateShareTypeAvailability` above is partner-wide and `setMyPropertyAvailability`
 * (`propertyEdit.controller.js`) is per-property; neither can take a single
 * sharing option off a property that still has others open. `app/share-types/index.tsx`
 * draws a switch per row that looked like it already did this, but its Save
 * only ever called the partner-wide route with a collapsed "is anything still
 * on" boolean — so a room switched off there was never actually written, and
 * a re-save with anything else left on could even switch it back on. This is
 * the route that screen should have been calling.
 *
 * Scoped by `partnerPhoneDigits`, the same ownership check every other
 * partner-scoped write in this file uses, so one owner cannot pause a room
 * that belongs to another's listing by guessing its id.
 */
const updateOneShareTypeAvailability = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { shareTypeId } = req.params;
    const { isAvailable } = req.body;

    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({
        success: false, code: 'VALIDATION_ERROR', message: 'Send isAvailable as true or false.',
      });
    }

    const row = await PartnerShareType.findOneAndUpdate(
      { shareTypeId, partnerPhoneDigits: key },
      { $set: { isAvailable } },
      { new: true },
    );

    if (!row) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'That room type was not found on your account.',
      });
    }

    return res.json({
      success: true,
      data: { shareTypeId: row.shareTypeId, isAvailable: row.isAvailable },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getBookings,
  getBookingById,
  checkInBooking,
  devForceCheckInOwner,
  checkOutBooking,
  cancelBooking,
  getEarningsSummary,
  getPayouts,
  getPayoutById,
  requestPayout,
  replyToReview,
  getPaymentMethods,
  addPaymentMethod,
  setPrimaryPaymentMethod,
  deletePaymentMethod,
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaintStatus,
  getNotifications,
  markNotificationRead,
  getStaff,
  inviteStaff,
  removeStaff,
  getReviews,
  getReferralInfo,
  withdrawReferral,
  getShareTypes,
  updateShareTypeAvailability,
  updateOneShareTypeAvailability,
};
