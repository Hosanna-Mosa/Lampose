import type { BookingStatus, PaymentStatus } from '@/components/ui';
import { netOn } from './fees';

/**
 * Static booking content, shared by the list, detail, check-in, active stay,
 * checkout, cancel, and history screens.
 *
 * Dates are anchored to today rather than to fixed calendar days, so "Today –
 * Aug 15" stays true and the in-house stay is genuinely in progress whenever
 * this is opened.
 */

function at(dayOffset: number, hour = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export type Booking = {
  id: string;
  guest: string;
  roomType: string;
  checkIn: Date;
  checkOut: Date;
  guests: string;
  nights: number;
  status: BookingStatus;
  payment: PaymentStatus;
  /** What the guest pays, before commission. */
  gross: number;
  /**
   * The entry PIN the guest presents at arrival — `LV-548005`.
   *
   * Issued by the server when the owner accepted the request, and held by
   * both sides. Not four digits and not generated here: it is COMPARED with
   * what the student shows, so a locally invented one is worse than none.
   */
  checkInCode?: string;
  /** Set once the stay is under way. */
  checkedInAt?: Date;

  /**
   * The two halves of moving in.
   *
   * This owner goes first; the student confirms from their own app. A booking
   * with only the first is not an arrival — it is an owner who opened a door
   * and is waiting to be told somebody walked through it.
   */
  movedInByOwnerAt?: Date;
  movedInByStudentAt?: Date;
  checkOutBy?: string;
};

export const BOOKINGS: Booking[] = [
  {
    id: 'LB-1182',
    guest: 'Arjun Kapoor',
    roomType: 'Deluxe Double',
    checkIn: at(0, 14),
    checkOut: at(1, 11),
    guests: '2 adults',
    nights: 1,
    status: 'inHouse',
    payment: 'paid',
    gross: 6_400,
    checkInCode: '4829',
    checkedInAt: at(0, 14),
    checkOutBy: '11:00 AM',
  },
  {
    // Departs today, so the checkout sheet is reachable and the active stay has
    // a case where its button is live rather than waiting.
    id: 'LB-1176',
    guest: 'Divya Menon',
    roomType: 'Deluxe Double',
    checkIn: at(-2, 14),
    checkOut: at(0, 11),
    guests: '2 adults',
    nights: 2,
    status: 'inHouse',
    payment: 'paid',
    gross: 7_200,
    checkInCode: '6035',
    checkedInAt: at(-2, 14),
    checkOutBy: '11:00 AM',
  },
  {
    // Arrives today and not yet checked in, so the check-in flow is reachable.
    // Without this every booking is either already in-house or days away.
    id: 'LB-1189',
    guest: 'Nikhil Rao',
    roomType: 'Family Suite',
    checkIn: at(0, 15),
    checkOut: at(3, 11),
    guests: '3 adults',
    nights: 3,
    status: 'confirmed',
    payment: 'paid',
    gross: 14_400,
    checkInCode: '2947',
    checkOutBy: '11:00 AM',
  },
  {
    id: 'LB-1194',
    guest: 'Meera Joseph',
    roomType: 'Family Suite',
    checkIn: at(6, 14),
    checkOut: at(8, 11),
    guests: '4 adults',
    nights: 2,
    status: 'confirmed',
    payment: 'pending',
    gross: 11_000,
    checkInCode: '7314',
    checkOutBy: '11:00 AM',
  },
  {
    id: 'LB-1207',
    guest: 'Karan Desai',
    roomType: 'Deluxe Double',
    checkIn: at(11, 14),
    checkOut: at(13, 11),
    guests: '2 adults',
    nights: 2,
    status: 'confirmed',
    payment: 'paid',
    gross: 8_000,
    checkInCode: '5106',
    checkOutBy: '11:00 AM',
  },
];

/** Past stays. Offsets keep them recent rather than drifting further away each day. */
export const PAST: Booking[] = [
  {
    id: 'LB-1103',
    guest: 'Rohan Verma',
    roomType: 'Deluxe Double',
    checkIn: at(-12, 14),
    checkOut: at(-10, 11),
    guests: '2 adults',
    nights: 2,
    status: 'completed',
    payment: 'paid',
    gross: 6_400,
  },
  {
    id: 'LB-1088',
    guest: 'Nisha Patil',
    roomType: 'Family Suite',
    checkIn: at(-17, 14),
    checkOut: at(-15, 11),
    guests: '4 adults',
    nights: 2,
    status: 'cancelled',
    payment: 'refunded',
    gross: 11_000,
  },
  {
    id: 'LB-1054',
    guest: 'Farhan Ali',
    roomType: 'Deluxe Double',
    checkIn: at(-25, 14),
    checkOut: at(-22, 11),
    guests: '2 adults',
    nights: 3,
    status: 'completed',
    payment: 'paid',
    gross: 9_600,
  },
];

const ALL = [...BOOKINGS, ...PAST];

export const UPCOMING = BOOKINGS;
export const HISTORY = PAST;
/** Current and past together — for anywhere a ticket or dispute needs to link any stay. */
export const ALL_BOOKINGS = ALL;

/** Owner payout — always derived, never stored, so it can't drift from the fee. */
export function payoutOf(b: Booking): number {
  return netOn(b.gross);
}

export function getBooking(id: string | undefined): Booking | undefined {
  return ALL.find((b) => b.id === id);
}
