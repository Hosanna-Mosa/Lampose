import type { BookingStatus } from '@/constants/tokens';
import type {
  AgreementClause,
  Booking,
  CancellationPolicy,
  CancellationReason,
  CostBreakdownData,
  NoticeTerms,
  PastStay,
  Receipt,
  RefundState,
  TimelineStep,
  Visit,
  VisitDay,
} from '@/types/booking';

/**
 * Typed fixtures for booking.
 *
 * Deadlines are functions rather than constants: a deadline is an absolute
 * timestamp, so a fixture that hard-coded one would be expired the moment it
 * was written. The real API supplies these; here they are computed relative to
 * now so the timers can actually be watched.
 */

export function inMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function inSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export const saiKrishnaBooking: Booking = {
  id: 'bkg-4192',
  reference: 'LAM-4192',
  status: 'PAYMENT_PENDING',
  propertyName: 'Sai Krishna Boys PG',
  sharingLabel: 'Two-sharing',
  moveInLabel: '5 September 2026',
  verificationCode: '419273',
  codeValidLabel: 'Valid on 5 Sep, until 11:59 pm',
  ownerName: 'Ramesh',
};

/* ------------------------------------------------------------------ *
 * Cost
 * ------------------------------------------------------------------ */

export const saiKrishnaCost: CostBreakdownData = {
  propertyLine: 'Sai Krishna Boys PG · two-sharing · move in 5 Sep',
  payNow: [
    {
      id: 'rent',
      label: 'First month’s rent',
      explainer: '1 Sep – 30 Sep, for the room you picked.',
      amount: 8500,
      payee: 'owner',
    },
    {
      id: 'deposit',
      label: 'Security deposit',
      explainer:
        "Two months' rent, returned within 14 days of leaving with 30 days' notice.",
      amount: 17000,
      payee: 'owner',
      refundable: true,
    },
    {
      id: 'joining',
      label: 'Joining charge',
      explainer: 'One time · a new mattress cover and a deep clean before you arrive.',
      amount: 1000,
      payee: 'owner',
    },
    {
      id: 'fee',
      label: 'LAMPOSE fee',
      explainer: 'One time · covers the visit and holding the bed for you.',
      amount: 499,
      payee: 'lampose',
    },
    {
      id: 'discount',
      label: 'First-booking discount',
      explainer: 'Applied automatically · no code needed.',
      amount: -500,
      payee: 'lampose',
      discount: true,
    },
  ],
  payAtMoveIn: [
    {
      id: 'maintenance',
      label: 'Maintenance',
      explainer: 'Monthly · cleaning, water and the common areas.',
      amount: 500,
      payee: 'owner',
      monthly: true,
    },
    {
      id: 'electricity',
      label: 'Electricity',
      explainer: 'Metered and split between roommates. Not a fixed charge.',
      amount: 0,
      payee: 'owner',
      monthly: true,
      estimate: { low: 600, high: 900, source: 'what residents paid last summer' },
    },
  ],
  quote: {
    validUntil: inMinutes(120),
    quotedLabel: 'quoted 4 min ago · held for 2 hours',
  },
};

/* ------------------------------------------------------------------ *
 * Visits
 * ------------------------------------------------------------------ */

export const visitDays: readonly VisitDay[] = [
  {
    id: 'd1',
    weekday: 'Today',
    date: '2',
    month: 'Sep',
    slots: [
      { id: 'd1-1', label: '10:00 am', past: true },
      { id: 'd1-2', label: '12:30 pm', past: true },
      { id: 'd1-3', label: '4:30 pm' },
      { id: 'd1-4', label: '6:00 pm', full: true, fullReason: '2 visits booked' },
    ],
  },
  {
    id: 'd2',
    weekday: 'Wed',
    date: '3',
    month: 'Sep',
    slots: [
      { id: 'd2-1', label: '10:00 am' },
      { id: 'd2-2', label: '12:30 pm', full: true, fullReason: '2 visits booked' },
      { id: 'd2-3', label: '4:30 pm' },
      { id: 'd2-4', label: '6:00 pm' },
    ],
  },
  {
    id: 'd3',
    weekday: 'Thu',
    date: '4',
    month: 'Sep',
    slots: [
      { id: 'd3-1', label: '10:00 am' },
      { id: 'd3-2', label: '12:30 pm' },
      { id: 'd3-3', label: '4:30 pm', full: true, fullReason: '2 visits booked' },
      { id: 'd3-4', label: '6:00 pm' },
    ],
  },
  {
    id: 'd4',
    weekday: 'Fri',
    date: '5',
    month: 'Sep',
    unavailable: true,
    slots: [
      { id: 'd4-1', label: '10:00 am', full: true, fullReason: 'owner away' },
      { id: 'd4-2', label: '4:30 pm', full: true, fullReason: 'owner away' },
    ],
  },
];

export const visitRequested: Visit = {
  id: 'v1',
  state: 'requested',
  propertyName: 'Sai Krishna Boys PG',
  whenLabel: 'Tomorrow, 4:30 pm',
  agoLabel: 'asked 14 min ago',
};

export const visitConfirmed: Visit = {
  id: 'v2',
  state: 'confirmed',
  propertyName: 'Sai Krishna Boys PG',
  whenLabel: 'Tomorrow, 4:30 pm',
  agoLabel: 'in 19 h',
  ownerName: 'Ramesh',
  landmark: 'Opp. Ratnadeep, lane 3',
  bring: 'Any photo ID',
};

export const visitCompleted: Visit = {
  id: 'v3',
  state: 'completed',
  propertyName: 'Sai Krishna Boys PG',
  whenLabel: '2 Sep, 4:30 pm',
  agoLabel: '3 days ago',
  daysAgo: 3,
  quotedRent: 8500,
  quotedDeposit: 17000,
  priceUnchanged: true,
};

export const visitMissed: Visit = {
  id: 'v4',
  state: 'missed',
  propertyName: 'Lakshmi Ladies Hostel',
  whenLabel: 'Yesterday, 4:30 pm',
  agoLabel: 'yesterday',
};

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

export const timelineSteps: readonly TimelineStep[] = [
  { id: 'requested', label: 'Requested', timestamp: '13 Aug, 9:12 am' },
  { id: 'accepted', label: 'Accepted', timestamp: '13 Aug, 9:38 am' },
  { id: 'paid', label: 'Paid', timestamp: '13 Aug, 9:41 am' },
  { id: 'movedIn', label: 'Moved in', timestamp: '5 Sep, 6:20 pm' },
];

/* ------------------------------------------------------------------ *
 * Refund
 * ------------------------------------------------------------------ */

export const refundInProgress: RefundState = {
  stage: 'processing',
  heldBy: 'Our payments partner',
  expectedBy: '19 September',
  destination: 'To the UPI ID you paid from',
  lines: [
    { label: 'Deposit paid', amount: 17000 },
    {
      label: 'Unpaid electricity',
      evidence: 'Aug meter reading · owner uploaded the bill',
      amount: 740,
      deduction: true,
    },
    // A zero deduction is shown rather than hidden. Seeing "damage: −₹0" is
    // what makes the ₹740 above it believable.
    { label: 'Damage or cleaning', evidence: 'Nothing claimed', amount: 0, deduction: true },
  ],
};

/* ------------------------------------------------------------------ *
 * Leaving
 * ------------------------------------------------------------------ */

export const noticeTerms: NoticeTerms = {
  ownerName: 'Ramesh',
  noticeDays: 30,
  todayLabel: '14 Aug',
  earliestFreeLabel: '13 September',
  lockInNote: 'Your lock-in ended in December, so there is no penalty for leaving.',
  options: [
    {
      id: 'early',
      label: '31 Aug',
      fullLabel: '31 August 2026',
      daysAway: 17,
      penalty: 8500,
      penaltyReason:
        '31 August is only 17 days away. Leaving that early means Ramesh can keep ₹8,500 — one month’s rent — from your deposit. 13 September costs you nothing.',
    },
    { id: 'full', label: '13 Sep', fullLabel: '13 September 2026', daysAway: 30, penalty: 0 },
    { id: 'later', label: '30 Sep', fullLabel: '30 September 2026', daysAway: 47, penalty: 0 },
  ],
  depositPaid: 17000,
  lines: [
    {
      label: 'Early-exit penalty',
      detail: 'None — you are giving full notice',
      amount: 0,
    },
    {
      label: 'Final electricity',
      detail: 'Read on your last day · last month was ₹740',
      amount: -700,
      estimate: true,
    },
    {
      label: 'Damage',
      detail: 'Ramesh inspects the room with you present',
      amount: 0,
      estimate: true,
    },
  ],
  settlementWindowLabel: 'Within 14 days of 13 Sep',
  changeableUntilLabel: 'You can change the date up to 7 days before.',
};

export const cancellationPolicy: CancellationPolicy = {
  paid: 26499,
  lines: [
    {
      label: 'LAMPOSE fee',
      detail: 'Non-refundable — this is shown before you confirm, not after',
      amount: 499,
      kept: true,
    },
  ],
  returning: 26000,
  destination: 'To the UPI ID you paid from',
  arrivesByLabel: '19 August',
  timingNote: '3–5 working days — your bank’s timing, not ours. We’ll tell you when it lands.',
  reference: 'CNL-4192',
};

/**
 * Asked after the cost is on screen, and skippable.
 *
 * "Found somewhere else" sits first because it is the honest majority answer,
 * and putting it anywhere but first makes the list read as an attempt to talk
 * someone out of leaving.
 */
export const cancellationReasons: readonly CancellationReason[] = [
  { id: 'other-place', label: 'I found somewhere else' },
  { id: 'plans', label: 'My plans changed' },
  { id: 'too-expensive', label: 'It costs more than I expected' },
  { id: 'owner', label: 'Something the owner said or did' },
  { id: 'property', label: 'The place was not as described' },
];

/* ------------------------------------------------------------------ *
 * After the stay
 * ------------------------------------------------------------------ */

export const pastStays: readonly PastStay[] = [
  {
    bookingId: 'bkg-3711',
    reference: 'LAM-3711',
    propertyName: 'Bhavana Girls PG',
    category: 'PG_HOSTEL',
    periodLabel: 'Sep 2026 – Sep 2027',
    monthsStayed: 12,
    sharingLabel: 'Two sharing',
    rentPaid: 8500,
    depositOutcome: 'deposit returned in full',
    // Today's numbers, which is the half that answers "can I go back".
    currentRent: 9200,
    currentAvailability: 'two-sharing has 1 bed free',
    stillListed: true,
    ownerStillRuns: true,
    ownerName: 'Padma',
  },
  {
    bookingId: 'bkg-3502',
    reference: 'LAM-3502',
    propertyName: 'Anand PG for Boys',
    category: 'PG_HOSTEL',
    periodLabel: 'Jan 2026 – Jun 2026',
    monthsStayed: 5,
    sharingLabel: 'Three sharing',
    rentPaid: 6000,
    depositOutcome: '₹1,200 kept for unpaid electricity',
    stillListed: false,
  },
];

export const receipts: readonly Receipt[] = [
  {
    id: 'rc-agreement',
    kind: 'agreement',
    title: 'Rental agreement',
    meta: 'Signed 13 Aug 2026',
    pageCount: 4,
  },
  {
    id: 'rc-payment',
    kind: 'payment',
    title: 'Booking payment',
    meta: '13 Aug 2026 · UPI · TXN 8841027',
    amount: 26499,
  },
  {
    id: 'rc-refund',
    kind: 'refund',
    title: 'Deposit refund',
    meta: '19 Mar 2027 · UPI · RFD-4192-A',
    amount: 16260,
  },
  {
    id: 'rc-settlement',
    kind: 'settlement',
    title: 'Final settlement statement',
    meta: 'Being prepared',
    // States its own deadline. "Being prepared" with no date is the same as
    // forgotten.
    pendingUntilLabel: 'Ready within 3 working days of your last day',
  },
];

export const RECEIPTS_RETENTION_NOTE =
  'Every receipt stays here as long as your account does — you’ll need them for a rent-allowance claim or a landlord asking for a reference.';

/* ------------------------------------------------------------------ *
 * Agreement
 * ------------------------------------------------------------------ */

export const saiKrishnaAgreement: readonly AgreementClause[] = [
  {
    heading: 'You pay ₹8,500 every month by the 5th',
    term: 'rent',
    body: "Straight to the owner after the first month. Rent can only change with 60 days' written notice.",
  },
  {
    heading: '₹17,000 stays with the owner',
    term: 'deposit',
    refundable: true,
    body: 'You get it back within 14 days of leaving, minus any unpaid electricity or damage — both have to be shown to you with a bill or a photo.',
  },
  {
    heading: 'Tell them 30 days before you leave',
    term: 'notice period',
    body: "Leave sooner and the owner can keep one month's rent from your deposit. A message in the app counts as telling them.",
  },
  {
    heading: 'You can leave any time after 3 months',
    term: 'lock-in',
    body: 'If you leave before 5 Dec 2026, the owner keeps ₹8,500 of the deposit. After that date there is no penalty beyond notice.',
  },
];

export const saiKrishnaHouseRules: readonly string[] = [
  'Gate closes 10:30 pm',
  'Guests in common room only',
  'No smoking',
  'No alcohol',
  "Late entry: warden's permission",
];

export const HOUSE_RULES_NOTE =
  'Breaking these repeatedly can end the agreement with 15 days’ notice. Your deposit is not affected by rule-breaking, only by money owed and damage.';

/* ------------------------------------------------------------------ *
 * Lifecycle fixtures — one booking per interesting status.
 * ------------------------------------------------------------------ */

export type BookingSummary = Booking & {
  /** Where the money is, for the terms block that never moves. */
  rent: number;
  deposit: number;
  depositMonths: number;
  noticePeriodDays: number;
  lockInEndsLabel?: string;
  /** Set once the stay has started. */
  roomLabel?: string;
  livingSinceLabel?: string;
  monthsStayed?: number;
  /** Set on terminal states so the timeline can say what happened. */
  endedLabel?: string;

  /**
   * The exact address, and what it takes to see it.
   *
   * These are deliberately on the booking rather than looked up from the
   * listing. The listing does not carry them any more — the public detail
   * screen shows the locality only — so the address arriving *with the paid
   * booking* is the actual mechanism, not a display rule layered over shared
   * data. A screen that cannot reach an address cannot leak one.
   */
  address?: string;
  landmark?: string;
  coords?: { latitude: number; longitude: number };
};

/**
 * Whether the exact address may be shown.
 *
 * True once the money has actually moved and the stay has not been cancelled.
 * Before payment there is nothing to justify handing out where other people
 * live; after a cancellation there is no longer a reason to keep it on screen.
 *
 * This is one function rather than a condition written at each call site,
 * because "which states may see the address" is a privacy rule and a privacy
 * rule that lives in three places is a privacy rule that will disagree with
 * itself.
 */
export function addressVisible(status: BookingStatus): boolean {
  switch (status) {
    case 'CONFIRMED':
    case 'CHECKED_IN':
    case 'CHECKED_OUT':
    case 'COMPLETED':
    case 'DISPUTED':
      return true;
    default:
      return false;
  }
}

function base(
  id: string,
  reference: string,
  status: BookingStatus,
  overrides: Partial<BookingSummary> = {},
): BookingSummary {
  return {
    id,
    reference,
    status,
    propertyName: 'Sai Krishna Boys PG',
    sharingLabel: 'Two sharing',
    moveInLabel: '5 September 2026',
    ownerName: 'Ramesh',
    verificationCode: '419273',
    codeValidLabel: 'Valid on 5 Sep, until 11:59 pm',
    rent: 8500,
    deposit: 17000,
    depositMonths: 2,
    noticePeriodDays: 30,
    lockInEndsLabel: '5 December 2026',
    address: '3-6-291/A, Street 8, Himayatnagar, Hyderabad 500029',
    landmark: 'Opp. Ratnadeep, lane 3',
    coords: { latitude: 17.4009, longitude: 78.4861 },
    ...overrides,
  };
}

export const bookings: readonly BookingSummary[] = [
  base('bkg-4192', 'LAM-4192', 'CONFIRMED'),
  base('bkg-4201', 'LAM-4201', 'REQUESTED', {
    propertyName: 'Lakshmi Ladies Hostel',
    sharingLabel: 'Three sharing',
    ownerName: 'Padma',
    rent: 6200,
    deposit: 6200,
    depositMonths: 1,
    deadline: inMinutes(22),
  }),
  base('bkg-4210', 'LAM-4210', 'PAYMENT_PENDING', {
    propertyName: 'Bhavana Girls PG',
    ownerName: 'Padma',
    deadline: inMinutes(96),
  }),
  base('bkg-3980', 'LAM-3980', 'CHECKED_IN', {
    roomLabel: 'Room 4, bed B',
    livingSinceLabel: '5 Sep 2026',
    monthsStayed: 11,
  }),
  base('bkg-3711', 'LAM-3711', 'COMPLETED', {
    propertyName: 'Kranthi Boys PG',
    endedLabel: 'Left 12 Aug 2026',
    monthsStayed: 8,
  }),
  base('bkg-3502', 'LAM-3502', 'CANCELLED_BY_CUSTOMER', {
    propertyName: 'Anand PG for Boys',
    endedLabel: 'Cancelled 2 Jul 2026',
  }),
];

/* ------------------------------------------------------------------ *
 * Bookings made by walking the flow
 * ------------------------------------------------------------------ */

/**
 * Bookings created in this session.
 *
 * **A development stand-in, and only that.** In production a confirmed request
 * comes back from the server as a booking with a real reference, a real
 * move-in code and the owner's real address; the client's job is to render it.
 * Until that endpoint exists, confirming a request has to put *something* in
 * the bookings tab or the flow dead-ends and cannot be walked.
 *
 * It lives in module scope rather than in a context because `data/` is what
 * every screen already reads bookings from, and threading a second source
 * through the tree would mean every consumer having to merge two lists.
 *
 * It is lost on reload. That is correct for a stand-in — a fake booking that
 * survived a restart would be indistinguishable from a real one, and somebody
 * would eventually ship against it.
 */
const sessionBookings: BookingSummary[] = [];

export function registerBooking(booking: BookingSummary): void {
  const existing = sessionBookings.findIndex((item) => item.id === booking.id);
  if (existing >= 0) sessionBookings[existing] = booking;
  else sessionBookings.unshift(booking);
}

/** Everything the bookings tab should show: this session's, then the fixtures. */
export function allBookings(): readonly BookingSummary[] {
  return [...sessionBookings, ...bookings];
}

/**
 * The booking a confirmed request becomes.
 *
 * The address, the landmark and the pin are attached HERE, at confirmation —
 * which is the whole mechanism behind the privacy rule. The listing type does
 * not carry an address at all, so no discovery screen can leak one; it exists
 * for the first time on a booking whose status `addressVisible()` allows.
 *
 * The code is six digits and, in production, is minted server-side. A code the
 * client invents is a code the owner's app cannot verify.
 */
export function confirmedBookingFor(params: {
  listingId: string;
  propertyName: string;
  sharingLabel: string;
  ownerName?: string;
  rent: number;
  /** The day they chose, already formatted. Falls back to the fixture's. */
  moveInLabel?: string;
}): BookingSummary {
  const existing = sessionBookings.find((item) => item.id === `bkg-${params.listingId}`);
  if (existing) return existing;

  const created = base(`bkg-${params.listingId}`, `LAM-${params.listingId.slice(-4).toUpperCase()}`, 'CONFIRMED', {
    propertyName: params.propertyName,
    sharingLabel: params.sharingLabel,
    ownerName: params.ownerName,
    rent: params.rent,
    ...(params.moveInLabel ? { moveInLabel: params.moveInLabel } : null),
    ...(params.moveInLabel ? { codeValidLabel: `Valid on ${params.moveInLabel}, until 11:59 pm` } : null),
  });
  registerBooking(created);
  return created;
}

export function findBooking(id: string): BookingSummary | undefined {
  return allBookings().find((booking) => booking.id === id);
}

/** The three segments on the bookings tab. */
export type BookingSegment = 'active' | 'requests' | 'past';

const SEGMENT_OF: Record<BookingStatus, BookingSegment> = {
  REQUESTED: 'requests',
  ACCEPTED: 'requests',
  PAYMENT_PENDING: 'requests',
  PAYMENT_FAILED: 'requests',
  CONFIRMED: 'active',
  CHECKED_IN: 'active',
  DISPUTED: 'active',
  CHECKED_OUT: 'past',
  COMPLETED: 'past',
  REJECTED: 'past',
  EXPIRED: 'past',
  CANCELLED_BY_CUSTOMER: 'past',
  CANCELLED_BY_OWNER: 'past',
};

export function segmentOf(status: BookingStatus): BookingSegment {
  return SEGMENT_OF[status];
}
