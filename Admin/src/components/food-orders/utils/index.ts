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
