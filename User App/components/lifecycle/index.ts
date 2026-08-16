/**
 * Lifecycle — the long tail after the money moves, which is where a rental
 * product actually earns its reputation.
 *
 * The centrepiece is one booking-detail template that renders all thirteen
 * statuses. The header, the timeline and the terms are constant; the status
 * block and the action bar are the only things that swap. That is a hard
 * constraint: thirteen bespoke screens would drift, and the drift lands on the
 * states people reach when something has gone wrong.
 */

export { StatusBlock, summaryLineFor, type StatusBlockProps } from './StatusBlock';
export { ActionBar, type ActionBarProps } from './ActionBar';
export { BookingRow, BookingSegments, type BookingRowProps } from './BookingList';

/**
 * Leaving. Three components between them carry every rupee that goes back to a
 * student, and each exists to stop a specific failure:
 *
 *  · `NoticeDatePicker`  — a penalty discovered after the tap
 *  · `DepositEstimate`   — an estimate mistaken for a promise
 *  · `RefundChaseNote`   — "soon", and the support ticket it generates
 */
export { NoticeDatePicker, type NoticeDatePickerProps } from './NoticeDatePicker';
export { DepositEstimate, type DepositEstimateProps } from './DepositEstimate';
export { RefundChaseNote, type RefundChaseNoteProps } from './RefundChaseNote';

/**
 * After the stay. Each of these is built around one refusal:
 *
 *  · `PastStayCard`   — refuses to show only the past, because the question
 *    being asked is "what does it cost now"
 *  · `ReceiptRow`     — refuses to say "being prepared" without a date
 */
export { PastStayCard, type PastStayCardProps } from './PastStayCard';
export { ReceiptRow, type ReceiptRowProps } from './ReceiptRow';

/**
 * Support, alerts and the account.
 *
 * `TicketRow` states the *outcome* rather than the state — "Refunded ₹1,000",
 * not "Resolved" — so a closed ticket answers "so what happened" from the list.
 * `NotificationRow` typesets money differently from activity, because those are
 * the items scrolled back weeks to find. Both carry unread as a left rule *and*
 * a dot, never colour alone.
 */
export { TicketRow, TicketMessageRow, type TicketRowProps, type TicketMessageRowProps } from './Support';
export { NotificationRow, type NotificationRowProps } from './NotificationRow';
export { ProfileRow, ProfileGroup, type ProfileRowProps, type ProfileGroupProps } from './ProfileRow';
