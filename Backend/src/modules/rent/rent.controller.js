/* ══════════════════════════════════════════════════════════════════════════
   The Rent tab's routes — residents, what they owe, what they paid, reminders
   and vacancy. Mounted under `/api/v2/partners/rent` behind `requirePartner`.

   Every read and write is scoped by the caller's own phone key; a booking id
   from another owner answers 404 exactly like one that does not exist.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const mongoose = require('mongoose');

const Partner = require('../partners/partner.model');
const { PartnerBooking } = require('../partners/partnerDomains.model');
const { todayInIndia } = require('../partners/bookingStage.util');
const {
  RentPayment, RentReminder, RentSettings, PAYMENT_MODES, REMINDER_CHANNELS,
} = require('./rent.model');
const { parseYmd, monthOf, isMonthlyStay } = require('./rent.ledger');
const {
  loadResidents, loadResident, overviewFor, vacancyFor, settingsFor, reminderView,
} = require('./rent.service');

const MAX_RENT = 1_000_000;

const keyOf = (partner) => partner.phoneDigits || Partner.phoneKey(partner.phone);

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

const bad = (res, message, code = 'INVALID_INPUT') => res.status(400).json({ success: false, code, message });

const notFound = (res) => res.status(404).json({
  success: false, code: 'NOT_FOUND', message: 'We could not find that resident.',
});

/** Wraps a handler with the database check and error forwarding. */
const handle = (fn) => async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    return await fn(req, res, keyOf(req.partner));
  } catch (error) {
    return next(error);
  }
};

const monthLabel = (period) => {
  const p = parseYmd(`${period}-01`);
  if (!p) return period;
  return new Date(Date.UTC(p.y, p.m - 1, 1))
    .toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const paymentView = (p) => ({
  id: String(p._id),
  bookingId: p.bookingId,
  guestName: p.guestName,
  guestPhone: p.guestPhone,
  roomNumber: p.roomNumber,
  propertyName: p.propertyName,
  period: p.period,
  amount: p.amount,
  paidOn: p.paidOn,
  mode: p.mode,
  note: p.note,
  receiptNo: p.receiptNo,
  voidedAt: p.voidedAt,
  voidReason: p.voidReason,
  createdAt: p.createdAt,
});

const RECEIPT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const receiptNumber = (paidOn) => {
  let tail = '';
  for (let i = 0; i < 5; i += 1) tail += RECEIPT_ALPHABET[crypto.randomInt(RECEIPT_ALPHABET.length)];
  return `LR${paidOn.slice(2, 4)}${paidOn.slice(5, 7)}-${tail}`;
};

// ── Reads ───────────────────────────────────────────────────────────────────

const getOverview = handle(async (req, res, key) => {
  const data = await overviewFor(key);
  return res.json({ success: true, data });
});

const getResidents = handle(async (req, res, key) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const rows = await loadResidents(key);
  const data = rows
    .map((r) => r.view)
    .filter((v) => !q
      || v.guestName.toLowerCase().includes(q)
      || String(v.roomNumber || '').toLowerCase().includes(q)
      || String(v.guestPhone || '').includes(q));
  return res.json({ success: true, count: data.length, data });
});

const getResident = handle(async (req, res, key) => {
  const found = await loadResident(key, req.params.id);
  if (!found) return notFound(res);
  return res.json({
    success: true,
    data: {
      ...found.view,
      monthlyStay: isMonthlyStay(found.booking),
      periods: [...found.periods].reverse(),
      payments: found.payments.map(paymentView),
      reminders: found.reminders.map(reminderView),
    },
  });
});

/** Residents who owe today or earlier, the longest-waiting first. */
const getDues = handle(async (req, res, key) => {
  const rows = await loadResidents(key);
  const data = rows
    .filter((r) => r.view.summary.status === 'overdue' || r.view.summary.status === 'due')
    .map((r) => ({
      ...r.view,
      owing: r.periods.filter((p) => p.status === 'overdue' || p.status === 'due'),
    }))
    .sort((a, b) => (b.summary.maxDaysLate - a.summary.maxDaysLate)
      || (b.summary.outstanding - a.summary.outstanding));

  const total = data.reduce((n, r) => n + r.summary.outstanding, 0);
  return res.json({ success: true, count: data.length, total, data });
});

/** Rent falling due in the next `days` days (default 30, at most 60). */
const getUpcoming = handle(async (req, res, key) => {
  const days = Math.min(60, Math.max(1, Number(req.query.days) || 30));
  const rows = await loadResidents(key, { horizonDays: Math.max(45, days) });

  const data = [];
  for (const r of rows) {
    for (const p of r.periods) {
      if (p.status === 'upcoming' && p.daysUntil <= days) {
        data.push({
          resident: {
            id: r.view.id,
            guestName: r.view.guestName,
            guestPhone: r.view.guestPhone,
            roomNumber: r.view.roomNumber,
            propertyName: r.view.propertyName,
          },
          ...p,
        });
      }
    }
  }
  data.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.resident.guestName.localeCompare(b.resident.guestName));

  const total = data.reduce((n, p) => n + p.balance, 0);
  return res.json({ success: true, count: data.length, total, days, data });
});

/** Recorded payments, newest first, optionally one month or one resident. */
const getPayments = handle(async (req, res, key) => {
  const filter = { partnerPhoneDigits: key };
  const month = String(req.query.month || '');
  if (/^\d{4}-\d{2}$/.test(month)) filter.paidOn = { $regex: `^${month}` };
  if (req.query.bookingId) filter.bookingId = String(req.query.bookingId);
  if (req.query.includeVoided !== '1') filter.voidedAt = null;

  const rows = await RentPayment.find(filter).sort({ paidOn: -1, createdAt: -1 }).limit(500).lean();
  const total = rows.filter((p) => !p.voidedAt).reduce((n, p) => n + p.amount, 0);
  return res.json({ success: true, count: rows.length, total, data: rows.map(paymentView) });
});

/** One payment, with what a receipt needs to say who it is from. */
const getPayment = handle(async (req, res, key) => {
  if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
  const payment = await RentPayment.findOne({ _id: req.params.id, partnerPhoneDigits: key }).lean();
  if (!payment) return notFound(res);

  const owner = req.partner;
  return res.json({
    success: true,
    data: {
      ...paymentView(payment),
      periodLabel: monthLabel(payment.period),
      receivedBy: {
        name: owner.name || '',
        businessName: owner.businessName || '',
        phone: owner.phone || '',
      },
    },
  });
});

const getVacancy = handle(async (req, res, key) => {
  const data = await vacancyFor(key);
  return res.json({ success: true, data });
});

const getReminders = handle(async (req, res, key) => {
  const [settings, rows, recent] = await Promise.all([
    settingsFor(key),
    loadResidents(key),
    RentReminder.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  /* Who to chase: owing, least recently reminded first — someone reminded an
     hour ago does not need a second message yet. */
  const followUps = rows
    .filter((r) => r.view.summary.status === 'overdue' || r.view.summary.status === 'due')
    .map((r) => r.view)
    .sort((a, b) => {
      const at = (v) => (v.lastReminder ? new Date(v.lastReminder.at).getTime() : 0);
      return at(a) - at(b) || b.summary.maxDaysLate - a.summary.maxDaysLate;
    });

  const names = new Map(rows.map((r) => [r.view.id, r.view.guestName]));
  return res.json({
    success: true,
    data: {
      settings,
      followUps,
      recent: recent.map((r) => ({
        ...reminderView(r),
        bookingId: r.bookingId,
        guestName: names.get(r.bookingId) || '',
      })),
    },
  });
});

// ── Writes ──────────────────────────────────────────────────────────────────

/**
 * Set a resident's rent and due day.
 *
 * A new amount applies from THIS month onward: months before it keep the
 * amount they fell due at, so raising the rent never turns a month already
 * settled into a partial one.
 */
const updateTerms = handle(async (req, res, key) => {
  if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
  const booking = await PartnerBooking.findOne({ _id: req.params.id, partnerPhoneDigits: key });
  if (!booking) return notFound(res);
  if (!isMonthlyStay(booking)) {
    return bad(res, 'Hotel stays are paid by the night and have no monthly rent.', 'NOT_MONTHLY');
  }

  const body = req.body || {};
  const update = {};

  if (body.monthly !== undefined) {
    const amount = Number(body.monthly);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_RENT) {
      return bad(res, 'Enter the monthly rent in whole rupees.');
    }
    const thisMonth = monthOf(todayInIndia());
    const schedule = (booking.rent?.schedule || [])
      .map((s) => ({ from: s.from, amount: s.amount }))
      .filter((s) => s.from < thisMonth);
    /* The first rent ever set covers the whole stay, back to check-in. */
    schedule.push({ from: schedule.length ? thisMonth : '0000-00', amount });
    update['rent.schedule'] = schedule;
  }

  if (body.dueDay !== undefined) {
    if (body.dueDay === null || body.dueDay === '') {
      update['rent.dueDay'] = null;
    } else {
      const day = Number(body.dueDay);
      if (!Number.isInteger(day) || day < 1 || day > 28) {
        return bad(res, 'Pick a due day between 1 and 28, so it exists in every month.');
      }
      update['rent.dueDay'] = day;
    }
  }

  if (!Object.keys(update).length) return bad(res, 'Nothing to change.');
  await PartnerBooking.updateOne({ _id: booking._id }, { $set: update });

  const found = await loadResident(key, req.params.id);
  return res.json({ success: true, data: found.view });
});

/** Record money a resident handed over. */
const recordPayment = handle(async (req, res, key) => {
  const found = await loadResident(key, req.params.id);
  if (!found) return notFound(res);

  const body = req.body || {};
  const today = todayInIndia();
  const period = String(body.period || '');
  const amount = Number(body.amount);
  const paidOn = String(body.paidOn || today);
  const mode = String(body.mode || 'cash');
  const note = String(body.note || '').trim().slice(0, 300);

  if (found.terms.monthly <= 0) {
    return bad(res, 'Set this resident’s monthly rent before recording a payment.', 'RENT_NOT_SET');
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_RENT) {
    return bad(res, 'Enter the amount in whole rupees.');
  }
  if (!parseYmd(paidOn) || paidOn > today) {
    return bad(res, 'The payment date cannot be in the future.');
  }
  if (!PAYMENT_MODES.includes(mode)) return bad(res, 'Pick how the rent was paid.');

  const month = found.periods.find((p) => p.period === period);
  if (!month) return bad(res, 'Pick one of this resident’s rent months.', 'BAD_PERIOD');
  if (month.balance <= 0) {
    return res.status(409).json({
      success: false, code: 'ALREADY_PAID', message: `${monthLabel(period)} is already fully paid.`,
    });
  }
  if (amount > month.balance) {
    return res.status(409).json({
      success: false,
      code: 'MORE_THAN_OWED',
      message: `Only ₹${month.balance.toLocaleString('en-IN')} is left for ${monthLabel(period)}. `
        + 'Record anything extra against the next month.',
    });
  }

  const { booking } = found;
  let payment = null;
  for (let attempt = 0; attempt < 4 && !payment; attempt += 1) {
    try {
      payment = await RentPayment.create({
        partnerPhoneDigits: key,
        bookingId: String(booking._id),
        propertyId: booking.propertyId,
        propertyName: booking.propertyName,
        guestName: booking.guestName,
        guestPhone: booking.guestPhone,
        roomNumber: booking.roomNumber,
        period,
        amount,
        paidOn,
        mode,
        note,
        receiptNo: receiptNumber(paidOn),
      });
    } catch (error) {
      /* A receipt number collision; draw another. */
      if (error && error.code === 11000 && attempt < 3) continue;
      throw error;
    }
  }

  return res.status(201).json({ success: true, data: paymentView(payment.toObject()) });
});

/** Undo a payment recorded by mistake. Kept, marked void. */
const voidPayment = handle(async (req, res, key) => {
  if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 200);
  const payment = await RentPayment.findOneAndUpdate(
    { _id: req.params.id, partnerPhoneDigits: key, voidedAt: null },
    { $set: { voidedAt: new Date(), voidReason: reason } },
    { new: true },
  ).lean();
  if (!payment) {
    return res.status(404).json({
      success: false, code: 'NOT_FOUND', message: 'That payment was not found or is already void.',
    });
  }
  return res.json({ success: true, data: paymentView(payment) });
});

/** Log that the owner reminded a resident (the app opens WhatsApp/SMS/the dialler itself). */
const logReminder = handle(async (req, res, key) => {
  if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
  const booking = await PartnerBooking.findOne({ _id: req.params.id, partnerPhoneDigits: key })
    .select('_id')
    .lean();
  if (!booking) return notFound(res);

  const channel = String((req.body && req.body.channel) || '');
  if (!REMINDER_CHANNELS.includes(channel)) return bad(res, 'Unknown reminder channel.');
  const period = String((req.body && req.body.period) || '');

  const row = await RentReminder.create({
    partnerPhoneDigits: key,
    bookingId: String(booking._id),
    period: /^\d{4}-\d{2}$/.test(period) ? period : '',
    channel,
  });
  return res.status(201).json({ success: true, data: reminderView(row.toObject()) });
});

const updateSettings = handle(async (req, res, key) => {
  const body = req.body || {};
  const set = {};
  if (body.ownerAlerts !== undefined) set.ownerAlerts = Boolean(body.ownerAlerts);
  if (body.daysBefore !== undefined) {
    const days = Number(body.daysBefore);
    if (!Number.isInteger(days) || days < 0 || days > 10) return bad(res, 'Pick 0 to 10 days.');
    set.daysBefore = days;
  }
  if (!Object.keys(set).length) return bad(res, 'Nothing to change.');

  await RentSettings.updateOne({ partnerPhoneDigits: key }, { $set: set }, { upsert: true });
  return res.json({ success: true, data: await settingsFor(key) });
});

module.exports = {
  getOverview,
  getResidents,
  getResident,
  getDues,
  getUpcoming,
  getPayments,
  getPayment,
  getVacancy,
  getReminders,
  updateTerms,
  recordPayment,
  voidPayment,
  logReminder,
  updateSettings,
};
