/* ══════════════════════════════════════════════════════════════════════════
   Which rent months a resident owes, worked out from dates — never stored.

   Pure: no database, no clock. The caller passes `today` (India's date, from
   `todayInIndia`) so one request reads one calendar, and the tests can stand
   on any day they like.

   ## The rules

   - The first month falls due on the CHECK-IN date. Every later month falls
     due on the owner's due day, or the check-in day of the month if none was
     set — clamped to the month's length, so a 31st check-in pays on the 30th
     in April and the 28th/29th in February.
   - A month is named by the calendar month it falls due in (`YYYY-MM`).
   - Months stop at the check-out date, when there is one. An open-ended stay
     is laid out to `horizonDays` past today, so "upcoming" has something in it.
   - Payments are counted against the month the owner recorded them for.
     Several payments to one month is a partial payment made good later.

   Statuses: `paid` (nothing left), `upcoming` (falls due after today),
   `due` (falls due today), `overdue` (fell due before today, still owing).
   A month can be `upcoming`, `due` or `overdue` AND partial — `isPartial`
   says so separately, because "₹3,000 of ₹6,000, 4 days late" needs both.
   ══════════════════════════════════════════════════════════════════════════ */

/* Categories priced by the night. A hotel guest has no rent month. */
const NOT_MONTHLY = ['HOTEL'];

const pad = (n) => String(n).padStart(2, '0');

const parseYmd = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
};

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

const dayNumber = (ymd) => {
  const p = parseYmd(ymd);
  return p ? Date.UTC(p.y, p.m - 1, p.d) / 86_400_000 : NaN;
};

const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);

const addDays = (ymd, days) => {
  const d = new Date((dayNumber(ymd) + days) * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const shiftMonth = (y, m, by) => {
  const total = y * 12 + (m - 1) + by;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
};

const monthOf = (ymd) => String(ymd || '').slice(0, 7);

const isMonthlyStay = (booking) => !NOT_MONTHLY.includes(String(booking?.category || ''));

/**
 * What this resident pays, and where that figure came from.
 *
 * `source` lets the app say "from your listing — confirm it" instead of
 * presenting a guess as an agreement:
 *   set      the owner set it on the Rent tab
 *   booking  the "Rent / amount" typed when a walk-in was added
 *   listing  the listed monthly price of their room type
 *   none     nothing known; the resident needs a rent before any month is due
 */
const termsFor = (booking, listedPrice = 0) => {
  const schedule = Array.isArray(booking?.rent?.schedule)
    ? [...booking.rent.schedule].sort((a, b) => String(a.from).localeCompare(String(b.from)))
    : [];
  const checkIn = parseYmd(booking?.checkInDate);
  const dueDay = Number(booking?.rent?.dueDay) || null;
  const effectiveDueDay = dueDay || (checkIn ? checkIn.d : 1);

  if (schedule.length) {
    const amountFor = (period) => {
      let amount = schedule[0].amount;
      for (const step of schedule) if (step.from <= period) amount = step.amount;
      return Number(amount) || 0;
    };
    return {
      source: 'set',
      monthly: Number(schedule[schedule.length - 1].amount) || 0,
      amountFor,
      dueDay,
      effectiveDueDay,
    };
  }

  const typed = booking?.source === 'manual' ? Number(booking?.totalAmount) || 0 : 0;
  const listed = Number(listedPrice) || 0;
  const monthly = typed > 0 ? typed : listed > 0 ? listed : 0;
  const source = typed > 0 ? 'booking' : listed > 0 ? 'listing' : 'none';
  return { source, monthly, amountFor: () => monthly, dueDay, effectiveDueDay };
};

/**
 * The resident's rent months, oldest first.
 *
 * `payments` may hold any of this resident's payments; voided ones are
 * ignored. At most `maxPeriods` months are returned — the most recent ones —
 * so a stay from years ago does not lay out hundreds of rows.
 */
const periodsFor = (booking, {
  terms, payments = [], today, horizonDays = 45, maxPeriods = 24,
}) => {
  const checkIn = parseYmd(booking?.checkInDate);
  if (!checkIn || !terms || terms.monthly <= 0 || !isMonthlyStay(booking)) return [];
  if (booking?.status === 'cancelled') return [];

  const until = addDays(today, horizonDays);
  const checkOut = parseYmd(booking?.checkOutDate) ? booking.checkOutDate : null;

  const live = payments.filter((p) => !p.voidedAt);
  const periods = [];

  for (let k = 0; k < 600; k += 1) {
    const { y, m } = shiftMonth(checkIn.y, checkIn.m, k);
    const dueDate = k === 0
      ? booking.checkInDate
      : `${y}-${pad(m)}-${pad(Math.min(terms.effectiveDueDay, daysInMonth(y, m)))}`;

    if (dueDate > until) break;
    if (k > 0 && checkOut && dueDate >= checkOut) break;

    const period = `${y}-${pad(m)}`;
    const amount = terms.amountFor(period);
    const mine = live.filter((p) => p.period === period);
    const paid = mine.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const balance = Math.max(0, amount - paid);

    let status;
    if (balance <= 0) status = 'paid';
    else if (dueDate > today) status = 'upcoming';
    else if (dueDate === today) status = 'due';
    else status = 'overdue';

    periods.push({
      period,
      dueDate,
      amount,
      paid,
      balance,
      status,
      isPartial: paid > 0 && balance > 0,
      daysLate: status === 'overdue' ? daysBetween(dueDate, today) : 0,
      daysUntil: status === 'upcoming' ? daysBetween(today, dueDate) : 0,
    });
  }

  return periods.slice(-maxPeriods);
};

const STATUS_RANK = { overdue: 4, due: 3, upcoming: 2, paid: 1 };

/** One line about a resident's rent, for lists and counts. */
const summarise = (periods) => {
  const owing = periods.filter((p) => p.status === 'overdue' || p.status === 'due');
  const overdue = periods.filter((p) => p.status === 'overdue');
  const next = periods.find((p) => p.status === 'upcoming') || null;

  /* The worst month is the headline: an overdue month outranks one paid in
     advance. `none` is a resident with no rent months at all. */
  let status = 'none';
  for (const p of periods) {
    if ((STATUS_RANK[p.status] || 0) > (STATUS_RANK[status] || 0)) status = p.status;
  }

  return {
    status,
    outstanding: owing.reduce((sum, p) => sum + p.balance, 0),
    overdueAmount: overdue.reduce((sum, p) => sum + p.balance, 0),
    overdueMonths: overdue.length,
    maxDaysLate: overdue.reduce((max, p) => Math.max(max, p.daysLate), 0),
    hasPartial: owing.some((p) => p.isPartial),
    nextDue: next ? { period: next.period, dueDate: next.dueDate, balance: next.balance, daysUntil: next.daysUntil } : null,
    oldestOwing: owing.length ? owing[0].dueDate : null,
  };
};

module.exports = {
  NOT_MONTHLY,
  parseYmd,
  daysInMonth,
  daysBetween,
  addDays,
  monthOf,
  isMonthlyStay,
  termsFor,
  periodsFor,
  summarise,
};
