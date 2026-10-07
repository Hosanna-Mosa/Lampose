/* ══════════════════════════════════════════════════════════════════════════
   Dine-in — availability, booking, and every change a booking goes through.

   The HTTP layer (`dineIn.controller.js`) only reads requests and shapes
   replies; every rule a booking obeys is here or in `dineIn.rules.js`, so the
   sweeps, the controller and the tests all go through the same code.

   ## Who may do what, and until when

     diner        book            a free slot, today … +6 days, 30 min ahead
                  cancel          a request: any time before the sitting
                                  a confirmed table: until 30 min before
     restaurant   accept/decline  within 15 min of the request
                  cancel          a confirmed table, with a reason
                  arrived         from an hour before the sitting to its end
                  no-show         from 15 min after the sitting started
     system       expire          a request nobody answered in 15 min
                  cancel          bookings on a day the restaurant closes, or
                                  outside hours it has just changed

   ## Errors

   Every refusal is a `DineInError` with a code the apps can branch on and a
   sentence they can show as it is.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const TableBooking = require('./tableBooking.model');
const TableLedger = require('./tableLedger.model');
const rules = require('./dineIn.rules');
const notifier = require('./tableBooking.notifier');

const { ACTIVE_STATUSES, makeReference } = TableBooking;

class DineInError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const LISTED = { verificationStatus: 'approved', isActive: true };

/** Customers may hold this many upcoming bookings at once. */
const MAX_ACTIVE_PER_CUSTOMER = 5;

const MINUTE = 60 * 1000;

/* ── Shapes ──────────────────────────────────────────────────────────────── */

/** What a diner is told about a restaurant's floor. Null when it takes no bookings. */
const publicDineIn = (restaurant) => {
  const d = restaurant && restaurant.dineIn;
  if (!d || !d.enabled) return null;
  const tableTypes = (d.tableTypes || []).map((t) => ({ seats: t.seats, count: t.count }));
  return {
    available: rules.isBookable(restaurant),
    paused: Boolean(d.paused),
    seatingCapacity: d.seatingCapacity || 0,
    tableCount: d.tableCount || 0,
    tableTypes,
    maxPartySize: Math.min(rules.MAX_PARTY, rules.largestTable(tableTypes)),
    acSeating: d.acSeating || null,
    indoorSeating: d.indoorSeating === true,
    outdoorSeating: Boolean(d.outdoorSeating),
    familySeating: Boolean(d.familySeating),
    coupleSeating: Boolean(d.coupleSeating),
    smoking: d.smoking || null,
    wheelchairAccessible: Boolean(d.wheelchairAccessible),
    parkingAvailable: d.parkingAvailable === true,
    valetParking: Boolean(d.valetParking),
    kidsFriendly: Boolean(d.kidsFriendly),
    petFriendly: Boolean(d.petFriendly),
  };
};

/** The restaurant's own view of its settings, blocked days included. */
const settingsView = (restaurant) => {
  const d = (restaurant && restaurant.dineIn) || {};
  const today = rules.istDate();
  return {
    enabled: Boolean(d.enabled),
    paused: Boolean(d.paused),
    tableTypes: rules.normaliseTypes(d.tableTypes || []),
    tableCount: d.tableCount || 0,
    seatingCapacity: d.seatingCapacity || 0,
    acSeating: d.acSeating || null,
    indoorSeating: typeof d.indoorSeating === 'boolean' ? d.indoorSeating : null,
    outdoorSeating: Boolean(d.outdoorSeating),
    familySeating: Boolean(d.familySeating),
    coupleSeating: Boolean(d.coupleSeating),
    smoking: d.smoking || null,
    wheelchairAccessible: Boolean(d.wheelchairAccessible),
    parkingAvailable: typeof d.parkingAvailable === 'boolean' ? d.parkingAvailable : null,
    valetParking: Boolean(d.valetParking),
    kidsFriendly: Boolean(d.kidsFriendly),
    petFriendly: Boolean(d.petFriendly),
    blockedDates: (d.blockedDates || []).filter((date) => date >= today).sort(),
    blockedSlots: (d.blockedSlots || []).filter((s) => s.date >= today)
      .map((s) => ({ date: s.date, time: s.time }))
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    limits: {
      maxPartySize: rules.MAX_PARTY,
      maxSpareSeats: rules.MAX_SPARE_SEATS,
      daysAhead: rules.DAYS_AHEAD,
      slotMinutes: rules.SLOT_MINUTES,
      sittingMinutes: rules.HOLD_MINUTES,
      respondMinutes: rules.RESPOND_MINUTES,
    },
    updatedAt: d.updatedAt || null,
  };
};

/** A requested booking whose answer window has closed IS expired, sweep or no sweep. */
const effectiveStatus = (b, now = new Date()) => (
  b.status === 'requested' && new Date(b.respondBy) <= now ? 'expired' : b.status
);

const customerCanCancel = (b, now = new Date()) => {
  const status = effectiveStatus(b, now);
  if (status === 'requested') return new Date(b.startsAt) > now;
  if (status === 'confirmed') return new Date(b.startsAt).getTime() - now.getTime() >= rules.CUSTOMER_CANCEL_BEFORE * MINUTE;
  return false;
};

const restaurantActions = (b, now = new Date()) => {
  const status = effectiveStatus(b, now);
  const start = new Date(b.startsAt).getTime();
  const end = new Date(b.endsAt).getTime();
  const t = now.getTime();
  return {
    accept: status === 'requested',
    decline: status === 'requested',
    cancel: status === 'confirmed' && t < end,
    arrived: status === 'confirmed' && t >= start - (60 * MINUTE) && t < end,
    noShow: status === 'confirmed' && t >= start + (rules.GRACE_MINUTES * MINUTE) && t < end + (24 * 60 * MINUTE),
  };
};

const common = (b, now) => ({
  reference: b.reference,
  partySize: b.partySize,
  tableSeats: b.tableSeats,
  /* "A3", or null on a booking made before tables had numbers. */
  tableNumber: b.tableNumber || null,
  tableChosen: Boolean(b.tableChosen),
  date: b.date,
  time: b.time,
  dayLabel: rules.dayLabel(b.date, now),
  timeLabel: rules.clockLabel(b.time),
  startsAt: b.startsAt,
  endsAt: b.endsAt,
  guestName: b.guestName,
  guestPhone: b.guestPhone,
  forSomeoneElse: Boolean(b.forSomeoneElse),
  preference: { seating: b.preference?.seating || null, area: b.preference?.area || null },
  note: b.note || '',
  status: effectiveStatus(b, now),
  respondBy: b.respondBy,
  reason: b.reason || '',
  cancelledBy: b.cancelledBy || null,
  createdAt: b.createdAt,
});

const customerView = (b, now = new Date()) => ({
  ...common(b, now),
  restaurantId: b.restaurantId,
  restaurantName: b.restaurantName,
  restaurantPhone: b.restaurantPhone,
  restaurantAddress: b.restaurantAddress,
  canCancel: customerCanCancel(b, now),
});

const partnerView = (b, now = new Date()) => ({
  ...common(b, now),
  arrivedAt: b.arrivedAt || null,
  noShowAt: b.noShowAt || null,
  actions: restaurantActions(b, now),
});

/* ── The ledger ──────────────────────────────────────────────────────────── */

const ledgerFor = async (restaurantId, date) => {
  try {
    return await TableLedger.findOneAndUpdate(
      { restaurantId, date },
      { $setOnInsert: { restaurantId, date, version: 0, holds: [] } },
      { upsert: true, new: true },
    ).lean();
  } catch (error) {
    /* Two first bookings of the day raced to create it; the other one won. */
    if (error && error.code === 11000) return TableLedger.findOne({ restaurantId, date }).lean();
    throw error;
  }
};

/** Why an asked-for table cannot be had, in the diner's words. */
const TABLE_REFUSALS = {
  NO_SUCH_TABLE: ['BAD_TABLE', 400, (n) => `There is no table ${n} here. Pick one from the list, or any table.`],
  TABLE_TOO_SMALL: ['BAD_TABLE', 400, (n) => `Table ${n} does not seat your party. Pick a bigger table, or any table.`],
  TABLE_TOO_BIG: ['BAD_TABLE', 400, (n) => `Table ${n} is kept for bigger groups. Pick a smaller table, or any table.`],
  TABLE_TAKEN: ['TABLE_TAKEN', 409, (n) => `Table ${n} has just been booked for that time. Pick another table, or any table.`],
};

/**
 * Take a table for a sitting, or refuse. Compare-and-set on the ledger's
 * version — see `tableLedger.model.js`. `table` is the number the diner
 * asked for, or null for the smallest free table that seats the party.
 * Returns the table taken, `{ number, seats }`.
 */
const takeTable = async ({ restaurant, date, startMin, partySize, table = null, reference, expiresAt, now }) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const ledger = await ledgerFor(restaurant.restaurantId, date);
    const { table: taken, problem } = rules.tableFor({
      tableTypes: restaurant.dineIn.tableTypes, holds: ledger.holds, startMin, partySize, now, table,
    });
    if (!taken) {
      const refusal = table && TABLE_REFUSALS[problem];
      if (refusal) throw new DineInError(refusal[0], refusal[2](table), refusal[1]);
      throw new DineInError('SLOT_FULL', 'That time has just been booked. Please pick another slot.', 409);
    }
    const hold = {
      reference, table: taken.number, seats: taken.seats, startMin, endMin: startMin + rules.HOLD_MINUTES, expiresAt,
    };
    const result = await TableLedger.updateOne(
      { _id: ledger._id, version: ledger.version },
      { $push: { holds: hold }, $inc: { version: 1 } },
    );
    if (result.modifiedCount === 1) return taken;
  }
  throw new DineInError('BUSY', 'Lots of people are booking right now. Please try again.', 503);
};

const releaseTable = (restaurantId, date, reference) => TableLedger.updateOne(
  { restaurantId, date },
  { $pull: { holds: { reference } }, $inc: { version: 1 } },
);

/* ── Availability ────────────────────────────────────────────────────────── */

const loadListed = async (restaurantId) => {
  const restaurant = await FoodRestaurant.findOne({ restaurantId, ...LISTED })
    .select('restaurantId restaurantName partnerType contactNumber address openingHours dineIn')
    .lean();
  if (!restaurant || (restaurant.partnerType || 'food') !== 'food') {
    throw new DineInError('NOT_FOUND', 'We could not find that restaurant.', 404);
  }
  return restaurant;
};

const readParty = (value) => {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};

/**
 * The slot grid a diner chooses from.
 *
 * Always answers with the restaurant's floor and the bookable dates; `slots`
 * is empty and `reason` says why when nothing can be booked. With `time`
 * (one of the slots), `tables` lists the tables the party may pick at that
 * time — those seating it with at most MAX_SPARE_SEATS to spare — each with
 * whether it is free.
 */
const availability = async ({ restaurantId, date, guests, time, now = new Date() }) => {
  const restaurant = await loadListed(restaurantId);
  const dineIn = publicDineIn(restaurant);
  const dates = rules.bookableDates(now).map((d) => ({ date: d, label: rules.dayLabel(d, now) }));
  const chosen = rules.isDate(date) ? date : dates[0].date;
  const partySize = readParty(guests) || 2;
  const base = {
    restaurantId: restaurant.restaurantId,
    restaurantName: restaurant.restaurantName,
    contactNumber: restaurant.contactNumber || '',
    dineIn,
    dates,
    date: chosen,
    guests: partySize,
    slots: [],
    time: null,
    tables: [],
    reason: null,
  };

  if (!dineIn) return { ...base, reason: 'NOT_OFFERED' };
  if (dineIn.paused) return { ...base, reason: 'PAUSED' };
  if (!dates.some((d) => d.date === chosen)) return { ...base, reason: 'OUT_OF_RANGE' };
  if (partySize < 1) return { ...base, reason: 'BAD_PARTY' };
  if (partySize > dineIn.maxPartySize) return { ...base, reason: 'PARTY_TOO_LARGE' };
  if ((restaurant.dineIn.blockedDates || []).includes(chosen)) return { ...base, reason: 'CLOSED_THAT_DAY' };

  const ledger = await TableLedger.findOne({ restaurantId, date: chosen }).lean();
  const slots = rules.slotGrid({
    restaurant, date: chosen, partySize, holds: ledger ? ledger.holds : [], now,
  }).map(({ time, available }) => ({ time, label: rules.clockLabel(time), available }));

  if (!slots.length) return { ...base, reason: 'NO_SLOTS' };
  const reason = slots.some((s) => s.available) ? null : 'FULL';
  const asked = slots.find((s) => s.time === time);
  if (!asked) return { ...base, slots, reason };
  return {
    ...base,
    slots,
    reason,
    time: asked.time,
    tables: rules.tablesAt({
      tableTypes: restaurant.dineIn.tableTypes,
      holds: ledger ? ledger.holds : [],
      startMin: rules.toMinutes(asked.time),
      partySize,
      now,
    }),
  };
};

/* ── Booking ─────────────────────────────────────────────────────────────── */

const digitsOf = (value) => String(value || '').replace(/\D/g, '');

/** A 10-digit Indian mobile as `+91XXXXXXXXXX`, or null. */
const readMobile = (value) => {
  let digits = digitsOf(value);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
};

const addressLine = (a = {}) => [a.line1, a.line2, a.landmark, a.city].filter(Boolean).join(', ');

/**
 * Book a table. `customer` is the signed-in `app_customers` document.
 */
const createBooking = async ({ customer, body = {}, now = new Date() }) => {
  const restaurant = await loadListed(String(body.restaurantId || ''));
  const dineIn = publicDineIn(restaurant);
  if (!dineIn) throw new DineInError('NOT_OFFERED', 'This restaurant does not take table bookings.', 409);
  if (dineIn.paused) throw new DineInError('PAUSED', 'This restaurant is not taking table bookings right now.', 409);

  const { date, time } = body;
  if (!rules.isDate(date) || !rules.bookableDates(now).includes(date)) {
    throw new DineInError('BAD_DATE', `Pick a day from today to ${rules.DAYS_AHEAD - 1} days ahead.`);
  }
  const partySize = readParty(body.guests);
  if (!partySize || partySize < 1) throw new DineInError('BAD_PARTY', 'How many guests are coming?');
  if (partySize > dineIn.maxPartySize) {
    throw new DineInError('PARTY_TOO_LARGE', `Bookings here are for up to ${dineIn.maxPartySize} guests.`, 409);
  }
  if ((restaurant.dineIn.blockedDates || []).includes(date)) {
    throw new DineInError('CLOSED_THAT_DAY', 'The restaurant is not taking bookings that day.', 409);
  }
  /* On the grid, inside the lead time, and not marked full by the restaurant.
     Whether a TABLE is free is the ledger's question, asked in `takeTable`. */
  const slot = rules.slotGrid({ restaurant, date, partySize, holds: [], now }).find((s) => s.time === time);
  if (!slot) throw new DineInError('BAD_TIME', 'That time is not bookable. Please pick a slot from the list.');
  if (!slot.available) throw new DineInError('SLOT_FULL', 'That time is fully booked. Please pick another slot.', 409);

  /* Who is coming. */
  const forSomeoneElse = body.forSomeoneElse === true;
  const guestName = String(body.guestName || (forSomeoneElse ? '' : customer.name) || '').trim().slice(0, 60);
  if (guestName.length < 2) throw new DineInError('NAME_REQUIRED', 'Whose name should the table be under?');
  let guestPhone = customer.phone;
  if (forSomeoneElse) {
    guestPhone = readMobile(body.guestPhone);
    if (!guestPhone) throw new DineInError('BAD_PHONE', 'Enter the guest’s 10-digit mobile number.');
  }

  /* A wish, accepted only where the restaurant actually offers a choice. */
  const preference = { seating: null, area: null };
  if (dineIn.acSeating === 'both' && ['ac', 'non_ac'].includes(body.preference?.seating)) {
    preference.seating = body.preference.seating;
  }
  if (dineIn.indoorSeating && dineIn.outdoorSeating && ['indoor', 'outdoor'].includes(body.preference?.area)) {
    preference.area = body.preference.area;
  }

  const active = await TableBooking.find({
    customerId: customer.customerId, status: { $in: ACTIVE_STATUSES }, endsAt: { $gt: now },
  }).select('restaurantId date status respondBy').lean();
  const live = active.filter((b) => effectiveStatus(b, now) !== 'expired');
  if (live.some((b) => b.restaurantId === restaurant.restaurantId && b.date === date)) {
    throw new DineInError('ALREADY_BOOKED', 'You already have a table booked here that day.', 409);
  }
  if (live.length >= MAX_ACTIVE_PER_CUSTOMER) {
    throw new DineInError('TOO_MANY', `You can hold ${MAX_ACTIVE_PER_CUSTOMER} table bookings at a time.`, 409);
  }

  const reference = makeReference();
  const respondBy = new Date(now.getTime() + (rules.RESPOND_MINUTES * MINUTE));
  const startMin = rules.toMinutes(time);
  const startsAt = rules.instantOf(date, time);
  /* A table number asked for, or none ("any table"). */
  const askedTable = typeof body.table === 'string' && body.table.trim() ? body.table.trim() : null;
  const table = await takeTable({
    restaurant, date, startMin, partySize, table: askedTable, reference, expiresAt: respondBy, now,
  });

  let booking;
  try {
    booking = await TableBooking.create({
      reference,
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.restaurantName || '',
      restaurantPhone: restaurant.contactNumber || '',
      restaurantAddress: addressLine(restaurant.address),
      customerId: customer.customerId,
      customerName: customer.name || '',
      customerPhone: customer.phone || '',
      guestName,
      guestPhone,
      forSomeoneElse,
      partySize,
      tableSeats: table.seats,
      tableNumber: table.number,
      tableChosen: Boolean(askedTable),
      date,
      time,
      startsAt,
      endsAt: new Date(startsAt.getTime() + (rules.HOLD_MINUTES * MINUTE)),
      preference,
      note: String(body.note || '').trim().slice(0, 300),
      status: 'requested',
      respondBy,
    });
  } catch (error) {
    await releaseTable(restaurant.restaurantId, date, reference).catch(() => {});
    throw error;
  }

  notifier.notifyRestaurantOfRequest(booking.toObject()).catch(() => {});
  return booking.toObject();
};

/* ── Changes ─────────────────────────────────────────────────────────────── */

/** Move a booking from one status to another, only if it is still in `from`. */
const transition = (filter, set) => TableBooking.findOneAndUpdate(filter, { $set: set }, { new: true }).lean();

const findForRestaurant = async (restaurantId, reference) => {
  const booking = await TableBooking.findOne({ restaurantId, reference: String(reference || '') }).lean();
  if (!booking) throw new DineInError('NOT_FOUND', 'We could not find that booking.', 404);
  return booking;
};

const findForCustomer = async (customerId, reference) => {
  const booking = await TableBooking.findOne({ customerId, reference: String(reference || '') }).lean();
  if (!booking) throw new DineInError('NOT_FOUND', 'We could not find that booking.', 404);
  return booking;
};

const tooLate = (what) => new DineInError('NOT_ALLOWED', what, 409);

/**
 * One of the restaurant's buttons: accept, decline, cancel, arrived, no-show.
 */
const restaurantAction = async ({ restaurantId, reference, action, reason = '', now = new Date() }) => {
  const booking = await findForRestaurant(restaurantId, reference);
  const allowed = restaurantActions(booking, now);
  const why = String(reason || '').trim().slice(0, 300);
  const ref = { restaurantId, reference: booking.reference };

  if (action === 'accept') {
    if (!allowed.accept) throw tooLate('This request can no longer be accepted.');
    const updated = await transition(
      { ...ref, status: 'requested', respondBy: { $gt: new Date(now.getTime() + 5000) } },
      { status: 'confirmed', decidedAt: now },
    );
    if (!updated) throw tooLate('This request can no longer be accepted.');
    await TableLedger.updateOne(
      { restaurantId, date: booking.date, 'holds.reference': booking.reference },
      { $set: { 'holds.$.expiresAt': null }, $inc: { version: 1 } },
    );
    notifier.notifyCustomer(updated, 'confirmed').catch(() => {});
    return updated;
  }

  if (action === 'decline') {
    if (!allowed.decline) throw tooLate('This request can no longer be declined.');
    const updated = await transition(
      { ...ref, status: 'requested' },
      { status: 'declined', decidedAt: now, reason: why || 'The restaurant could not take this booking.' },
    );
    if (!updated) throw tooLate('This request can no longer be declined.');
    await releaseTable(restaurantId, booking.date, booking.reference);
    notifier.notifyCustomer(updated, 'declined').catch(() => {});
    return updated;
  }

  if (action === 'cancel') {
    if (!allowed.cancel) throw tooLate('This booking can no longer be cancelled.');
    if (why.length < 3) throw new DineInError('REASON_REQUIRED', 'Tell the guest why you are cancelling.');
    const updated = await transition(
      { ...ref, status: 'confirmed' },
      { status: 'cancelled', cancelledBy: 'restaurant', reason: why },
    );
    if (!updated) throw tooLate('This booking can no longer be cancelled.');
    await releaseTable(restaurantId, booking.date, booking.reference);
    notifier.notifyCustomer(updated, 'cancelled').catch(() => {});
    return updated;
  }

  if (action === 'arrived') {
    if (!allowed.arrived) throw tooLate('Guests can be marked arrived from an hour before their time.');
    const updated = await transition({ ...ref, status: 'confirmed' }, { status: 'arrived', arrivedAt: now });
    if (!updated) throw tooLate('This booking can no longer be marked arrived.');
    return updated;
  }

  if (action === 'no-show' || action === 'noShow') {
    if (!allowed.noShow) {
      throw tooLate(`A no-show can be marked ${rules.GRACE_MINUTES} minutes after the booked time.`);
    }
    const updated = await transition({ ...ref, status: 'confirmed' }, { status: 'no_show', noShowAt: now });
    if (!updated) throw tooLate('This booking can no longer be marked a no-show.');
    await releaseTable(restaurantId, booking.date, booking.reference);
    return updated;
  }

  throw new DineInError('BAD_ACTION', 'Unknown action.');
};

/** The diner cancels their own booking. */
const cancelByCustomer = async ({ customerId, reference, reason = '', now = new Date() }) => {
  const booking = await findForCustomer(customerId, reference);
  if (!customerCanCancel(booking, now)) {
    throw tooLate(
      effectiveStatus(booking, now) === 'confirmed'
        ? `Bookings can be cancelled up to ${rules.CUSTOMER_CANCEL_BEFORE} minutes before. Please call the restaurant.`
        : 'This booking can no longer be cancelled.',
    );
  }
  const updated = await transition(
    { customerId, reference: booking.reference, status: { $in: ACTIVE_STATUSES } },
    { status: 'cancelled', cancelledBy: 'customer', reason: String(reason || '').trim().slice(0, 300) },
  );
  if (!updated) throw tooLate('This booking can no longer be cancelled.');
  await releaseTable(booking.restaurantId, booking.date, booking.reference);
  notifier.notifyRestaurantOfCancel(updated).catch(() => {});
  return updated;
};

/** The system cancels — a day closed, or hours moved. Tells the diner. */
const cancelBySystem = async (booking, reason) => {
  const updated = await transition(
    { reference: booking.reference, status: { $in: ACTIVE_STATUSES } },
    { status: 'cancelled', cancelledBy: 'system', reason },
  );
  if (!updated) return null;
  await releaseTable(booking.restaurantId, booking.date, booking.reference);
  notifier.notifyCustomer(updated, 'cancelled').catch(() => {});
  return updated;
};

/* ── Lists ───────────────────────────────────────────────────────────────── */

const listForCustomer = async (customerId, now = new Date()) => {
  const rows = await TableBooking.find({ customerId }).sort({ startsAt: -1 }).limit(50).lean();
  return rows.map((b) => customerView(b, now));
};

/**
 * The restaurant's three lists, built from the last month and the week ahead:
 * requests waiting for an answer, tables still to come (or arriving now),
 * and everything finished.
 */
const listForRestaurant = async (restaurantId, now = new Date()) => {
  const since = new Date(now.getTime() - (30 * 24 * 60 * MINUTE));
  const rows = await TableBooking.find({ restaurantId, startsAt: { $gte: since } })
    .sort({ startsAt: 1 }).limit(400).lean();
  const requests = [];
  const upcoming = [];
  const past = [];
  const recentlyEnded = now.getTime() - (3 * 60 * MINUTE);
  for (const b of rows) {
    const status = effectiveStatus(b, now);
    if (status === 'requested') requests.push(b);
    else if (status === 'confirmed' && new Date(b.endsAt).getTime() > recentlyEnded) upcoming.push(b);
    else if (status === 'arrived' && b.date === rules.istDate(now)) upcoming.push(b);
    else past.push(b);
  }
  requests.sort((a, b) => new Date(a.respondBy) - new Date(b.respondBy));
  past.reverse();
  return {
    requests: requests.map((b) => partnerView(b, now)),
    upcoming: upcoming.map((b) => partnerView(b, now)),
    past: past.slice(0, 100).map((b) => partnerView(b, now)),
    counts: { requests: requests.length, upcoming: upcoming.length },
  };
};

/* ── Settings ────────────────────────────────────────────────────────────── */

/** Save the dine-in form. `restaurant` is the signed-in Mongoose document. */
const saveSettings = async (restaurant, body = {}) => {
  const previous = restaurant.dineIn && typeof restaurant.dineIn.toObject === 'function'
    ? restaurant.dineIn.toObject()
    : (restaurant.dineIn || {});
  const { settings, problems } = rules.buildSettings(body, previous);
  if (problems.length) {
    throw new DineInError('INVALID_SETTINGS', `Please fix: ${problems.join('; ')}.`, 400, { problems });
  }
  if (settings.enabled && !(restaurant.openingHours || []).length) {
    throw new DineInError('NO_HOURS', 'Add your opening hours first — table slots are made from them.', 409);
  }
  const today = rules.istDate();
  restaurant.dineIn = {
    ...settings,
    blockedDates: (previous.blockedDates || []).filter((d) => d >= today),
    blockedSlots: (previous.blockedSlots || []).filter((s) => s.date >= today),
    updatedAt: new Date(),
  };
  await restaurant.save();
  return settingsView(restaurant);
};

/** Pause or resume taking bookings — one switch, its own route. */
const setPaused = async (restaurant, paused) => {
  if (!restaurant.dineIn) restaurant.dineIn = {};
  restaurant.dineIn.paused = paused === true;
  restaurant.dineIn.updatedAt = new Date();
  await restaurant.save();
  return settingsView(restaurant);
};

/**
 * Close a whole day, or mark one half-hour full.
 *
 * A closed day cancels that day's bookings and tells each diner; a slot marked
 * full only stops new ones — the guests already booked there are still coming.
 */
const block = async (restaurant, { date, time } = {}, now = new Date()) => {
  const today = rules.istDate(now);
  if (!rules.isDate(date) || date < today || date > rules.addDays(today, 60)) {
    throw new DineInError('BAD_DATE', 'Pick a date from today to 60 days ahead.');
  }
  if (time !== undefined && time !== null && rules.toMinutes(time) === null) {
    throw new DineInError('BAD_TIME', 'Pick a time like 19:30.');
  }
  if (!restaurant.dineIn) restaurant.dineIn = {};
  let cancelled = 0;
  if (time) {
    const slots = restaurant.dineIn.blockedSlots || [];
    if (!slots.some((s) => s.date === date && s.time === time)) slots.push({ date, time });
    restaurant.dineIn.blockedSlots = slots;
    await restaurant.save();
  } else {
    const days = new Set(restaurant.dineIn.blockedDates || []);
    days.add(date);
    restaurant.dineIn.blockedDates = [...days];
    await restaurant.save();
    const affected = await TableBooking.find({
      restaurantId: restaurant.restaurantId, date, status: { $in: ACTIVE_STATUSES },
    }).lean();
    for (const booking of affected) {
      if (await cancelBySystem(booking, 'The restaurant is not taking table bookings that day.')) cancelled += 1;
    }
  }
  return { settings: settingsView(restaurant), cancelled };
};

const unblock = async (restaurant, { date, time } = {}) => {
  if (!restaurant.dineIn) return settingsView(restaurant);
  if (time) {
    restaurant.dineIn.blockedSlots = (restaurant.dineIn.blockedSlots || [])
      .filter((s) => !(s.date === date && s.time === time));
  } else {
    restaurant.dineIn.blockedDates = (restaurant.dineIn.blockedDates || []).filter((d) => d !== date);
  }
  await restaurant.save();
  return settingsView(restaurant);
};

/**
 * Opening hours just changed: cancel upcoming bookings that now fall outside
 * them. Called after the profile save, never allowed to fail it.
 */
const cancelOutsideHours = async (restaurant, now = new Date()) => {
  const upcoming = await TableBooking.find({
    restaurantId: restaurant.restaurantId, status: { $in: ACTIVE_STATUSES }, startsAt: { $gt: now },
  }).lean();
  let cancelled = 0;
  for (const booking of upcoming) {
    const times = rules.slotTimesFor(restaurant.openingHours, booking.date);
    if (!times.includes(booking.time)) {
      if (await cancelBySystem(booking, 'The restaurant changed its opening hours.')) cancelled += 1;
    }
  }
  return cancelled;
};

/* ── Sweeps ──────────────────────────────────────────────────────────────── */

/** Requests nobody answered: expire them, free the table, tell the diner. */
const sweepExpired = async (now = new Date()) => {
  const due = await TableBooking.find({ status: 'requested', respondBy: { $lte: now } }).limit(200).lean();
  let expired = 0;
  for (const booking of due) {
    const updated = await transition(
      { reference: booking.reference, status: 'requested' },
      { status: 'expired', decidedAt: now },
    );
    if (!updated) continue;
    expired += 1;
    await releaseTable(booking.restaurantId, booking.date, booking.reference).catch(() => {});
    notifier.notifyCustomer(updated, 'expired').catch(() => {});
  }
  return expired;
};

/** An hour before: one reminder per confirmed table, taken with a guarded update. */
const sweepReminders = async (now = new Date()) => {
  const soon = new Date(now.getTime() + (rules.REMINDER_BEFORE * MINUTE));
  const due = await TableBooking.find({
    status: 'confirmed', reminderSentAt: null, startsAt: { $gt: now, $lte: soon },
  }).limit(200).lean();
  let reminded = 0;
  for (const booking of due) {
    const taken = await transition(
      { reference: booking.reference, status: 'confirmed', reminderSentAt: null },
      { reminderSentAt: now },
    );
    if (!taken) continue;
    reminded += 1;
    notifier.notifyCustomer(taken, 'reminder').catch(() => {});
  }
  return reminded;
};

/**
 * Drop holds whose booking no longer holds a table — the belt to every
 * release's braces, should a release ever fail half-way.
 */
const sweepLedgers = async (now = new Date()) => {
  const since = rules.addDays(rules.istDate(now), -1);
  const ledgers = await TableLedger.find({ date: { $gte: since }, 'holds.0': { $exists: true } }).limit(500).lean();
  let dropped = 0;
  for (const ledger of ledgers) {
    const refs = ledger.holds.map((h) => h.reference);
    const live = await TableBooking.find({ reference: { $in: refs }, status: { $in: ACTIVE_STATUSES } })
      .select('reference').lean();
    const keep = new Set(live.map((b) => b.reference));
    const stale = refs.filter((r) => !keep.has(r));
    if (!stale.length) continue;
    await TableLedger.updateOne({ _id: ledger._id }, {
      $pull: { holds: { reference: { $in: stale } } }, $inc: { version: 1 },
    });
    dropped += stale.length;
  }
  return dropped;
};

const runSweeps = async (now = new Date()) => {
  const expired = await sweepExpired(now);
  const reminded = await sweepReminders(now);
  const dropped = await sweepLedgers(now);
  return { expired, reminded, dropped };
};

module.exports = {
  DineInError,
  publicDineIn,
  settingsView,
  customerView,
  partnerView,
  effectiveStatus,
  availability,
  createBooking,
  restaurantAction,
  cancelByCustomer,
  listForCustomer,
  listForRestaurant,
  findForCustomer,
  saveSettings,
  setPaused,
  block,
  unblock,
  cancelOutsideHours,
  sweepExpired,
  sweepReminders,
  sweepLedgers,
  runSweeps,
};
