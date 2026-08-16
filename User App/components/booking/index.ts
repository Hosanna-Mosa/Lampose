/**
 * Booking components — Batch 4.
 *
 * The batch where the product either earns trust or loses it. Every number
 * here is stated with its source, its refundability and its deadline.
 *
 * Two rules are structural rather than advisory across this folder:
 *
 *  - A timer never decides anything. It emits `onExpire` and renders only what
 *    the server confirms, so a wrong device clock can never flip a booking.
 *  - Pay-now and pay-at-move-in are never summed. They are different kinds of
 *    money going to different people.
 */

export { BookingStatusChip, type BookingStatusChipProps } from './BookingStatusChip';
export { CountdownTimer, type CountdownTimerProps } from './CountdownTimer';
export {
  CostBreakdown,
  CostSummary,
  type CostBreakdownProps,
  type CostSummaryProps,
} from './CostBreakdown';
export {
  VisitScheduler,
  VisitStatusCard,
  type VisitSchedulerProps,
  type VisitStatusCardProps,
} from './Visits';
export {
  MoveInDatePicker,
  proRatedFirstMonth,
  daysInMonth,
  type MoveInDatePickerProps,
} from './MoveInDatePicker';
export { BookingTimeline, type BookingTimelineProps } from './BookingTimeline';
export {
  VerificationCodeDisplay,
  VerificationCodeProblem,
  type VerificationCodeDisplayProps,
  type VerificationCodeProblemProps,
  type CodeProblemKind,
} from './VerificationCodeDisplay';
export { RefundStatusStepper, type RefundStatusStepperProps } from './RefundStatusStepper';

/**
 * The visit checklist. Its last item — "check the deposit and notice period
 * against the app" — is what catches a quoted price quietly becoming a
 * different price at the door, which is the failure an app in the middle
 * exists to prevent.
 */
export { VisitChecklist, type VisitChecklistProps } from './VisitChecklist';
export { AgreementSummaryCard, type AgreementSummaryCardProps } from './AgreementSummaryCard';
