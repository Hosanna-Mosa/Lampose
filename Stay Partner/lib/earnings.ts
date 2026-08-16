import { BOOKINGS, PAST, payoutOf, type Booking } from './bookings';
import { feeOn } from './fees';
import { midnight } from './inventory';

/**
 * Earnings derived from the bookings, not stored beside them.
 *
 * Every figure on the earnings screens traces back to a booking's gross and the
 * one commission rate, so the overview, the breakdown, and the Bookings tab
 * cannot disagree about what a stay was worth.
 */

export type Period = 'today' | 'week' | 'month' | 'year';

export const PERIODS: Period[] = ['today', 'week', 'month', 'year'];
export const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

const DAY_MS = 86_400_000;

/** Monday-first, matching the calendar and the dashboard chart. */
export function startOfWeek(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Route params arrive as loose strings, so anything unrecognised falls back. */
export function asPeriod(value: unknown): Period {
  return PERIODS.includes(value as Period) ? (value as Period) : 'week';
}

export function periodRange(input: Period | string, now = new Date()): { from: Date; to: Date } {
  const period = asPeriod(input);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'month':
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: new Date(today.getFullYear(), today.getMonth() + 1, 0),
      };
    case 'year':
      return {
        from: new Date(today.getFullYear(), 0, 1),
        to: new Date(today.getFullYear(), 11, 31),
      };
    // `week` is also the fallback, so the switch is total and this function
    // can never return undefined — which would crash every caller on `.from`.
    case 'week':
    default: {
      const from = startOfWeek(now);
      const to = new Date(from);
      to.setDate(to.getDate() + 6);
      return { from, to };
    }
  }
}

/** Earnings are recognised on checkout — that's when the stay is delivered. */
function earnedOn(b: Booking): number {
  return midnight(b.checkOut);
}

export function earningBookings(period: Period, now = new Date()): Booking[] {
  const { from, to } = periodRange(period, now);
  return [...BOOKINGS, ...PAST]
    .filter((b) => b.status !== 'cancelled')
    .filter((b) => earnedOn(b) >= midnight(from) && earnedOn(b) <= midnight(to))
    .sort((a, b) => earnedOn(b) - earnedOn(a));
}

export function totalFor(period: Period, now = new Date()): number {
  return earningBookings(period, now).reduce((sum, b) => sum + payoutOf(b), 0);
}

/** Money earned but not yet transferred — unpaid stays, net of commission. */
export function pendingPayout(): number {
  return [...BOOKINGS, ...PAST]
    .filter((b) => b.status !== 'cancelled' && b.payment === 'pending')
    .reduce((sum, b) => sum + payoutOf(b), 0);
}

export type DayBar = { date: Date; amount: number; elapsed: boolean };

/** Seven bars, Monday to Sunday, for the current week. */
export function weekSeries(now = new Date()): DayBar[] {
  const from = startOfWeek(now);
  const today = midnight(now);

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(from.getTime() + i * DAY_MS);
    const amount = [...BOOKINGS, ...PAST]
      .filter((b) => b.status !== 'cancelled' && earnedOn(b) === midnight(date))
      .reduce((sum, b) => sum + payoutOf(b), 0);
    return { date, amount, elapsed: midnight(date) <= today };
  });
}

export function grossOfBooking(b: Booking): number {
  return b.gross;
}

export function feeOfBooking(b: Booking): number {
  return feeOn(b.gross);
}
