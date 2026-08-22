/* ══════════════════════════════════════════════════════════════════════════
   Telling somebody what just happened to a stay request.

   Six events, two audiences, and one rule that shapes all of them: this is
   called ONLY from inside a transition that actually committed. A guarded
   update that matched nothing never gets here, which is why there is no
   dedupe table, no `notifiedAt` flag and no idempotency key — the atomic
   update IS the dedupe. Three expiry sweeps over one request produce one
   notification because two of them match zero documents.

   ## Two things happen per event, in this order

     1. an INBOX ROW, so the event survives the notification
     2. a PUSH, so the phone buzzes now

   The row first, deliberately. A push that failed leaves a record the student
   or owner finds when they next open the app; a push that succeeded with no
   row behind it is an alert that vanishes when it is swiped away, about
   something that did happen.

   ## The two inboxes are not the same shape, and that is not an oversight

     owners     `partner_notifications`, a real collection with read flags
     students   derived from the requests themselves — see
                customers/notification.controller.js for why there is no
                collection on that side

   So a student's "inbox row" is written by the transition already having
   happened; there is nothing to insert. Only the owner gets a row here.

   ## Nothing in this file throws

   Every function swallows its own failures and reports them. A notification
   is downstream of a state change that has already committed and been
   answered — an owner's push failing must not turn their successful
   acceptance into a 500, and must not stop the auto-decline sweep half way.
   ══════════════════════════════════════════════════════════════════════════ */
const config = require('../../config/env');
/* The MODULE, not a destructured `sendPush`. Destructuring captures the
   function at require time, which freezes the binding — a test that swaps the
   transport, or any future code that wraps it, would then be talking to a
   copy nothing calls. Reaching through the namespace costs a property lookup
   and keeps one seam where the sender can be replaced. */
const push = require('../../infrastructure/push/push');

const say = (...args) => { if (!config.isTest) console.log(...args); };

/* ------------------------------------------------------------------ *
 * Reaching a person
 * ------------------------------------------------------------------ */

/**
 * Push to every device on an account, and prune the dead ones.
 *
 * Pruning matters more than it looks: an uninstalled app leaves a token that
 * fails on every future send forever, and a handful of those across an active
 * account turns "did the push work" into a question nobody can answer from
 * the numbers.
 */
const pushTo = async (Model, accountQuery, message) => {
  try {
    const account = await Model.findOne(accountQuery).select('devices').lean();
    const tokens = (account && account.devices ? account.devices : []).map((d) => d.token);
    if (!tokens.length) return { sent: 0, failed: 0, reason: 'NO_DEVICES' };

    const result = await push.sendPush(tokens, message);

    if (result.invalid && result.invalid.length) {
      /* Expo said the app is gone from these handsets. */
      await Model.updateOne(accountQuery, {
        $pull: { devices: { token: { $in: result.invalid } } },
      });
    }

    return result;
  } catch (error) {
    console.error('[notify] push failed:', error.message);
    return { sent: 0, failed: 0, error: error.message };
  }
};

/** An owner's inbox row. Students have no collection — see the header. */
const ownerInboxRow = async (
  partnerPhoneDigits,
  { title, message, category = 'request', requestId = null },
) => {
  try {
    const { PartnerNotification } = require('../partners/partnerDomains.model');
    await PartnerNotification.create({
      partnerPhoneDigits, title, message, category, requestId, read: false,
    });
  } catch (error) {
    console.error('[notify] could not write the owner inbox row:', error.message);
  }
};

const Partner = () => require('../partners/partner.model');
const Customer = () => require('../customers/customer.model');

/** The owner's ten digits, which is how everything on that side is keyed. */
const ownerKeyOf = (request) => Partner().phoneKey(request.ownerMobile);

/**
 * What the app should open when the notification is tapped.
 *
 * Carried in the payload rather than looked up on open: with a three-minute
 * deadline, an extra round trip before the screen can render the countdown is
 * a meaningful fraction of the window.
 */
const payloadFor = (request, kind) => ({
  kind,
  requestId: String(request._id),
  listingId: request.listingId,
  status: request.status,
  expiresAt: request.expiresAt ? new Date(request.expiresAt).toISOString() : null,
});

/* ------------------------------------------------------------------ *
 * The six events
 * ------------------------------------------------------------------ */

/** A student has asked. The owner has minutes, so this one matters most. */
const notifyOwnerOfNewRequest = async (request) => {
  const key = ownerKeyOf(request);
  if (!key) return { sent: 0 };

  const who = (request.customer && request.customer.name) || 'A student';
  const room = request.sharing && request.sharing.label ? ` · ${request.sharing.label}` : '';
  const minutes = config.booking.expiryMinutes;

  await ownerInboxRow(key, {
    title: 'New stay request',
    message: `${who} asked about ${request.propertyName}${room}. You have ${minutes} minutes to answer.`,
    /* So tapping the row opens the request rather than nothing. With minutes
       on the clock, a dead-end notification is the whole feature failing. */
    requestId: String(request._id),
  });

  say(`[notify] new request → owner ${key} (${request.propertyName})`);

  /*
   * Stamped once the owner has been reached by SOMETHING — the inbox row is
   * written above and always succeeds, so by this line the request is on
   * their screen whether or not their handset buzzes.
   *
   * Deliberately not "delivered": nobody can know a notification reached a
   * lock screen, and a stage claiming it did would be the invented-progress
   * problem all over again.
   */
  const VisitRequest = require('../visits/visitRequest.model');
  await VisitRequest.updateOne(
    { _id: request._id, notifiedAt: null },
    { $set: { notifiedAt: new Date() } },
  ).catch(() => {});

  return pushTo(Partner(), { phoneDigits: key }, {
    title: 'New stay request',
    /* The room type and the deadline are in the body because an owner
       deciding from the lock screen should not have to open the app to know
       what they are being asked or how long they have. */
    body: `${who}${room} — ${minutes} minutes to answer`,
    data: payloadFor(request, 'request.created'),
  });
};

/** The owner said yes. */
const notifyStudentAccepted = async (request) => {
  say(`[notify] accepted → student ${request.customerId} (${request.propertyName})`);

  /*
   * Two different things have happened, and the notification has to say which.
   *
   * Without a token the owner's tap ends the flow — "you're confirmed". With
   * one, the owner has agreed and the student still owes ₹20 before the
   * address and the reference exist. Telling them "confirmed" there would end
   * the flow in their head while the thing that completes it went undone, and
   * the confirmation would lapse in a day.
   */
  const tokenDue = request.payment?.required && request.payment.status !== 'paid';
  const amount = (request.payment?.amountPaise || 0) / 100;

  return pushTo(Customer(), { customerId: request.customerId }, {
    title: tokenDue ? 'The owner said yes — one step left' : 'Your request was accepted',
    body: tokenDue
      ? `${request.propertyName} is free to visit. Pay ₹${amount} to get the address and your visit reference.`
      : `${request.propertyName} confirmed your stay. You can continue with your booking.`,
    data: payloadFor(request, 'request.accepted'),
  });
};

/**
 * The owner said no — or the bed went while they waited.
 *
 * One function, two genuinely different messages. Collapsing them would tell
 * a student they were turned down when in fact somebody else was simply
 * faster, which is the difference between "look elsewhere" and "try again".
 */
const notifyStudentDeclined = async (request) => {
  const taken = request.decisionReason === 'INVENTORY_TAKEN';
  say(`[notify] ${taken ? 'inventory taken' : 'declined'} → student ${request.customerId}`);

  return pushTo(Customer(), { customerId: request.customerId }, {
    title: taken ? 'That room was just taken' : 'Your request was declined',
    body: taken
      ? `The last bed at ${request.propertyName} went while you were waiting. Nothing was charged.`
      : `${request.propertyName} cannot take you right now. You can try another property.`,
    data: payloadFor(request, taken ? 'request.inventoryTaken' : 'request.declined'),
  });
};

/**
 * The owner cancelled a booking that was already confirmed.
 *
 * The one owner action after confirmation that a student cannot afford to
 * discover by opening the app. Everything else the owner does later — a room
 * number, a check-in, a check-out — either happens while the student is
 * standing there or does not change their plans. A cancellation does: they
 * have a move-in date, possibly a train booked, and the bed is gone.
 *
 * Takes the BOOKING rather than the request, because by this point the booking
 * is the record that is still moving; the request has been terminal since it
 * was accepted. It is keyed on `customerId`, which is why that field had to
 * exist on the booking at all.
 */
const notifyStudentBookingCancelled = async (booking) => {
  if (!booking || !booking.customerId) return null;
  say(`[notify] booking cancelled → student ${booking.customerId} (${booking.propertyName})`);

  return pushTo(Customer(), { customerId: booking.customerId }, {
    title: 'Your booking was cancelled',
    /* Names the property and says the money position in the same breath.
       "Cancelled" on its own sends somebody straight to support to ask the
       question this sentence already answers. */
    body: `${booking.propertyName} cancelled your booking for ${booking.checkInDate || 'your move-in date'}.`
      + ' Anything you paid is refunded. You can find another place in the app.',
    data: {
      kind: 'booking.cancelled',
      bookingId: String(booking._id),
      requestId: booking.requestId || null,
      listingId: booking.propertyId,
      status: 'cancelled',
    },
  });
};

/** Nobody answered. */
const notifyStudentExpired = async (request) => {
  say(`[notify] expired → student ${request.customerId} (${request.propertyName})`);
  return pushTo(Customer(), { customerId: request.customerId }, {
    title: 'Your request expired',
    /* Not "they ignored you". An owner who missed a three-minute window was
       probably driving, and a student who reads silence as rejection stops
       sending requests. */
    body: `${request.propertyName} did not answer in time. Nothing was charged — you can try again.`,
    data: payloadFor(request, 'request.expired'),
  });
};

/** The student pulled it back. The owner must stop expecting them. */
const notifyOwnerOfWithdrawal = async (request) => {
  const key = ownerKeyOf(request);
  if (!key) return { sent: 0 };

  const who = (request.customer && request.customer.name) || 'A student';

  await ownerInboxRow(key, {
    title: 'Request cancelled',
    message: `${who} cancelled their request for ${request.propertyName}.`,
    requestId: String(request._id),
  });

  say(`[notify] withdrawn → owner ${key}`);

  return pushTo(Partner(), { phoneDigits: key }, {
    title: 'Request cancelled',
    body: `${who} cancelled their request for ${request.propertyName}.`,
    data: payloadFor(request, 'request.cancelled'),
  });
};

/**
 * Everything the expiry worker just closed.
 *
 * Sequential rather than `Promise.all`: a sweep can carry a dozen requests,
 * and firing a dozen concurrent sends at a gateway that rate limits is how a
 * batch half-arrives. The worker is on a five-second tick with nothing
 * waiting on it, so there is no reason to hurry.
 */
const notifyExpired = async (requests) => {
  for (const request of requests) {
    await notifyStudentExpired(request);
  }
};

/**
 * The ₹199 cleared: the visit is paid and waiting for its slot.
 *
 * Student only, and in-app — this is the app channel's answer to the
 * WhatsApp "payment received" the web flow sends. The owner is NOT told yet:
 * a payment with no slot is nothing they can act on, and their notification
 * comes with the slot in `notifyVisitScheduled`.
 */
const notifyVisitPaid = async (request) => {
  say(`[notify] visit paid → ${request.customerId} (${request.propertyName})`);

  return pushTo(Customer(), { customerId: request.customerId }, {
    title: 'Payment received',
    body: `${request.propertyName} — now pick a date and time for your visit.`,
    data: payloadFor(request, 'visit.paid'),
  });
};

/**
 * The slot is fixed: both sides learn it at once.
 *
 * This is the app channel's answer to the WhatsApp trio the web flow sends
 * (customer confirmation, owner notice, team message) — the team's WhatsApp
 * message goes out either way, from the controller.
 */
const notifyVisitScheduled = async (request) => {
  const slot = `${request.lamposeVisit?.date || ''} at ${request.lamposeVisit?.time || ''}`.trim();
  say(`[notify] visit scheduled → ${request.customerId} + owner (${request.propertyName}, ${slot})`);

  const student = pushTo(Customer(), { customerId: request.customerId }, {
    title: 'Visit confirmed',
    body: `${request.propertyName} — ${slot}. A Lampose representative will meet you there; the address is in the app.`,
    data: payloadFor(request, 'visit.scheduled'),
  });

  const ownerKey = ownerKeyOf(request);
  const owner = ownerKey
    ? (async () => {
      await ownerInboxRow(ownerKey, {
        title: 'Visit scheduled',
        message: `${request.customer?.name || 'The visitor'} and a Lampose representative will visit ${request.propertyName} on ${slot}.`,
        requestId: String(request._id),
      });
      return pushTo(Partner(), { phoneDigits: ownerKey }, {
        title: 'Visit scheduled',
        body: `${request.customer?.name || 'The visitor'} and a Lampose representative will visit ${request.propertyName} on ${slot}.`,
        data: payloadFor(request, 'visit.scheduled'),
      });
    })()
    : Promise.resolve({ sent: 0 });

  return Promise.all([student, owner]);
};

/** Paid, hours gone, no slot. One nudge; after it the team calls. */
const notifyVisitSlotReminder = async (request) => {
  say(`[notify] slot reminder → ${request.customerId} (${request.propertyName})`);

  return pushTo(Customer(), { customerId: request.customerId }, {
    title: 'Pick your visit slot',
    body: `${request.propertyName} — your visit is paid and waiting for a date and time.`,
    data: payloadFor(request, 'visit.slot_reminder'),
  });
};

module.exports = {
  notifyVisitPaid,
  notifyVisitScheduled,
  notifyVisitSlotReminder,
  notifyOwnerOfNewRequest,
  notifyStudentAccepted,
  notifyStudentDeclined,
  notifyStudentBookingCancelled,
  notifyStudentExpired,
  notifyOwnerOfWithdrawal,
  notifyExpired,
};
