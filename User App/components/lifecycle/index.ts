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

/* `StatusBlock` was here — the tinted card that opened the booking detail with
   a sentence restating the status. It has been removed along with that card:
   "Where this booking is" sits immediately below where it stood and answers
   the same question with the same words plus a timeline, so the pair was one
   question asked twice, pushing the terms below the fold. */
export { ActionBar, hasActions, type ActionBarProps } from './ActionBar';
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

/* `PastStayCard` and `ReceiptRow` were here, behind the "Past stays" and
   "Receipts & agreements" rows on the profile screen. Both rows and both
   screens have been removed, and the two components went with them — a card
   with no screen to draw it on is dead weight that the next reader has to
   work out is dead. The booking detail is where a finished stay is read now,
   and it carries its own terms. */

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
