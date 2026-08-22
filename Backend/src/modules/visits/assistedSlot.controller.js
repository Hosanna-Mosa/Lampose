/* ══════════════════════════════════════════════════════════════════════════
   Picking the slot a paid ₹199 visit happens in.

   ## Two front doors, one outcome

     WhatsApp   the web channel. T2's "Pick my slot" button opens the session,
                a day list and a time list take the choice, and the reply
                webhook lands here (`handleSlotReply`).
     the app    the app channel. A real picker screen posts to `setSlot`.

   Both end in `confirmSchedule`, which is the ONLY place a slot becomes real:
   it stamps the visit `scheduled`, releases the address, and tells everybody
   at once — the customer (WhatsApp M1 or push), the owner (template T3 or
   push), and the team roster (plain WhatsApp, as ever).

   ## The escape hatch is a feature

   "Another day" and "A different time" are real rows, because ten options is
   a list, not a calendar. Picking one marks the visit `manual`, tells the
   team to call, and tells the customer the team will. Nothing is lost — the
   money is settled and the visit stands; only the clock is a human's job now.

   ## The one reminder

   A paid visit with no slot after `slotReminderHours` gets exactly one nudge
   (T4 or a push) and one team alert, sent by the sweep the slot-reminder
   worker drives. The stamp is written with a guarded update, so two server
   instances cannot both send it.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const VisitRequest = require('./visitRequest.model');
const { readListingAddress } = require('./visitAddress.util');
const { isISODate } = require('../listings/stayIntent.util');
const twilio = require('../../infrastructure/twilio/twilio');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/* When a representative can actually be somewhere. Half-open at the top:
   20:00 is the last slot that can be offered. */
const VISIT_HOURS = { from: 8, to: 20 };
const MAX_DAYS_AHEAD = 30;

/* The time list's fixed rows: item id → the HH:MM that is stored. The ids
   were baked into the lampose_pick_time template when it was created, so a
   change here needs a new template version too. */
const TIME_IDS = {
  t_0900: '09:00',
  t_1030: '10:30',
  t_1200: '12:00',
  t_1400: '14:00',
  t_1530: '15:30',
  t_1700: '17:00',
  t_1830: '18:30',
  t_2000: '20:00',
};

const fail = (res, status, code, message) =>
  res.status(status).json({ success: false, code, message, error: message });

/* ── Dates, as the strings the flow speaks ────────────────────────────── */

/** Today where the server runs, as `YYYY-MM-DD`. Local, not `toISOString()`
    — that converts to UTC first and hands back yesterday for most of an
    Indian evening. */
const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const addDaysISO = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** "Fri 22 Aug" — a day the way the list shows it. */
const shortDay = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
};

/** The nine rows of the day list, given the base date it starts from. */
const dayLabels = (baseISO) => Array.from({ length: 9 }, (_, i) => {
  const label = shortDay(addDaysISO(baseISO, i));
  if (i === 0) return `Today · ${label}`;
  if (i === 1) return `Tomorrow · ${label}`;
  return label;
});

/** "Sat, 23 Aug at 4:00 pm" — a fixed slot read back in words. */
const slotLabel = (dateISO, timeHHMM) => {
  const when = new Date(`${dateISO}T${timeHHMM || '00:00'}:00`);
  if (Number.isNaN(when.getTime())) return `${dateISO} at ${timeHHMM || ''}`.trim();
  return when.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });
};

/* ── The team ─────────────────────────────────────────────────────────── */

const teamNumbers = () => String(process.env.VERIFICATION_TEAM_NUMBERS || '')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean);

/** Every roster number, one refusing not stopping the next. Returns whether
    anybody was reached. */
const tellTeam = async (body) => {
  const roster = teamNumbers();
  if (!roster.length) {
    console.warn('[assisted-slot] No VERIFICATION_TEAM_NUMBERS configured; nobody was told.');
    return false;
  }
  const sent = await Promise.all(roster.map(async (number) => {
    const result = await twilio.sendOwnerText({ ownerMobile: number, body });
    if (!result?.success) {
      console.warn(`[assisted-slot] Could not reach ${twilio.maskPhone(number)}: ${result?.error}`);
    }
    return result?.success === true;
  }));
  return sent.some(Boolean);
};

const customerLine = (doc) =>
  `Customer: ${doc.customer?.name || 'Not given'} · ${doc.customer?.phone || 'Not given'}`;

/* ── The commitment point ─────────────────────────────────────────────── */

/**
 * The slot becomes real: recorded, the address released, everybody told.
 *
 * The write commits before any message goes out, and every message is
 * fire-and-forget — a WhatsApp refusal must not un-schedule a visit the
 * customer just watched confirm. `teamNotifiedAt` records whether the roster
 * heard, and the page says so out loud when it did not.
 */
const confirmSchedule = async (doc, { date, time }) => {
  doc.lamposeVisit.status = 'scheduled';
  doc.lamposeVisit.date = date;
  doc.lamposeVisit.time = time;
  doc.lamposeVisit.slotStage = 'none';
  doc.lamposeVisit.requestedAt = new Date();
  /* The slot is what the ₹199 was for, and the address comes with it. */
  doc.addressReleasedAt = doc.addressReleasedAt || new Date();
  await doc.save();

  const when = slotLabel(date, time);

  if (doc.channel === 'app') {
    try {
      const notifier = require('../notifications/stayRequest.notifier');
      notifier.notifyVisitScheduled(doc)
        .catch((e) => console.error('[assisted-slot] push failed:', e.message));
    } catch (error) {
      console.error('[assisted-slot] notifier unavailable:', error.message);
    }
  } else {
    /* M1 — the confirmation with the address. Sent inside the session the
       customer's own reply opened, so it can be free-form and complete. */
    readListingAddress(doc.listingId).then((address) =>
      twilio.sendVisitScheduled({
        customerPhone: doc.customer?.phone,
        propertyName: doc.propertyName,
        sharingLabel: doc.sharing?.label,
        slotLabel: when,
        address,
      })).then((r) => {
      if (!r?.success) console.error('[assisted-slot] Customer confirmation failed:', r?.error);
    }).catch((e) => console.error('[assisted-slot] Customer confirmation threw:', e.message));

    /* T3 — the owner. Templated, because their AVAILABLE session may have
       lapsed by now. */
    if (doc.ownerMobile) {
      twilio.sendOwnerVisitNotice({
        ownerMobile: doc.ownerMobile,
        customerName: doc.customer?.name || 'The visitor',
        sharingLabel: doc.sharing?.label,
        propertyName: doc.propertyName,
        slotLabel: when,
      }).then((r) => {
        if (!r?.success) console.error('[assisted-slot] Owner notice failed:', r?.error);
      }).catch((e) => console.error('[assisted-slot] Owner notice threw:', e.message));
    }
  }

  /* F1 — the roster, whichever channel. This is the message a representative
     plans their day from. */
  tellTeam(
    '🏠 Assisted visit scheduled (paid ₹199)\n\n'
    + `Property: ${doc.propertyName || 'Unnamed'}\n`
    + (doc.sharing?.label ? `Room: ${doc.sharing.label}\n` : '')
    + `When: ${when}\n`
    + `${customerLine(doc)}\n`
    + `Request: ${doc._id}`,
  ).then(async (notified) => {
    if (notified) {
      doc.lamposeVisit.teamNotifiedAt = new Date();
      await doc.save();
    }
  }).catch((e) => console.error('[assisted-slot] Team message threw:', e.message));

  return doc;
};

/** The customer asked for a day or time the lists do not offer. The team
    takes over; the visit stands. */
const handToTeam = async (doc, reason) => {
  doc.lamposeVisit.status = 'manual';
  doc.lamposeVisit.slotStage = 'none';
  await doc.save();

  tellTeam(
    '📞 Assisted visit needs a call (paid ₹199)\n\n'
    + `Property: ${doc.propertyName || 'Unnamed'}\n`
    + (doc.sharing?.label ? `Room: ${doc.sharing.label}\n` : '')
    + `Why: ${reason}\n`
    + `${customerLine(doc)}\n`
    + 'Please call and fix the day and time.\n'
    + `Request: ${doc._id}`,
  ).catch((e) => console.error('[assisted-slot] Team alert threw:', e.message));
};

/* ── The app's picker ─────────────────────────────────────────────────── */

/**
 * The app posts the slot its picker chose.
 *
 * @route POST /api/v2/visit-requests/:id/assisted/slot
 */
const setSlot = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, 'DB_DISCONNECTED', 'The server is not connected to the database.');
    }

    if (!OBJECT_ID.test(String(req.params.id))) {
      return fail(res, 404, 'NOT_FOUND', 'That request no longer exists.');
    }
    const doc = await VisitRequest.findById(req.params.id);
    if (!doc) return fail(res, 404, 'NOT_FOUND', 'That request no longer exists.');

    if (!doc.payment?.required) {
      return fail(res, 400, 'NOT_APPLICABLE', 'This visit does not use scheduled slots.');
    }
    if (doc.payment.status !== 'paid') {
      return fail(res, 402, 'PAYMENT_DUE', 'Pay for the visit before choosing a slot.');
    }
    if (doc.lamposeVisit?.status === 'scheduled') {
      /* Idempotent: a double tap re-reads the slot, it does not re-book or
         re-message anybody. */
      return res.json({
        success: true,
        data: { ...doc.toPublic(), address: await readListingAddress(doc.listingId) },
      });
    }

    const date = String(req.body?.date || '').trim();
    const time = String(req.body?.time || '').trim();

    if (!isISODate(date)) return fail(res, 400, 'BAD_DATE', 'Pick a date for the visit.');
    const min = todayISO();
    const max = addDaysISO(min, MAX_DAYS_AHEAD);
    if (date < min) return fail(res, 400, 'DATE_IN_PAST', 'Pick a date from today onwards.');
    if (date > max) {
      return fail(res, 400, 'DATE_TOO_FAR', `Pick a date within the next ${MAX_DAYS_AHEAD} days.`);
    }

    const clock = time.match(/^(\d{2}):(\d{2})$/);
    const hour = clock ? Number(clock[1]) : NaN;
    const minute = clock ? Number(clock[2]) : NaN;
    if (!clock || minute > 59 || hour < VISIT_HOURS.from || hour > VISIT_HOURS.to
      || (hour === VISIT_HOURS.to && minute > 0)) {
      return fail(res, 400, 'TIME_OUT_OF_HOURS',
        `Visits are arranged between ${VISIT_HOURS.from}:00 and ${VISIT_HOURS.to}:00.`);
    }

    await confirmSchedule(doc, { date, time });

    return res.json({
      success: true,
      data: { ...doc.toPublic(), address: await readListingAddress(doc.listingId) },
    });
  } catch (error) {
    return next(error);
  }
};

/* ── The WhatsApp conversation ────────────────────────────────────────── */

/** Send the day list and remember which date its first row meant. */
const startDayPicking = async (doc) => {
  const base = todayISO();
  doc.lamposeVisit.slotStage = 'awaiting_day';
  doc.lamposeVisit.slotDayBase = base;
  if (doc.lamposeVisit.status === 'manual') doc.lamposeVisit.status = 'slot_pending';
  await doc.save();

  const sent = await twilio.sendPickDay({
    customerPhone: doc.customer?.phone,
    propertyName: doc.propertyName,
    dayLabels: dayLabels(base),
  });
  if (!sent?.success) console.error('[assisted-slot] Day list failed:', sent?.error);
};

/**
 * The inbound half of the conversation, called from the shared WhatsApp
 * webhook AFTER the availability handler has passed on the message.
 *
 * Returns `{ handled, reply? }`: `handled: false` hands the message on to the
 * verification flow untouched; `handled: true` with no reply means the answer
 * was sent through the API (list pickers and M1 cannot ride in TwiML).
 *
 * Never throws — an exception here must not let a slot reply fall through and
 * approve a property.
 */
const handleSlotReply = async ({ from, body, buttonPayload, listId }) => {
  try {
    if (mongoose.connection.readyState !== 1) return { handled: false };

    const text = String(body || '').trim();
    const payload = String(buttonPayload || '').trim();
    const listChoice = String(listId || '').trim();

    const isPickTrigger = payload === 'pick_slot' || /^pick my slot$/i.test(text);
    const dayChoice = listChoice.match(/^day_([1-9])$/);
    const timeChoice = TIME_IDS[listChoice] || null;
    const isEscape = listChoice === 'other_day' || listChoice === 'other_time';

    const sender = twilio.toE164(from);
    if (!sender) return { handled: false };

    /* The newest web-channel visit this phone has paid for and not yet fixed.
       Owners answer AVAILABLE and are matched by `ownerMobile` in the handler
       before this one; customers are matched here by their own number. */
    const doc = await VisitRequest.findOne({
      'customer.phone': sender,
      channel: { $ne: 'app' },
      'payment.required': true,
      'payment.status': 'paid',
      'lamposeVisit.status': { $in: ['slot_pending', 'manual'] },
    }).sort({ createdAt: -1 });

    const inFlow = doc && ['awaiting_day', 'awaiting_time'].includes(doc.lamposeVisit.slotStage);

    /* Nothing of ours: not a slot word, or no visit waiting on one. */
    if (!doc || (!isPickTrigger && !dayChoice && !timeChoice && !isEscape && !inFlow)) {
      return { handled: false };
    }

    if (isPickTrigger) {
      await startDayPicking(doc);
      return { handled: true };
    }

    if (isEscape) {
      await handToTeam(doc, listChoice === 'other_day'
        ? 'Asked for a day beyond the list'
        : 'Asked for a time outside the offered slots');
      return {
        handled: true,
        reply: 'No problem — our Lampose team will call you shortly to arrange a day '
          + 'and time that works for you. Your payment is safe with the visit.',
      };
    }

    if (dayChoice) {
      const base = doc.lamposeVisit.slotDayBase || todayISO();
      const date = addDaysISO(base, Number(dayChoice[1]) - 1);

      /* A reply that sat unanswered past midnight can name a day that has
         gone. Fresh list, not a booking in the past. */
      if (date < todayISO()) {
        await startDayPicking(doc);
        return { handled: true };
      }

      doc.lamposeVisit.date = date;
      doc.lamposeVisit.slotStage = 'awaiting_time';
      await doc.save();

      const sent = await twilio.sendPickTime({
        customerPhone: doc.customer?.phone,
        dayLabel: shortDay(date),
      });
      if (!sent?.success) console.error('[assisted-slot] Time list failed:', sent?.error);
      return { handled: true };
    }

    if (timeChoice) {
      if (!doc.lamposeVisit.date) {
        /* A time with no day — a stale tap on an old list. Start over. */
        await startDayPicking(doc);
        return { handled: true };
      }
      await confirmSchedule(doc, { date: doc.lamposeVisit.date, time: timeChoice });
      return { handled: true };
    }

    /* Free text mid-flow: a typo, or a wish the lists cannot hold. Steered
       back gently — escalating every stray word would put the team on the
       phone for a mistyped emoji. */
    return {
      handled: true,
      reply: 'Please pick from the list above — tap the button and choose a day or '
        + 'time. If none of those work, choose "Another day" and our team will '
        + 'call you to arrange it.',
    };
  } catch (error) {
    console.error('[assisted-slot] Failed to handle a reply:', error.message || error);
    /* Owning the message but failing is still owning it. */
    return { handled: true, reply: 'Sorry — something went wrong. Please try again.' };
  }
};

/* ── The one reminder ─────────────────────────────────────────────────── */

/**
 * Paid `slotReminderHours` ago, still no slot: one nudge to the customer,
 * one alert to the team. The stamp is taken with a guarded update, so of two
 * instances running this sweep exactly one sends for each row.
 */
const sweepSlotReminders = async () => {
  const cutoff = new Date(Date.now() - config.razorpay.slotReminderHours * 60 * 60 * 1000);

  const due = await VisitRequest.find({
    'payment.required': true,
    'payment.status': 'paid',
    'lamposeVisit.status': 'slot_pending',
    'payment.verifiedAt': { $lte: cutoff },
    'lamposeVisit.slotReminderAt': null,
  }).sort({ 'payment.verifiedAt': 1 }).limit(50);

  let sent = 0;
  for (const found of due) {
    /* eslint-disable no-await-in-loop */
    const doc = await VisitRequest.findOneAndUpdate(
      { _id: found._id, 'lamposeVisit.slotReminderAt': null },
      { $set: { 'lamposeVisit.slotReminderAt': new Date() } },
      { new: true },
    );
    if (!doc) continue;   // another instance got here first
    sent += 1;

    if (doc.channel === 'app') {
      try {
        const notifier = require('../notifications/stayRequest.notifier');
        await notifier.notifyVisitSlotReminder(doc);
      } catch (error) {
        console.error('[assisted-slot] reminder push failed:', error.message);
      }
    } else if (doc.consentWhatsApp && doc.customer?.phone) {
      const r = await twilio.sendSlotReminder({
        customerPhone: doc.customer.phone,
        customerName: doc.customer.name,
        propertyName: doc.propertyName,
      });
      if (!r?.success) console.error('[assisted-slot] Reminder message failed:', r?.error);
    }

    await tellTeam(
      `⏰ Paid ${config.razorpay.slotReminderHours} hours ago — no slot picked\n\n`
      + `Property: ${doc.propertyName || 'Unnamed'}\n`
      + `${customerLine(doc)}\n`
      + 'Please call and schedule the visit.\n'
      + `Request: ${doc._id}`,
    ).catch((e) => console.error('[assisted-slot] Team reminder threw:', e.message));
    /* eslint-enable no-await-in-loop */
  }

  return sent;
};

module.exports = {
  setSlot,
  handleSlotReply,
  confirmSchedule,
  sweepSlotReminders,
  VISIT_HOURS,
  MAX_DAYS_AHEAD,
  TIME_IDS,
};
