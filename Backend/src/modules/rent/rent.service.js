/* ══════════════════════════════════════════════════════════════════════════
   The owner's residents with their rent worked out — the one read every Rent
   screen is drawn from.

   A "resident" is a booking that still holds a bed (`OCCUPYING`) at a
   category with a rent month (anything but a hotel). Everything here is
   scoped by `partnerPhoneDigits`, the same key every Stay Partner route uses.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const { PartnerBooking, PartnerShareType } = require('../partners/partnerDomains.model');
const { OCCUPYING, shareTypeIdForBooking } = require('../inventory/inventory.service');
const { todayInIndia } = require('../partners/bookingStage.util');
const { RentPayment, RentReminder, RentSettings } = require('./rent.model');
const {
  NOT_MONTHLY, termsFor, periodsFor, summarise, monthOf,
} = require('./rent.ledger');

const priceKey = (propertyId, name) => `${propertyId}|${String(name || '').trim().toLowerCase()}`;

/** Listed monthly price per (property, room type), for residents with no rent set. */
const listedPrices = async (key) => {
  const rows = await PartnerShareType.find({ partnerPhoneDigits: key })
    .select('propertyId name monthlyPrice')
    .lean();
  const map = new Map();
  for (const row of rows) map.set(priceKey(row.propertyId, row.name), Number(row.monthlyPrice) || 0);
  return map;
};

const lastRemindersFor = async (key, bookingIds) => {
  if (!bookingIds.length) return new Map();
  const rows = await RentReminder.find({ partnerPhoneDigits: key, bookingId: { $in: bookingIds } })
    .sort({ createdAt: -1 })
    .select('bookingId channel period createdAt')
    .lean();
  const map = new Map();
  for (const row of rows) if (!map.has(row.bookingId)) map.set(row.bookingId, row);
  return map;
};

const reminderView = (row) => (row
  ? { channel: row.channel, period: row.period || '', at: row.createdAt }
  : null);

/** What a list row needs about one resident. */
const residentView = (booking, terms, periods, lastReminder) => ({
  id: String(booking._id),
  guestName: booking.guestName,
  guestPhone: booking.guestPhone,
  roomNumber: booking.roomNumber,
  shareType: booking.shareType,
  propertyId: booking.propertyId,
  propertyName: booking.propertyName,
  checkInDate: booking.checkInDate,
  checkOutDate: booking.checkOutDate || '',
  status: booking.status,
  source: booking.source,
  rent: {
    monthly: terms.monthly,
    source: terms.source,
    dueDay: terms.dueDay,
    effectiveDueDay: terms.effectiveDueDay,
  },
  summary: summarise(periods),
  lastReminder: reminderView(lastReminder),
});

/**
 * Every resident of this owner, with terms, months and a summary.
 *
 * Returned rows keep `periods` alongside the view so the due and upcoming
 * lists can be cut from one read.
 */
const loadResidents = async (key, { today = todayInIndia(), horizonDays = 45 } = {}) => {
  const bookings = await PartnerBooking.find({
    partnerPhoneDigits: key,
    status: { $in: OCCUPYING },
    category: { $nin: NOT_MONTHLY },
  })
    .sort({ guestName: 1 })
    .lean();

  const ids = bookings.map((b) => String(b._id));
  const [prices, payments, reminders] = await Promise.all([
    listedPrices(key),
    ids.length
      ? RentPayment.find({ partnerPhoneDigits: key, bookingId: { $in: ids }, voidedAt: null })
        .select('bookingId period amount voidedAt')
        .lean()
      : [],
    lastRemindersFor(key, ids),
  ]);

  const paymentsBy = new Map();
  for (const p of payments) {
    if (!paymentsBy.has(p.bookingId)) paymentsBy.set(p.bookingId, []);
    paymentsBy.get(p.bookingId).push(p);
  }

  return bookings.map((booking) => {
    const id = String(booking._id);
    const terms = termsFor(booking, prices.get(priceKey(booking.propertyId, booking.shareType)));
    const periods = periodsFor(booking, {
      terms, payments: paymentsBy.get(id) || [], today, horizonDays,
    });
    return {
      booking,
      terms,
      periods,
      view: residentView(booking, terms, periods, reminders.get(id)),
    };
  });
};

/** One resident, any status — a past resident's receipts are still theirs. */
const loadResident = async (key, bookingId, { today = todayInIndia() } = {}) => {
  if (!mongoose.isValidObjectId(bookingId)) return null;
  const booking = await PartnerBooking.findOne({ _id: bookingId, partnerPhoneDigits: key }).lean();
  if (!booking) return null;

  const id = String(booking._id);
  const [prices, payments, reminders] = await Promise.all([
    listedPrices(key),
    RentPayment.find({ partnerPhoneDigits: key, bookingId: id }).sort({ paidOn: -1, createdAt: -1 }).lean(),
    RentReminder.find({ partnerPhoneDigits: key, bookingId: id }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);

  const terms = termsFor(booking, prices.get(priceKey(booking.propertyId, booking.shareType)));
  const periods = periodsFor(booking, { terms, payments, today });
  return {
    booking,
    terms,
    periods,
    payments,
    reminders,
    view: residentView(booking, terms, periods, reminders[0]),
  };
};

const settingsFor = async (key) => {
  const row = await RentSettings.findOne({ partnerPhoneDigits: key }).lean();
  return {
    ownerAlerts: row ? row.ownerAlerts !== false : true,
    daysBefore: row && Number.isFinite(row.daysBefore) ? row.daysBefore : 3,
  };
};

/** The headline numbers on the Rent tab. */
const overviewFor = async (key, { today = todayInIndia() } = {}) => {
  const rows = await loadResidents(key, { today });
  const month = monthOf(today);

  const [collected, beds] = await Promise.all([
    RentPayment.aggregate([
      { $match: { partnerPhoneDigits: key, voidedAt: null, paidOn: { $regex: `^${month}` } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    PartnerShareType.aggregate([
      { $match: { partnerPhoneDigits: key } },
      { $group: { _id: null, total: { $sum: '$totalBeds' }, free: { $sum: '$availableBeds' } } },
    ]),
  ]);

  const counts = {
    residents: rows.length,
    needsRent: 0,
    dueToday: 0,
    dueTodayAmount: 0,
    overdue: 0,
    overdueAmount: 0,
    upcoming: 0,
    upcomingAmount: 0,
  };

  for (const { terms, periods } of rows) {
    if (terms.source === 'none') counts.needsRent += 1;
    let late = false;
    for (const p of periods) {
      if (p.status === 'due') {
        counts.dueToday += 1;
        counts.dueTodayAmount += p.balance;
      } else if (p.status === 'overdue') {
        late = true;
        counts.overdueAmount += p.balance;
      } else if (p.status === 'upcoming' && p.daysUntil <= 7) {
        counts.upcoming += 1;
        counts.upcomingAmount += p.balance;
      }
    }
    if (late) counts.overdue += 1;
  }

  const bedRow = beds[0] || { total: 0, free: 0 };
  return {
    today,
    counts,
    collectedThisMonth: { amount: collected[0]?.total || 0, count: collected[0]?.count || 0, month },
    beds: {
      total: bedRow.total || 0,
      free: bedRow.free || 0,
      occupied: Math.max(0, (bedRow.total || 0) - (bedRow.free || 0)),
    },
  };
};

/**
 * Beds by property and room type, with who is in them.
 *
 * Counts come from `partner_share_types` (the one place a bed count lives —
 * offline guests the owner entered by hand included); names come from the
 * bookings. A resident whose room type has no bed count is listed under
 * `others` so nobody disappears from the screen.
 */
const vacancyFor = async (key) => {
  const [shareTypes, bookings] = await Promise.all([
    PartnerShareType.find({ partnerPhoneDigits: key }).sort({ propertyId: 1, name: 1 }).lean(),
    PartnerBooking.find({ partnerPhoneDigits: key, status: { $in: OCCUPYING } })
      .select('guestName roomNumber shareType propertyId propertyName checkInDate status')
      .sort({ roomNumber: 1, guestName: 1 })
      .lean(),
  ]);

  const names = new Map();
  for (const b of bookings) if (b.propertyName) names.set(b.propertyId, b.propertyName);
  const unnamed = [...new Set(shareTypes.map((s) => s.propertyId))]
    .filter((id) => !names.has(id) && mongoose.isValidObjectId(id));
  if (unnamed.length) {
    const Property = require('../properties/property.model');
    const rows = await Property.find({ _id: { $in: unnamed } }).select('name').lean();
    for (const row of rows) names.set(String(row._id), row.name);
  }

  const resident = (b) => ({
    id: String(b._id), guestName: b.guestName, roomNumber: b.roomNumber, checkInDate: b.checkInDate,
  });

  const properties = new Map();
  const propertyFor = (propertyId) => {
    if (!properties.has(propertyId)) {
      properties.set(propertyId, {
        propertyId,
        propertyName: names.get(propertyId) || 'Unassigned property',
        totalBeds: 0,
        freeBeds: 0,
        roomTypes: [],
        others: [],
      });
    }
    return properties.get(propertyId);
  };

  const typeById = new Map();
  for (const s of shareTypes) {
    const p = propertyFor(s.propertyId);
    const row = {
      shareTypeId: s.shareTypeId,
      name: s.name,
      monthlyPrice: s.monthlyPrice,
      totalBeds: s.totalBeds,
      freeBeds: s.availableBeds,
      occupiedBeds: Math.max(0, s.totalBeds - s.availableBeds),
      isAvailable: s.isAvailable !== false,
      residents: [],
    };
    p.totalBeds += s.totalBeds;
    p.freeBeds += s.availableBeds;
    p.roomTypes.push(row);
    typeById.set(s.shareTypeId, row);
  }

  for (const b of bookings) {
    const row = typeById.get(shareTypeIdForBooking(b));
    if (row) row.residents.push(resident(b));
    else propertyFor(b.propertyId).others.push(resident(b));
  }

  const list = [...properties.values()];
  return {
    totals: {
      totalBeds: list.reduce((n, p) => n + p.totalBeds, 0),
      freeBeds: list.reduce((n, p) => n + p.freeBeds, 0),
      occupiedBeds: list.reduce((n, p) => n + Math.max(0, p.totalBeds - p.freeBeds), 0),
      residents: bookings.length,
    },
    properties: list,
  };
};

module.exports = {
  loadResidents,
  loadResident,
  overviewFor,
  vacancyFor,
  settingsFor,
  reminderView,
};
