/* ══════════════════════════════════════════════════════════════════════════
   Rent: which months a resident owes, worked out from dates.

   What must hold:
     - the first month is due on check-in, later months on the due day,
       clamped to short months
     - partial payments add up; a month is paid only when nothing is left
     - a check-out date ends the months
     - raising the rent does not reopen months already settled
     - rent payments never touch the booking's payout fields
     - the morning alert is sent once per owner per day
   ══════════════════════════════════════════════════════════════════════════ */
const {
  describe, it, before, after,
} = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const { PartnerBooking, PartnerNotification } = require('../src/modules/partners/partnerDomains.model');
const { RentPayment } = require('../src/modules/rent/rent.model');
const {
  termsFor, periodsFor, summarise, addDays,
} = require('../src/modules/rent/rent.ledger');
const createApp = require('../app');
const Partner = require('../src/modules/partners/partner.model');
const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');
const { todayInIndia } = require('../src/modules/partners/bookingStage.util');
const { loadResidents, overviewFor } = require('../src/modules/rent/rent.service');
const { runDigest } = require('../src/modules/rent/rent.worker');

withDatabase();

const KEY = '9876543210';

const booking = (over = {}) => ({
  _id: 'b1',
  status: 'in_house',
  category: 'PG_HOSTEL',
  source: 'manual',
  checkInDate: '2026-01-31',
  checkOutDate: '',
  totalAmount: 6000,
  ...over,
});

const ledger = (b, today, payments = []) => periodsFor(b, { terms: termsFor(b), payments, today });

describe('rent ledger — due dates', () => {
  it('starts on check-in and clamps later months to their length', () => {
    const periods = ledger(booking(), '2026-04-10');
    assert.deepEqual(
      periods.map((p) => p.dueDate).slice(0, 4),
      ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'],
    );
  });

  it('uses the owner’s due day after the first month', () => {
    const periods = ledger(booking({ checkInDate: '2026-01-20', rent: { dueDay: 5 } }), '2026-03-10');
    assert.deepEqual(periods.map((p) => p.dueDate).slice(0, 3), ['2026-01-20', '2026-02-05', '2026-03-05']);
  });

  it('labels overdue, due and upcoming from today', () => {
    const periods = ledger(booking({ checkInDate: '2026-03-10' }), '2026-04-10');
    assert.equal(periods[0].status, 'overdue');
    assert.equal(periods[0].daysLate, 31);
    assert.equal(periods[1].status, 'due');
    assert.equal(periods[2].status, 'upcoming');
    assert.equal(periods[2].daysUntil, 30);
  });

  it('stops at the check-out date', () => {
    const periods = ledger(booking({ checkInDate: '2026-01-10', checkOutDate: '2026-03-10' }), '2026-06-01');
    assert.deepEqual(periods.map((p) => p.period), ['2026-01', '2026-02']);
  });

  it('lays out nothing for a hotel stay or an unknown rent', () => {
    assert.equal(ledger(booking({ category: 'HOTEL' }), '2026-04-10').length, 0);
    assert.equal(ledger(booking({ totalAmount: 0 }), '2026-04-10').length, 0);
  });
});

describe('rent ledger — payments', () => {
  it('adds partial payments up, and pays a month only when nothing is left', () => {
    const b = booking({ checkInDate: '2026-03-10' });
    const half = ledger(b, '2026-03-20', [{ period: '2026-03', amount: 2500 }]);
    assert.equal(half[0].status, 'overdue');
    assert.equal(half[0].isPartial, true);
    assert.equal(half[0].balance, 3500);

    const full = ledger(b, '2026-03-20', [
      { period: '2026-03', amount: 2500 },
      { period: '2026-03', amount: 3500 },
    ]);
    assert.equal(full[0].status, 'paid');
  });

  it('ignores a voided payment', () => {
    const periods = ledger(booking({ checkInDate: '2026-03-10' }), '2026-03-20', [
      { period: '2026-03', amount: 6000, voidedAt: new Date() },
    ]);
    assert.equal(periods[0].status, 'overdue');
  });

  it('keeps settled months at the old rent after a raise', () => {
    const b = booking({
      checkInDate: '2026-01-10',
      rent: { schedule: [{ from: '0000-00', amount: 6000 }, { from: '2026-03', amount: 7000 }] },
    });
    const periods = ledger(b, '2026-03-10', [
      { period: '2026-01', amount: 6000 },
      { period: '2026-02', amount: 6000 },
    ]);
    assert.equal(periods[0].status, 'paid');
    assert.equal(periods[1].status, 'paid');
    assert.equal(periods[2].amount, 7000);
  });

  it('summarises the worst month as the headline', () => {
    const summary = summarise(ledger(booking({ checkInDate: '2026-03-10' }), '2026-04-10'));
    assert.equal(summary.status, 'overdue');
    assert.equal(summary.outstanding, 12000);
    assert.equal(summary.overdueMonths, 1);
    assert.equal(summary.nextDue.dueDate, '2026-05-10');
  });
});

const makeResident = (over = {}) => PartnerBooking.create({
  partnerPhoneDigits: KEY,
  propertyId: 'p1',
  propertyName: 'Sunrise PG',
  category: 'PG_HOSTEL',
  guestName: 'Ravi',
  guestPhone: '9000000001',
  roomNumber: '101',
  shareType: 'Single',
  checkInDate: '2026-03-10',
  status: 'in_house',
  totalAmount: 6000,
  paidAmount: 0,
  source: 'manual',
  ...over,
});

describe('rent service', () => {
  it('counts residents, dues and this month’s collections', async () => {
    const ravi = await makeResident();
    await makeResident({ guestName: 'Hotel guest', category: 'HOTEL' });
    await RentPayment.create({
      partnerPhoneDigits: KEY, bookingId: String(ravi._id), guestName: 'Ravi',
      period: '2026-03', amount: 6000, paidOn: '2026-04-02', mode: 'upi', receiptNo: 'LR2604-AAAAA',
    });

    const rows = await loadResidents(KEY, { today: '2026-04-10' });
    assert.equal(rows.length, 1, 'a hotel guest has no rent month');

    const { counts, collectedThisMonth } = await overviewFor(KEY, { today: '2026-04-10' });
    assert.equal(counts.residents, 1);
    assert.equal(counts.dueToday, 1);
    assert.equal(counts.overdue, 0);
    assert.equal(collectedThisMonth.amount, 6000);
  });

  it('never writes rent into the payout fields', async () => {
    const ravi = await makeResident();
    await RentPayment.create({
      partnerPhoneDigits: KEY, bookingId: String(ravi._id), guestName: 'Ravi',
      period: '2026-03', amount: 6000, paidOn: '2026-03-10', receiptNo: 'LR2603-BBBBB',
    });
    const after = await PartnerBooking.findById(ravi._id).lean();
    assert.equal(after.paidAmount, 0);
    assert.equal(after.payoutId, null);
  });
});

describe('rent morning alert', () => {
  it('tells an owner once per day', async () => {
    await makeResident({ checkInDate: '2026-03-10' });
    const now = new Date('2026-04-10T05:00:00Z');

    const firstRun = await runDigest({ now });
    const secondRun = await runDigest({ now });
    assert.equal(firstRun.sent, 1);
    assert.equal(secondRun.sent, 0);

    const rows = await PartnerNotification.find({ partnerPhoneDigits: KEY, title: 'Rent today' }).lean();
    assert.equal(rows.length, 1);
    assert.match(rows[0].message, /1 due today/);
  });
});

/* ── Over HTTP: the routes the app calls ──────────────────────────────────── */

describe('rent routes', () => {
  let server;
  let base;
  before(async () => {
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { await new Promise((resolve) => server.close(resolve)); });

  const call = async (method, path, token, body) => {
    const response = await fetch(`${base}/api/v2/partners/rent${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };

  const owner = async (n) => {
    const doc = await Partner.create({
      partnerId: `par_rent_${n}`, phone: `+91 9876543${String(n).padStart(3, '0')}`, name: `Owner ${n}`,
      phoneVerifiedAt: new Date(),
    });
    return { doc, token: signPartnerToken(doc), key: doc.phoneDigits || Partner.phoneKey(doc.phone) };
  };

  it('records a partial payment, refuses too much, and voids', async () => {
    const a = await owner(1);
    const today = todayInIndia();
    const ravi = await makeResident({ partnerPhoneDigits: a.key, checkInDate: addDays(today, -3) });
    const id = String(ravi._id);

    const detail = await call('GET', `/residents/${id}`, a.token);
    assert.equal(detail.status, 200);
    const month = detail.body.data.periods.find((p) => p.status === 'overdue');
    assert.ok(month, 'check-in three days ago is an overdue first month');

    const tooMuch = await call('POST', `/residents/${id}/payments`, a.token, { period: month.period, amount: 7000 });
    assert.equal(tooMuch.status, 409);
    assert.equal(tooMuch.body.code, 'MORE_THAN_OWED');

    const future = await call('POST', `/residents/${id}/payments`, a.token, {
      period: month.period, amount: 100, paidOn: addDays(today, 2),
    });
    assert.equal(future.status, 400);

    const part = await call('POST', `/residents/${id}/payments`, a.token, {
      period: month.period, amount: 2500, mode: 'upi',
    });
    assert.equal(part.status, 201);
    assert.match(part.body.data.receiptNo, /^LR\d{4}-[A-Z2-9]{5}$/);

    const dues = await call('GET', '/dues', a.token);
    assert.equal(dues.body.total, 3500);
    assert.equal(dues.body.data[0].summary.hasPartial, true);

    const receipt = await call('GET', `/payments/${part.body.data.id}`, a.token);
    assert.equal(receipt.body.data.receivedBy.name, 'Owner 1');

    const voided = await call('POST', `/payments/${part.body.data.id}/void`, a.token, { reason: 'mistake' });
    assert.equal(voided.status, 200);
    const again = await call('GET', '/dues', a.token);
    assert.equal(again.body.total, 6000);
  });

  it('keeps one owner out of another owner’s residents', async () => {
    const a = await owner(2);
    const b = await owner(3);
    const ravi = await makeResident({ partnerPhoneDigits: a.key });
    const peek = await call('GET', `/residents/${ravi._id}`, b.token);
    assert.equal(peek.status, 404);
    const pay = await call('POST', `/residents/${ravi._id}/payments`, b.token, { period: '2026-03', amount: 1 });
    assert.equal(pay.status, 404);
  });

  it('sets terms, logs reminders and saves alert settings', async () => {
    const a = await owner(4);
    const ravi = await makeResident({ partnerPhoneDigits: a.key, totalAmount: 0, source: 'request' });
    const id = String(ravi._id);

    const before = await call('GET', `/residents/${id}`, a.token);
    assert.equal(before.body.data.rent.source, 'none');

    const bad = await call('PATCH', `/residents/${id}/terms`, a.token, { dueDay: 31 });
    assert.equal(bad.status, 400);

    const set = await call('PATCH', `/residents/${id}/terms`, a.token, { monthly: 5500, dueDay: 5 });
    assert.equal(set.status, 200);
    assert.equal(set.body.data.rent.monthly, 5500);
    assert.equal(set.body.data.rent.dueDay, 5);

    const logged = await call('POST', `/residents/${id}/reminders`, a.token, { channel: 'whatsapp' });
    assert.equal(logged.status, 201);
    const reminders = await call('GET', '/reminders', a.token);
    assert.equal(reminders.body.data.recent.length, 1);

    const settings = await call('PATCH', '/settings', a.token, { ownerAlerts: false, daysBefore: 5 });
    assert.deepEqual(settings.body.data, { ownerAlerts: false, daysBefore: 5 });

    for (const path of ['/overview', '/residents', '/upcoming?days=30', '/payments', '/vacancy']) {
      const res = await call('GET', path, a.token);
      assert.equal(res.status, 200, path);
    }
  });
});
