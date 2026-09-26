import type { ElementType } from 'react';
import {
  Bike,
  CheckCircle2,
  CircleSlash,
  PackageCheck,
  ReceiptIndianRupee,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';

import type { BadgeTone } from '../../common/atoms/Badge';
import { formatDateTime, rupees } from '../../../lib/format';
import type {
  FoodOrderPaymentMode,
  FoodCollectionMethod,
  FoodOrderPaymentStatus,
  FoodOrderStatus,
} from '../../../api/types';


export const STATUS_META: Record<FoodOrderStatus, { tone: BadgeTone; icon: ElementType; label: string }> = {
  placed: { tone: 'brand', icon: ReceiptIndianRupee, label: 'Placed' },
  accepted: { tone: 'brand', icon: CheckCircle2, label: 'Accepted' },
  preparing: { tone: 'brand', icon: UtensilsCrossed, label: 'Cooking' },
  ready: { tone: 'warn', icon: PackageCheck, label: 'Ready to collect' },
  picked_up: { tone: 'brand', icon: Bike, label: 'On the way' },
  delivered: { tone: 'good', icon: CheckCircle2, label: 'Delivered' },
  rejected: { tone: 'crit', icon: XCircle, label: 'Rejected' },
  cancelled: { tone: 'neutral', icon: CircleSlash, label: 'Cancelled' },
};

/* "Not paid" rather than "pending": on this screen `pending` almost always
   means a checkout somebody walked away from, and "pending" reads as though
   the money is on its way. */
export const PAYMENT_META: Record<FoodOrderPaymentStatus, { tone: BadgeTone; label: string }> = {
  pending: { tone: 'neutral', label: 'Not paid' },
  paid: { tone: 'good', label: 'Paid' },
  refunded: { tone: 'brand', label: 'Refunded' },
  failed: { tone: 'crit', label: 'Payment failed' },
};

export const PAYMENT_MODE_LABEL: Record<FoodOrderPaymentMode, string> = {
  online: 'Online',
  cod: 'Cash on delivery',
};

/** How a cash-on-delivery order was actually paid at the door. */
export const COLLECTION_LABEL: Record<FoodCollectionMethod, string> = {
  '': '',
  cash: 'Cash at door',
  upi_qr: 'UPI at door',
};

/**
 * The payment line under a row's badge: the checkout choice, and for a COD
 * order that has been delivered, how the door was actually paid.
 */
export const paymentModeLine = (mode: FoodOrderPaymentMode, collection: FoodCollectionMethod): string =>
  (mode === 'cod' && collection
    ? `${PAYMENT_MODE_LABEL.cod} · ${COLLECTION_LABEL[collection]}`
    : PAYMENT_MODE_LABEL[mode]);

/** A dash, not a nought, when the figure was never written. */
export const money = (value: number | null | undefined): string =>
  (value === null || value === undefined ? '—' : rupees(value));

export const dash = (value: string | null | undefined): string => (value ? value : '—');

export const when = (iso: string | null | undefined): string => formatDateTime(iso);

/** "12 min", "1 h 14 min" — an operations screen is read in elapsed time. */
export const elapsed = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

export interface RefundNotice {
  tone: 'good' | 'warn' | 'crit';
  text: string;
}

/* ------------------------------------------------------------------ *
 * What is known about one order's refund
 * ------------------------------------------------------------------ *
 *
 * Lives here rather than on the page because the panel decides which controls
 * survive from exactly the same record the page writes. It was on the page,
 * and the panel was still reading an older `busy` + `notice` pair — which is
 * how the panel came to render a notice INSTEAD of the controls it names,
 * and how "look again" and "send it again" came to be passed in and dropped.
 */

/**
 * What is known about the money once nothing is in the air.
 *
 * `unknown` is the one that is easy to get wrong: nothing came back, so the
 * refund may have happened and may not have. It is not a failure and must
 * never be offered a plain retry.
 */
export type RefundOutcome = 'open' | 'spent' | 'unknown';

export interface RefundAttempt {
  /**
   * A request for this order is in the air right now. Separate from `outcome`
   * because a manual record can be written FROM an unknown outcome, and losing
   * which state that write started from would put the refund button back on
   * the screen while it was still running.
   */
  sending: boolean;
  /** 'open' only ever appears with `sending` — nothing has come back yet. */
  outcome: RefundOutcome;
  /** Shown as a banner above whatever controls are left. */
  notice: RefundNotice | null;
  /**
   * The money may be gone with nothing written against the order — the one
   * situation in which recording it by hand IS the next action, so the panel
   * keeps that control instead of hiding it behind the warning that names it.
   * True for the `recorded: false` answer and for an unknown outcome.
   */
  recordByHand: boolean;
  /** The reference the server named, so nobody retypes it out of a warning. */
  reference: string;
  /** Set once somebody has reloaded the order after an unknown outcome. */
  rechecked: boolean;
}

/** The blank record every state is spread from. */
export const NEW_ATTEMPT: RefundAttempt = {
  sending: false,
  outcome: 'open',
  notice: null,
  recordByHand: false,
  reference: '',
  rechecked: false,
};

/**
 * May a refund still be written down by hand against this order?
 *
 * Yes when nothing has been attempted, and yes for the two outcomes this is
 * the answer to — the money moved without being recorded, and nobody knows
 * whether it moved. No once the question has been closed some other way.
 */
export const canRecordByHand = (attempt?: RefundAttempt): boolean =>
  !attempt || attempt.outcome === 'unknown' || attempt.recordByHand;

/** Nothing more will be SENT for this order from this page: the answer, or the
 *  absence of one, has already arrived. Recording by hand may still be open —
 *  that is `canRecordByHand`, and the two are deliberately not the same test. */
export const isClosed = (attempt?: RefundAttempt): boolean =>
  !!attempt && attempt.outcome !== 'open';
