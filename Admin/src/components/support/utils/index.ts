import {
  Bike,
  Home,
  User,
  UtensilsCrossed,
} from 'lucide-react';

import type { BadgeTone } from '../../common/atoms/Badge';
import {
  type RequesterKind,
  type TicketPriority,
  type TicketStatus,
} from '../../../api/services/supportService';


export const AUDIENCE_ICON: Record<RequesterKind, typeof User> = {
  customer: User,
  driver: Bike,
  restaurant: UtensilsCrossed,
  partner: Home,
};

export const AUDIENCE_LABEL: Record<RequesterKind, string> = {
  customer: 'Diner',
  driver: 'Rider',
  restaurant: 'Restaurant',
  partner: 'Owner',
};

export const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  open: 'warn',
  awaiting_customer: 'brand',
  resolved: 'good',
  closed: 'neutral',
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  /* "Waiting on them", not "awaiting customer" — the row is read by somebody
     deciding what to pick up next, and the useful fact is whose move it is. */
  awaiting_customer: 'Waiting on them',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const PRIORITY_TONE: Record<TicketPriority, BadgeTone> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warn',
  urgent: 'crit',
};

/** "3 min", "2 h", "5 d" — a queue is read in elapsed time, not in dates. */
export const since = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
};

export const clockTime = (iso: string): string => {
  const at = new Date(iso);
  return Number.isFinite(at.getTime())
    ? at.toLocaleString(undefined, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
    : '';
};

/* ------------------------------------------------------------------ *
 * One row in the queue
 * ------------------------------------------------------------------ */
