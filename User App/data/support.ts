import type {
  AppNotification,
  NotificationDay,
  ReportReason,
  Ticket,
  TicketCategory,
  TicketMessage,
} from '@/types/support';

/**
 * Support and notification fixtures.
 *
 * The reply-time promise below is the one number in this file that must come
 * from whoever actually staffs the queue. It is stated on the ticket list and
 * again on the new-ticket screen, and a promise made twice and kept never is
 * worse than no promise at all. Flagged as open in the handoff.
 */
export const SUPPORT_HOURS_NOTE =
  'Most tickets get a first reply within 4 hours, 9 am to 9 pm.';

export const ticketCategories: readonly TicketCategory[] = [
  {
    id: 'property',
    label: 'Something at the place',
    hint: 'Water, power, cleaning, a broken thing nobody is fixing.',
  },
  {
    id: 'deposit',
    label: 'My deposit',
    hint: 'Late, short, or deductions you were not shown evidence for.',
  },
  { id: 'payment', label: 'A payment', hint: 'Charged twice, charged wrongly, a refund missing.' },
  {
    id: 'owner',
    label: 'The owner',
    hint: 'Not replying, changing the terms, asking for money outside the app.',
  },
  { id: 'booking', label: 'My booking', hint: 'Dates, sharing type, moving in or out.' },
  { id: 'other', label: 'Something else', hint: 'Anything that does not fit above.' },
];

export const tickets: readonly Ticket[] = [
  {
    id: 'TKT-2204',
    categoryLabel: 'Something at the place',
    title: 'Water pressure very low in the mornings',
    place: 'Bhavana Girls PG · LAM-4192',
    state: 'open',
    stateLabel: 'Support replied',
    whenLabel: '2 days ago',
    unread: true,
  },
  {
    id: 'TKT-2188',
    categoryLabel: 'My deposit',
    title: 'Deposit refund not received after 14 days',
    place: 'Sri Vidya Hostel · LAM-3871',
    state: 'resolved',
    // The outcome, not the state name. "Resolved" tells a student nothing.
    stateLabel: 'Resolved · refund arrived 19 Mar',
    whenLabel: '3 weeks ago',
  },
  {
    id: 'TKT-2140',
    categoryLabel: 'A payment',
    title: 'Charged twice for the joining fee',
    place: 'LAM-3871',
    state: 'resolved',
    stateLabel: 'Refunded ₹1,000',
    whenLabel: 'Jun 2026',
  },
];

export function findTicket(id: string): Ticket | undefined {
  return tickets.find((ticket) => ticket.id === id);
}

export const ticketThread: readonly TicketMessage[] = [
  {
    id: 'm1',
    author: 'you',
    body: 'There is almost no water pressure in the bathrooms between 7 and 9 in the morning, which is when everyone needs it. It has been like this for two weeks. I told Padma twice.',
    whenLabel: '4 days ago, 8:12 am',
  },
  {
    id: 'm2',
    author: 'system',
    body: 'We asked Padma about this on 10 August. She has 3 working days to respond.',
    whenLabel: '4 days ago, 9:03 am',
    systemNote: true,
  },
  {
    id: 'm3',
    author: 'support',
    // A named human. "LAMPOSE Support" answers nobody.
    authorName: 'Sneha',
    body: 'Padma has replied — the overhead tank pump is undersized for the morning load and she has ordered a replacement. She says it will be fitted by 20 August. I have made a note to check with you on the 21st.',
    whenLabel: '2 days ago, 3:18 pm',
  },
  {
    id: 'm4',
    author: 'system',
    body: 'If the pump is not fitted by 20 August, this ticket reopens automatically. You do not have to chase it.',
    whenLabel: '2 days ago, 3:18 pm',
    systemNote: true,
  },
];

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

export const reportReasons: readonly ReportReason[] = [
  { id: 'deposit-threat', label: 'Owner is threatening to keep my deposit', evidenceRequired: true },
  { id: 'not-as-listed', label: 'The place is not what was listed', evidenceRequired: true },
  { id: 'safety', label: 'Safety concern about the building' },
  { id: 'harassment', label: 'Harassment or inappropriate behaviour' },
  { id: 'extra-money', label: 'Owner is asking for extra money', evidenceRequired: true },
  { id: 'discrimination', label: 'Discrimination' },
];

/**
 * Two sentences that must appear on the report screen, and one that must appear
 * above both.
 *
 * The emergency line is first because a student in danger should not read a
 * paragraph about our investigation process before being told to call 100.
 */
export const REPORT_EMERGENCY_NOTE =
  'If you are in immediate danger, call 100 first. This is not an emergency line.';

export const REPORT_WEIGHT_NOTE =
  'A report goes to our safety team, not to the owner. She is not told you filed it until we have looked into it. We may suspend the listing while we investigate.';

export const REPORT_DETAIL_HINT =
  'Dates, amounts and exact words matter here — this may be used in a dispute.';

/** Long enough to be investigable, short enough not to be a wall. */
export const REPORT_MIN_CHARS = 50;

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

const today: readonly AppNotification[] = [
  {
    id: 'n1',
    kind: 'owner',
    title: 'Padma accepted your request',
    body: 'Pay ₹26,499 within 2 hours to confirm the bed.',
    timeLabel: '9:41 am',
    unread: true,
  },
  {
    id: 'n2',
    kind: 'payment',
    title: 'Payment received · ₹26,499',
    body: 'Booking LAM-4192 is confirmed. Receipt saved to your bookings.',
    timeLabel: '9:44 am',
    unread: true,
    money: true,
  },
  {
    id: 'n3',
    kind: 'visit',
    title: 'Visit confirmed for tomorrow, 4:30 pm',
    body: 'Vasavi Ladies PG · ask for Padma at the gate.',
    timeLabel: '8:02 am',
  },
];

const yesterday: readonly AppNotification[] = [
  {
    id: 'n4',
    kind: 'rent',
    title: 'Rent of ₹8,500 due in 4 days',
    // We remind; we do not collect. Stated every time, because a student who
    // thinks LAMPOSE takes the rent will not pay the owner.
    body: 'Pay Padma directly on 5 September. We only remind you.',
    timeLabel: '6:00 pm',
    money: true,
  },
  {
    id: 'n5',
    kind: 'refund',
    title: '₹16,260 sent to your UPI',
    body: 'Deposit refund for LAM-3871 · reference RFD-3871-A.',
    timeLabel: '11:02 am',
    money: true,
  },
];

const earlier: readonly AppNotification[] = [
  {
    id: 'n6',
    kind: 'support',
    title: 'Support replied to TKT-2204',
    body: 'About the water pressure at Bhavana Girls PG.',
    timeLabel: '3:18 pm',
  },
  {
    id: 'n7',
    kind: 'booking',
    title: 'A bed opened at Sri Vidya Hostel',
    body: 'You asked to be told. Two-sharing, ₹6,900 per bed.',
    timeLabel: '9:30 am',
  },
];

export const notificationDays: readonly NotificationDay[] = [
  { label: 'Today', items: today },
  { label: 'Yesterday', items: yesterday },
  { label: '11 August', items: earlier },
];

export function unreadCount(days: readonly NotificationDay[]): number {
  return days.reduce(
    (sum, day) => sum + day.items.filter((item) => item.unread).length,
    0,
  );
}
