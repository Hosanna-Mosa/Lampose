import type { IconName } from '@/components/ui';

/**
 * Payment — ₹26,499 of someone else's money, usually a parent's.
 *
 * Every screen in this flow answers the same two questions before being asked:
 * **has my money gone**, and **what do I do now**.
 */

/* ------------------------------------------------------------------ *
 * Methods
 * ------------------------------------------------------------------ */

export type PaymentMethodKind = 'upiIntent' | 'upiCollect' | 'card' | 'netbanking';

export type PaymentMethod = {
  id: string;
  kind: PaymentMethodKind;
  label: string;
  /** "Last used", "•••• 4291". */
  detail?: string;
  icon: IconName;
  /** Installed UPI apps are detected and shown by name. */
  installed?: boolean;
  lastUsed?: boolean;
};

/**
 * The order is a decision, not a layout.
 *
 * UPI intent apps first, by name — a student on a crowded bus should tap one
 * tile, not type a VPA. Saved methods sit above new ones, so a returning user
 * paying a second month does not re-choose. Card and netbanking are present but
 * demoted: they are the parent's route, and the parent is often on their own
 * phone — which is what the payment-link action is for.
 *
 * Deliberately absent: **wallet, EMI and pay-later**. A deposit financed on
 * credit is exactly the trap this audience should not be nudged into, and
 * offering it would contradict the product's whole posture.
 */
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  { id: 'gpay', kind: 'upiIntent', label: 'Google Pay', icon: 'rupee', installed: true, lastUsed: true },
  { id: 'phonepe', kind: 'upiIntent', label: 'PhonePe', icon: 'rupee', installed: true },
  { id: 'paytm', kind: 'upiIntent', label: 'Paytm', icon: 'rupee', installed: true },
  { id: 'vpa', kind: 'upiCollect', label: 'Any other UPI app', detail: 'Type your UPI ID', icon: 'rupee' },
  { id: 'card', kind: 'card', label: 'Card', detail: 'Debit or credit', icon: 'agreement' },
  { id: 'netbanking', kind: 'netbanking', label: 'Net banking', icon: 'agreement' },
];

/* ------------------------------------------------------------------ *
 * Phases
 * ------------------------------------------------------------------ */

export type PaymentPhase =
  | 'method'
  /** 42a — the app receding as the UPI intent fires. */
  | 'leaving'
  /** 42b — back in the app, outcome not yet known. */
  | 'returning'
  /** 43 — polling the server, which is the only source of truth. */
  | 'processing'
  | 'failed'
  | 'confirmed';

/** paid → verifying → confirming. Step one is green on arrival. */
export type ProcessingStep = 'paid' | 'verifying' | 'confirming';

export const PROCESSING_STEPS: readonly { id: ProcessingStep; label: string }[] = [
  { id: 'paid', label: 'You paid' },
  { id: 'verifying', label: 'Checking with your bank' },
  { id: 'confirming', label: 'Confirming your bed' },
];

/**
 * The polling schedule: 1s × 5, then 2s × 5, then 5s until 90s.
 *
 * Backoff, so a slow webhook does not hammer a 4G connection. At 90 seconds we
 * stop and hand over to a stated resolution time plus support — never poll
 * forever.
 */
export function pollDelay(attempt: number): number {
  if (attempt < 5) return 1000;
  if (attempt < 10) return 2000;
  return 5000;
}

export const POLL_GIVE_UP_MS = 90_000;
/** Where the copy changes but the LAYOUT does not, so it does not read as an error appearing. */
export const POLL_SLOW_MS = 15_000;

/* ------------------------------------------------------------------ *
 * Failure — three kinds, and only one of them means paying again
 * ------------------------------------------------------------------ */

/**
 * The failure screen never says "try again later".
 *
 * It says which of three things went wrong, because the right action differs in
 * each case and **only one of them involves paying again**. Getting this wrong
 * causes double payments, which is the worst bug this product can ship.
 */
export type FailureKind =
  /** The bank said no. Money never left. Safe to retry. */
  | 'declined'
  /** Money left, the bank has not confirmed it to us. NEVER retry. */
  | 'unconfirmed'
  /** The request never reached the bank. Money never left. Safe to retry. */
  | 'unreachable';

export type FailureCopy = {
  headline: string;
  /** The first line of an ambiguous state, ahead of any explanation. */
  lead?: string;
  body: string;
  primary: string;
  secondary?: string;
  /** True only where paying again is actually the right thing to do. */
  retrySafe: boolean;
};

export function failureCopy(
  kind: FailureKind,
  params: { amount: string; holdUntil: string; reference: string },
): FailureCopy {
  switch (kind) {
    case 'declined':
      return {
        headline: 'Your bank declined the payment',
        body: `No money left your account. Your bed is still held until ${params.holdUntil} — try again, or use a different method.`,
        primary: 'Try a different method',
        secondary: 'Talk to support',
        retrySafe: true,
      };
    case 'unconfirmed':
      return {
        headline: 'Payment not confirmed yet',
        // The highest-value sentence in the app, and it runs first. Someone who
        // thinks they have lost ₹26,499 reads one sentence and nothing else.
        lead: 'Do not pay again.',
        body: `Your bank has taken ${params.amount} but has not confirmed it to us. Your bed stays reserved until ${params.holdUntil} while we check. If the money left your account, it is with us — not lost.`,
        primary: 'Check again',
        secondary: 'Talk to support',
        retrySafe: false,
      };
    case 'unreachable':
      return {
        headline: "The request didn't reach your bank",
        body: `This is on our side or the network, not your account — no money left it. Your bed is held until ${params.holdUntil}.`,
        primary: 'Try again',
        secondary: 'Talk to support',
        retrySafe: true,
      };
  }
}
