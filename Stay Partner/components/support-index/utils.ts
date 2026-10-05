/*
 * Helpers and types belonging to app/support/index.tsx, used by the components
 * extracted from it. §4: "shared helpers to its utils".
 */
import type { BackendPartnerTicket, SupportTicketStatus } from '@/services/api/support.api';

export const STATUS_TONE: Record<SupportTicketStatus, 'warning' | 'accent' | 'success' | 'neutral'> = {
  open: 'warning',
  awaiting_customer: 'accent',
  resolved: 'success',
  closed: 'neutral',
};

export const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  open: 'Open',
  awaiting_customer: 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
};

/* Readable names for the server's category ids — ids from the server, labels
   here. Shared by the new-ticket chips and the ticket list, which used to
   print the raw id ("guest", "listing"). */
const CATEGORY_LABELS: Record<string, string> = {
  payout: 'Payouts',
  booking: 'A booking',
  guest: 'A guest',
  listing: 'My listing',
  account: 'My account',
  app: 'The app',
  other: 'Something else',
};

/** An id this build has no label for still reads as a word, not a slug. */
export function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id] ?? (id.charAt(0).toUpperCase() + id.slice(1)).replace(/_/g, ' ');
}

/** "3 min", "2 h", "5 d". */

export function timeLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}
