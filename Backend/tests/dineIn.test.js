/* ══════════════════════════════════════════════════════════════════════════
   Dine-in — table bookings.

   The slot rules are pure and tested as such. Everything that decides who gets
   a table runs against a real Mongo (see helpers/db.js), because the property
   that matters — two diners can never both take the last table — is a
   property of a conditional update, and only a real server can show it.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const rules = require('../src/modules/dineIn/dineIn.rules');
const service = require('../src/modules/dineIn/tableBooking.service');
const TableBooking = require('../src/modules/dineIn/tableBooking.model');
const TableLedger = require('../src/modules/dineIn/tableLedger.model');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');

withDatabase();

/* A Tuesday morning in India. Today's first bookable slot is 11:00. */
const NOW = new Date('2026-10-06T10:00:00+05:30');
const TODAY = '2026-10-06';
const minutes = (n) => new Date(NOW.getTime() + (n * 60 * 1000));

const ALL_WEEK = rules.bookableDates(NOW).length && [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
].map((day) => ({ day, openTime: '11:00', closeTime: '23:00' }));

let phoneSeq = 0;
const makeRestaurant = async ({ tableTypes = [{ seats: 2, count: 1 }], dineIn = {}, hours = ALL_WEEK } = {}) => {
  phoneSeq += 1;
  const { settings } = rules.buildSettings({
    enabled: true, tableTypes, acSeating: 'both', indoorSeating: true, outdoorSeating: true, parkingAvailable: true,
    ...dineIn,
  });
  return FoodRestaurant.create({
    restaurantId: `FP-TEST${String(phoneSeq).padStart(4, '0')}`,
    restaurantName: 'Test Kitchen',
    ownerName: 'Owner',
    ownerPhone: `+9190000${String(phoneSeq).padStart(5, '0')}`,
    contactNumber: '+919000000000',
    verificationStatus: 'approved',
    isActive: true,
    partnerType: 'food',
    openingHours: hours,
    dineIn: settings,
  });
};

const diner = (n = 1) => ({ customerId: `CUST-${n}`, name: `Diner ${n}`, phone: `+91987654321${n}` });

const book = (restaurant, customer, extra = {}, now = NOW) => service.createBooking({
  customer,
  body: { restaurantId: restaurant.restaurantId, date: TODAY, time: '19:00', guests: 2, ...extra },
  now,
});

const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error.code === code);

/* ── Rules ───────────────────────────────────────────────────────────────── */

describe('slot times', () => {
  it('runs from opening to an hour before closing, on the half hour', () => {
    const times = rules.slotTimesFor([{ day: 'Tuesday', openTime: '11:00', closeTime: '23:00' }], TODAY);
    assert.equal(times[0], '11:00');
    assert.equal(times[times.length - 1], '22:00');
    assert.equal(times.length, 23);
  });

  it('starts at the next half hour after an opening on the quarter', () => {
    const times = rules.slotTimesFor([{ day: 'Tuesday', openTime: '11:15', closeTime: '14:00' }], TODAY);
    assert.deepEqual(times, ['11:30', '12:00', '12:30', '13:00']);
  });

  it('splits a late slot between its evening and the next small hours', () => {
    const hours = [{ day: 'Monday', openTime: '18:00', closeTime: '02:00' }];
    const monday = rules.slotTimesFor(hours, '2026-10-05');
    const tuesday = rules.slotTimesFor(hours, TODAY);
    assert.equal(monday[0], '18:00');
    assert.equal(monday[monday.length - 1], '23:30');
    assert.deepEqual(tuesday, ['00:00', '00:30', '01:00']);
  });

  it('has no slots on a day it is closed', () => {
    assert.deepEqual(rules.slotTimesFor([{ day: 'Monday', openTime: '11:00', closeTime: '23:00' }], TODAY), []);
  });
});

describe('settings', () => {
  it('derives capacity and table count, and numbers every table by its type\'s letter', () => {
    const { settings, problems } = rules.buildSettings({
      enabled: true,
      tableTypes: [{ seats: 4, count: 3 }, { seats: 2, count: 2 }, { seats: 4, count: 1 }],
      acSeating: 'ac', indoorSeating: true, parkingAvailable: false,
    });
    assert.deepEqual(problems, []);
    /* Two rows of four-seaters are two types now — inside and on the terrace. */
    assert.deepEqual(settings.tableTypes, [
      { seats: 4, count: 3, prefix: 'A', numbers: ['A1', 'A2', 'A3'] },
      { seats: 2, count: 2, prefix: 'B', numbers: ['B1', 'B2'] },
      { seats: 4, count: 1, prefix: 'C', numbers: ['C1'] },
    ]);
    assert.equal(settings.tableCount, 6);
    assert.equal(settings.seatingCapacity, 20);
  });

  it('keeps a renamed table and its own letter, and fills the rest', () => {
    const { settings, problems } = rules.buildSettings({
      tableTypes: [
        { seats: 2, count: 3, numbers: ['Window 1'] },
        { seats: 6, count: 2, prefix: 'vip' },
      ],
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(settings.tableTypes[0].numbers, ['Window 1', 'A1', 'A2']);
    assert.deepEqual(settings.tableTypes[1], { seats: 6, count: 2, prefix: 'VIP', numbers: ['VIP1', 'VIP2'] });
  });

  it('refuses a table number used twice, or one that is not a number', () => {
    assert.ok(rules.buildSettings({ tableTypes: [{ seats: 2, count: 1, numbers: ['T1'] }, { seats: 4, count: 1, numbers: ['t1'] }] })
      .problems.some((p) => p.includes('used twice')));
    assert.ok(rules.buildSettings({ tableTypes: [{ seats: 2, count: 1, numbers: ['#1!'] }] })
      .problems.some((p) => p.includes('table number')));
    assert.ok(rules.buildSettings({ tableTypes: [{ seats: 2, count: 1, prefix: 'A1' }] })
      .problems.some((p) => p.includes('letter')));
  });

  it('reads a floor saved before tables had numbers with the default letters', () => {
    assert.deepEqual(rules.normaliseTypes([{ seats: 3, count: 2 }, { seats: 4, count: 2 }]), [
      { seats: 3, count: 2, prefix: 'A', numbers: ['A1', 'A2'] },
      { seats: 4, count: 2, prefix: 'B', numbers: ['B1', 'B2'] },
    ]);
  });

  it('requires the floor only to switch dine-in on', () => {
    assert.deepEqual(rules.buildSettings({ enabled: false }).problems, []);
    const { problems } = rules.buildSettings({ enabled: true });
    assert.ok(problems.some((p) => p.includes('table type')));
    assert.ok(problems.some((p) => p.includes('AC')));
    assert.ok(problems.some((p) => p.includes('indoor')));
    assert.ok(problems.some((p) => p.includes('parking')));
  });

  it('refuses valet parking with no parking, and a floor with nowhere to sit', () => {
    const base = { enabled: true, tableTypes: [{ seats: 2, count: 1 }], acSeating: 'ac' };
    assert.ok(rules.buildSettings({ ...base, indoorSeating: true, parkingAvailable: false, valetParking: true })
      .problems.some((p) => p.includes('valet')));
    assert.ok(rules.buildSettings({ ...base, indoorSeating: false, outdoorSeating: false, parkingAvailable: true })
      .problems.some((p) => p.includes('somewhere')));
  });
});

describe('table choice', () => {
  const types = [{ seats: 2, count: 1 }, { seats: 4, count: 1 }];
  const tableAt = (args) => rules.tableFor({ tableTypes: types, holds: [], now: NOW, ...args }).table;

  it('gives a party the smallest free table that seats it', () => {
    assert.deepEqual(tableAt({ startMin: 1140, partySize: 2 }), { number: 'A1', seats: 2 });
    assert.deepEqual(tableAt({ startMin: 1140, partySize: 3 }), { number: 'B1', seats: 4 });
  });

  it('moves up a size when the small tables are held for the sitting', () => {
    const holds = [{ table: 'A1', seats: 2, startMin: 1110, endMin: 1200 }];
    assert.equal(tableAt({ holds, startMin: 1140, partySize: 2 }).number, 'B1');
    /* Ninety minutes later the two-seater is free again. */
    assert.equal(tableAt({ holds, startMin: 1200, partySize: 2 }).number, 'A1');
  });

  it('ignores a hold whose answer window has closed', () => {
    const holds = [{ table: 'A1', seats: 2, startMin: 1140, endMin: 1230, expiresAt: minutes(-1) }];
    assert.equal(tableAt({ holds, startMin: 1140, partySize: 2 }).number, 'A1');
  });

  it('counts a hold from before numbering against a table of its size', () => {
    const holds = [{ seats: 2, startMin: 1140, endMin: 1230 }];
    assert.equal(tableAt({ holds, startMin: 1140, partySize: 2 }).number, 'B1');
    assert.equal(rules.tableFor({ tableTypes: types, holds, startMin: 1140, partySize: 2, now: NOW, table: 'A1' }).problem, 'TABLE_TAKEN');
  });

  it('gives an asked-for table only if it fits the party with at most two seats spare, and is free', () => {
    const floor = [{ seats: 2, count: 1 }, { seats: 4, count: 1 }, { seats: 8, count: 1 }];
    const ask = (table, partySize, holds = []) => rules.tableFor({ tableTypes: floor, holds, startMin: 1140, partySize, now: NOW, table });
    assert.equal(ask('b1', 2).table.number, 'B1');
    assert.equal(ask('C1', 2).problem, 'TABLE_TOO_BIG');
    assert.equal(ask('A1', 3).problem, 'TABLE_TOO_SMALL');
    assert.equal(ask('Z9', 2).problem, 'NO_SUCH_TABLE');
    assert.equal(ask('B1', 2, [{ table: 'B1', seats: 4, startMin: 1110, endMin: 1200 }]).problem, 'TABLE_TAKEN');
  });

  it('lists the tables a party may pick at a time, free or not', () => {
    const floor = [{ seats: 2, count: 2 }, { seats: 4, count: 1 }, { seats: 8, count: 1 }];
    const holds = [{ table: 'A1', seats: 2, startMin: 1140, endMin: 1230 }];
    assert.deepEqual(rules.tablesAt({ tableTypes: floor, holds, startMin: 1170, partySize: 2, now: NOW }), [
      { number: 'A1', seats: 2, available: false },
      { number: 'A2', seats: 2, available: true },
      { number: 'B1', seats: 4, available: true },
    ]);
  });
});

/* ── Booking ─────────────────────────────────────────────────────────────── */

describe('booking a table', () => {
  it('requests a table and gives the restaurant 15 minutes to answer', async () => {
    const restaurant = await makeRestaurant();
    const booking = await book(restaurant, diner(1));
    assert.equal(booking.status, 'requested');
    assert.equal(booking.tableSeats, 2);
    assert.equal(booking.tableNumber, 'A1');
    assert.equal(booking.tableChosen, false);
    assert.equal(booking.guestName, 'Diner 1');
    assert.equal(new Date(booking.respondBy).getTime(), minutes(15).getTime());
    assert.match(booking.reference, /^TB-[A-Z2-9]{6}$/);
  });

  it('refuses the same table for an overlapping sitting, and frees it after one', async () => {
    const restaurant = await makeRestaurant();
    await book(restaurant, diner(1));
    await rejectsWith(book(restaurant, diner(2)), 'SLOT_FULL');
    await rejectsWith(book(restaurant, diner(3), { time: '20:00' }), 'SLOT_FULL');
    const later = await book(restaurant, diner(4), { time: '20:30' });
    assert.equal(later.status, 'requested');
  });

  it('lets exactly one of two diners racing for the last table have it', async () => {
    const restaurant = await makeRestaurant();
    const results = await Promise.allSettled([
      book(restaurant, diner(1)), book(restaurant, diner(2)), book(restaurant, diner(3)),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const ledger = await TableLedger.findOne({ restaurantId: restaurant.restaurantId, date: TODAY }).lean();
    assert.equal(ledger.holds.length, 1);
  });

  it('refuses a party larger than any table, without sending anyone to a phone', async () => {
    const restaurant = await makeRestaurant({ tableTypes: [{ seats: 4, count: 2 }] });
    await assert.rejects(book(restaurant, diner(1), { guests: 5 }), (error) => (
      error.code === 'PARTY_TOO_LARGE' && !/call/i.test(error.message)
    ));
  });

  it('books the table a diner picked, and refuses it to the next diner at that time', async () => {
    const restaurant = await makeRestaurant({ tableTypes: [{ seats: 2, count: 2 }] });
    const first = await book(restaurant, diner(1), { table: 'A2' });
    assert.equal(first.tableNumber, 'A2');
    assert.equal(first.tableChosen, true);
    await rejectsWith(book(restaurant, diner(2), { table: 'a2' }), 'TABLE_TAKEN');
    /* Any table still gets the other one. */
    assert.equal((await book(restaurant, diner(2))).tableNumber, 'A1');
  });

  it('refuses a table that does not exist or is far too big for the party', async () => {
    const restaurant = await makeRestaurant({ tableTypes: [{ seats: 2, count: 1 }, { seats: 8, count: 1 }] });
    await rejectsWith(book(restaurant, diner(1), { table: 'Q7' }), 'BAD_TABLE');
    await rejectsWith(book(restaurant, diner(1), { table: 'B1' }), 'BAD_TABLE');
  });

  it('lists the free tables for a time a diner is looking at', async () => {
    const restaurant = await makeRestaurant({ tableTypes: [{ seats: 2, count: 2 }] });
    await book(restaurant, diner(1), { table: 'A1' });
    const grid = await service.availability({
      restaurantId: restaurant.restaurantId, date: TODAY, guests: 2, time: '19:00', now: NOW,
    });
    assert.equal(grid.time, '19:00');
    assert.deepEqual(grid.tables, [
      { number: 'A1', seats: 2, available: false },
      { number: 'A2', seats: 2, available: true },
    ]);
    const noTime = await service.availability({ restaurantId: restaurant.restaurantId, date: TODAY, guests: 2, now: NOW });
    assert.deepEqual(noTime.tables, []);
  });

  it('refuses a time inside the lead time, outside the hours, or past the week', async () => {
    const restaurant = await makeRestaurant();
    await rejectsWith(book(restaurant, diner(1), { time: '10:00' }), 'BAD_TIME');
    await rejectsWith(book(restaurant, diner(1), { time: '23:00' }), 'BAD_TIME');
    await rejectsWith(book(restaurant, diner(1), { date: rules.addDays(TODAY, 7) }), 'BAD_DATE');
  });

  it('refuses a second table at the same restaurant the same day', async () => {
    const restaurant = await makeRestaurant({ tableTypes: [{ seats: 2, count: 3 }] });
    await book(restaurant, diner(1));
    await rejectsWith(book(restaurant, diner(1), { time: '13:00' }), 'ALREADY_BOOKED');
  });

  it('takes nothing while the restaurant has paused bookings', async () => {
    const restaurant = await makeRestaurant({ dineIn: { paused: true } });
    await rejectsWith(book(restaurant, diner(1)), 'PAUSED');
    const slots = await service.availability({ restaurantId: restaurant.restaurantId, date: TODAY, guests: 2, now: NOW });
    assert.equal(slots.reason, 'PAUSED');
  });

  it('keeps the seating preference only where the restaurant offers the choice', async () => {
    const restaurant = await makeRestaurant({ dineIn: { acSeating: 'ac', outdoorSeating: false } });
    const booking = await book(restaurant, diner(1), { preference: { seating: 'non_ac', area: 'outdoor' } });
    assert.deepEqual({ ...booking.preference }, { seating: null, area: null });
  });
});

describe('the restaurant’s answer', () => {
  it('an unanswered request stops holding its table when the window closes', async () => {
    const restaurant = await makeRestaurant();
    await book(restaurant, diner(1));
    const after = minutes(16);
    const slots = await service.availability({ restaurantId: restaurant.restaurantId, date: TODAY, guests: 2, now: after });
    assert.equal(slots.slots.find((s) => s.time === '19:00').available, true);

    assert.equal(await service.sweepExpired(after), 1);
    const [row] = await TableBooking.find({}).lean();
    assert.equal(row.status, 'expired');
    const ledger = await TableLedger.findOne({ restaurantId: restaurant.restaurantId }).lean();
    assert.equal(ledger.holds.length, 0);
  });

  it('accepting keeps the table held for good', async () => {
    const restaurant = await makeRestaurant();
    const booking = await book(restaurant, diner(1));
    const confirmed = await service.restaurantAction({
      restaurantId: restaurant.restaurantId, reference: booking.reference, action: 'accept', now: minutes(5),
    });
    assert.equal(confirmed.status, 'confirmed');
    const slots = await service.availability({ restaurantId: restaurant.restaurantId, date: TODAY, guests: 2, now: minutes(60) });
    assert.equal(slots.slots.find((s) => s.time === '19:00').available, false);
  });

  it('cannot accept after the window, and declining frees the table', async () => {
    const restaurant = await makeRestaurant();
    const first = await book(restaurant, diner(1));
    await rejectsWith(service.restaurantAction({
      restaurantId: restaurant.restaurantId, reference: first.reference, action: 'accept', now: minutes(20),
    }), 'NOT_ALLOWED');

    await TableBooking.deleteMany({});
    await TableLedger.deleteMany({});
    const second = await book(restaurant, diner(2));
    const declined = await service.restaurantAction({
      restaurantId: restaurant.restaurantId, reference: second.reference, action: 'decline', reason: 'Private event', now: minutes(1),
    });
    assert.equal(declined.status, 'declined');
    assert.equal(declined.reason, 'Private event');
    const again = await book(restaurant, diner(3), {}, minutes(2));
    assert.equal(again.status, 'requested');
  });

  it('marks a no-show only after the grace period, and arrived from an hour before', async () => {
    const restaurant = await makeRestaurant();
    const booking = await book(restaurant, diner(1), { time: '11:00' });
    await service.restaurantAction({ restaurantId: restaurant.restaurantId, reference: booking.reference, action: 'accept', now: minutes(1) });
    const at11 = new Date(`${TODAY}T11:00:00+05:30`);
    const plus = (n) => new Date(at11.getTime() + (n * 60 * 1000));
    await rejectsWith(service.restaurantAction({
      restaurantId: restaurant.restaurantId, reference: booking.reference, action: 'no-show', now: plus(10),
    }), 'NOT_ALLOWED');
    const noShow = await service.restaurantAction({
      restaurantId: restaurant.restaurantId, reference: booking.reference, action: 'no-show', now: plus(16),
    });
    assert.equal(noShow.status, 'no_show');
  });

  it('a restaurant must say why it cancels a confirmed table', async () => {
    const restaurant = await makeRestaurant();
    const booking = await book(restaurant, diner(1));
    await service.restaurantAction({ restaurantId: restaurant.restaurantId, reference: booking.reference, action: 'accept', now: minutes(1) });
    await rejectsWith(service.restaurantAction({
      restaurantId: restaurant.restaurantId, reference: booking.reference, action: 'cancel', now: minutes(2),
    }), 'REASON_REQUIRED');
    const cancelled = await service.restaurantAction({
      restaurantId: restaurant.restaurantId, reference: booking.reference, action: 'cancel', reason: 'Kitchen fire drill', now: minutes(2),
    });
    assert.equal(cancelled.cancelledBy, 'restaurant');
  });
});

describe('the diner cancelling', () => {
  it('can cancel a confirmed table until 30 minutes before, not after', async () => {
    const restaurant = await makeRestaurant();
    const booking = await book(restaurant, diner(1), { time: '11:00' });
    await service.restaurantAction({ restaurantId: restaurant.restaurantId, reference: booking.reference, action: 'accept', now: minutes(1) });
    await rejectsWith(service.cancelByCustomer({ customerId: 'CUST-1', reference: booking.reference, now: minutes(45) }), 'NOT_ALLOWED');
    const cancelled = await service.cancelByCustomer({ customerId: 'CUST-1', reference: booking.reference, now: minutes(20) });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelledBy, 'customer');
  });

  it('cannot read or cancel somebody else’s booking', async () => {
    const restaurant = await makeRestaurant();
    const booking = await book(restaurant, diner(1));
    await rejectsWith(service.cancelByCustomer({ customerId: 'CUST-2', reference: booking.reference, now: NOW }), 'NOT_FOUND');
  });
});

describe('days and hours the restaurant changes', () => {
  it('closing a day cancels its bookings; marking a slot full keeps them', async () => {
    await makeRestaurant({ tableTypes: [{ seats: 2, count: 2 }] });
    const doc = await FoodRestaurant.findOne({});
    const booking = await book(doc, diner(1));
    await book(doc, diner(2), { time: '13:00' });

    const slot = await service.block(doc, { date: TODAY, time: '19:00' }, NOW);
    assert.equal(slot.cancelled, 0);
    assert.equal((await TableBooking.findOne({ reference: booking.reference }).lean()).status, 'requested');

    const day = await service.block(doc, { date: TODAY }, NOW);
    assert.equal(day.cancelled, 2);
    const rows = await TableBooking.find({}).lean();
    assert.ok(rows.every((r) => r.status === 'cancelled' && r.cancelledBy === 'system'));
  });

  it('new hours cancel the bookings left outside them, and only those', async () => {
    await makeRestaurant({ tableTypes: [{ seats: 2, count: 2 }] });
    const doc = await FoodRestaurant.findOne({});
    const lunch = await book(doc, diner(1), { time: '12:00' });
    const dinner = await book(doc, diner(2), { time: '20:00' });
    doc.openingHours = ALL_WEEK.map((h) => ({ ...h, closeTime: '15:00' }));
    await doc.save();
    assert.equal(await service.cancelOutsideHours(doc, NOW), 1);
    assert.equal((await TableBooking.findOne({ reference: lunch.reference }).lean()).status, 'requested');
    assert.equal((await TableBooking.findOne({ reference: dinner.reference }).lean()).status, 'cancelled');
  });

  it('saves a settings form, and refuses switching on with no opening hours', async () => {
    await makeRestaurant({ hours: [] });
    const doc = await FoodRestaurant.findOne({});
    await rejectsWith(service.saveSettings(doc, { enabled: true }), 'NO_HOURS');
    const saved = await service.saveSettings(doc, { enabled: false, tableTypes: [{ seats: 6, count: 2 }] });
    assert.equal(saved.seatingCapacity, 12);
    assert.equal(saved.enabled, false);
  });
});
