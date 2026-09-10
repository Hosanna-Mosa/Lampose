import type { BadgeTone } from '../../common/atoms/Badge';
import {
  type Settlement,
} from '../../../api/services/monitorService';
/** Rupees, the way every other figure in the console is written. */
export const inr = (value: number | null | undefined): string =>
  value == null ? '—' : `₹${Number(value).toLocaleString('en-IN')}`;

export const day = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const when = (value?: string | null): string =>
  value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

/**
 * How a settlement reads at a glance.
 *
 * `held` is deliberately NOT a warning tone. It is the correct, expected state
 * for every booking whose guest has not arrived yet — colouring it amber would
 * make the healthy majority of the queue look like a problem.
 *
 * "Releasing…" covers every RazorpayX status that is not finished — queued,
 * pending, processing — because they are one thing to whoever is watching:
 * money is on its way and there is nothing to do. The exact word is shown
 * underneath for the person who needs it.
 */
export const SETTLEMENT_TONE: Record<Settlement['status'], { tone: BadgeTone; label: string }> = {
  held: { tone: 'neutral', label: 'Held until check-in' },
  releasable: { tone: 'warn', label: 'Ready to release' },
  withdrawing: { tone: 'brand', label: 'Releasing…' },
  paid_out: { tone: 'good', label: 'Paid out' },
  failed: { tone: 'crit', label: 'Payout failed' },
  reversed: { tone: 'neutral', label: 'Reversed' },
};

export const PAYMENT_TONE: Record<string, BadgeTone> = {
  paid: 'good', pending: 'warn', failed: 'crit', expired: 'neutral', not_required: 'neutral',
};
