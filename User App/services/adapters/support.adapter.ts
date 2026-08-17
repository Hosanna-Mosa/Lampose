import { ticketCategories, reportReasons } from '@/data/support';
import type { Ticket, TicketMessage, TicketState } from '@/types/support';
import type {
  BackendTicket,
  BackendTicketDetail,
  BackendTicketMessage,
  BackendTicketStatus,
} from '@/services/api/types';

/**
 * Server shapes in, the app's own types out.
 *
 * Everything here is either a label lookup or a date format, and both are done
 * on the device on purpose.
 *
 * The labels ("Something at the place", "Owner is threatening to keep my
 * deposit") live in `data/support.ts` and are what the student was shown when
 * they picked. The server stores the ID they chose, not the sentence — a
 * sentence stored on a record is a sentence that goes stale the first time
 * anybody rewords the form, and then the list disagrees with the picker.
 *
 * The dates are formatted here because "2 days ago" is a fact about where the
 * reader is standing. A server in UTC deciding what "yesterday" means gets it
 * wrong for a student in IST for two hours every night — the same reason the
 * alerts screen groups its days on the device.
 */

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  ticketCategories.map((category) => [category.id, category.label]),
);

const REASON_LABELS: Record<string, string> = Object.fromEntries(
  reportReasons.map((reason) => [reason.id, reason.label]),
);

const STATE: Record<BackendTicketStatus, TicketState> = {
  open: 'open',
  awaiting_customer: 'awaiting-you',
  resolved: 'resolved',
  closed: 'closed',
};

/**
 * The fallback state label, used only when the queue has not written an
 * outcome.
 *
 * These are deliberately worse than a real outcome and that is the point:
 * "Resolved" tells a student nothing they can act on, and the whole design of
 * this list is that a closed ticket answers "so what happened" from the row.
 * A vague word here is a prompt to whoever works the queue, not a target.
 */
const FALLBACK_LABEL: Record<TicketState, string> = {
  open: 'With us',
  'awaiting-you': 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
};

/**
 * "2 days ago", "3 weeks ago", "Jun 2026".
 *
 * Switches to an absolute month past about eight weeks. "63 days ago" is a
 * number somebody has to convert; "Jun 2026" is one they can place against
 * what else was happening.
 */
export function relativeWhen(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  /* Clock skew, or a record written a moment ago on a slightly fast server.
     "in 3 seconds" on a support ticket reads as a bug. */
  if (seconds < 60) return 'Just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;

  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;

  return then.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/** "2 days ago, 3:18 pm" — the thread wants the time of day as well. */
export function messageWhen(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const clock = then
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();

  return `${relativeWhen(iso, now)}, ${clock}`;
}

/**
 * What the row calls this thing.
 *
 * A report never wears a category label, because it does not have one — and
 * naming it "Safety report" on the row is the only place in the customer's
 * own list where the two paths are visibly different. An unrecognised id
 * falls back to the neutral word rather than rendering the raw slug: the
 * server's enum and the app's fixture can drift by one deploy, and
 * "deposit-threat" on screen is worse than "Support request".
 */
function labelFor(ticket: BackendTicket): string {
  if (ticket.kind === 'report') {
    return ticket.reason ? (REASON_LABELS[ticket.reason] ?? 'Safety report') : 'Safety report';
  }
  return ticket.category ? (CATEGORY_LABELS[ticket.category] ?? 'Support request') : 'Support request';
}

export function toTicket(ticket: BackendTicket, now: Date = new Date()): Ticket {
  const state = STATE[ticket.status] ?? 'open';

  return {
    id: ticket.reference,
    kind: ticket.kind,
    categoryLabel: labelFor(ticket),
    title: ticket.subject,
    /* The reference is already its own line on the row, so `place` carries
       only where this happened — and an empty string where the complaint is
       about nothing in the catalogue, which the row renders as nothing. */
    place: ticket.placeLabel || '',
    state,
    stateLabel: ticket.outcome || FALLBACK_LABEL[state],
    whenLabel: relativeWhen(ticket.lastActivityAt, now),
    unread: ticket.unread,
  };
}

export function toTickets(tickets: readonly BackendTicket[], now: Date = new Date()): Ticket[] {
  return tickets.map((ticket) => toTicket(ticket, now));
}

export function toTicketMessage(
  message: BackendTicketMessage,
  now: Date = new Date(),
): TicketMessage {
  return {
    id: message.id,
    /* 'customer' on the wire, 'you' on the screen. The server names the role;
       the app speaks to a person. */
    author: message.author === 'customer' ? 'you' : message.author,
    authorName: message.authorName || undefined,
    body: message.body,
    whenLabel: messageWhen(message.at, now),
    /* What makes the row a rule rather than a bubble. Derived from the author
       rather than sent as its own flag, so the two cannot disagree. */
    systemNote: message.author === 'system' || undefined,
  };
}

export function toTicketThread(
  detail: BackendTicketDetail,
  now: Date = new Date(),
): TicketMessage[] {
  return detail.messages.map((message) => toTicketMessage(message, now));
}
