/**
 * Payment — the batch where a student moves more money in one go than they ever
 * have, usually a parent's.
 *
 * Every screen answers the same two questions before being asked: has my money
 * gone, and what do I do now. The failure states never say "try again later" —
 * they say which of three things went wrong, because only one of them means
 * paying again, and getting that wrong causes double payments.
 */

export { PaymentMethodPicker, type PaymentMethodPickerProps } from './PaymentMethodPicker';
export { ProcessingTracker, type ProcessingTrackerProps } from './ProcessingTracker';
