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
