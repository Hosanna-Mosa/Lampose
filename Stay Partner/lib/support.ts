import { formatShortDate } from './format';

/**
 * Support tickets. Status is a third domain distinct from booking state and
 * payment state — it uses the plain tint-pill `Badge`, not either of the two
 * unmistakable families those carry.
 */

export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export const TICKET_CATEGORIES = [
  'Payment issue',
  'Booking issue',
  'Property issue',
  'Account',
  'Other',
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const DISPUTE_REASONS = [
  'Guest damage',
  'False review',
  'Booking manipulation',
  'Other',
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export type TicketMessage = {
  id: string;
  from: 'owner' | 'support';
  text: string;
  sentAt: Date;
};

export type SupportTicket = {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  updatedAt: Date;
  /** A new reply the owner hasn't opened the thread to see. */
  hasUnreadUpdate: boolean;
  linkedBookingId?: string;
  description?: string;
  /** Fake evidence references — nothing here reads a real file. */
  evidenceCount?: number;
  messages: TicketMessage[];
};

/** Tint pill by status — the plain `Badge`, shared by the list and the thread header. */
export const STATUS_TONE: Record<TicketStatus, 'warning' | 'accent' | 'success'> = {
  open: 'warning',
  in_progress: 'accent',
  resolved: 'success',
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function at(dayOffset: number, hourOffset = 0): Date {
  return new Date(Date.now() - dayOffset * DAY - hourOffset * HOUR);
}

export const TICKETS: SupportTicket[] = [
  {
    id: 'TK-1',
    subject: 'Payout delayed for #LB-4821',
    category: 'Payments',
    status: 'open',
    // The list screen's own timestamp reads as "when this ticket was filed",
    // matching checkpoint 31's verified "2h ago" — the thread below shows the
    // true message timeline, where support's reply is more recent still.
    updatedAt: at(0, 2),
    hasUnreadUpdate: true,
    messages: [
      {
        id: 'MSG-1',
        from: 'owner',
        text: "The payout for this booking was due Aug 12 and still hasn't arrived.",
        sentAt: at(0, 2),
      },
      {
        id: 'MSG-2',
        from: 'support',
        text: 'Hi Anjali, thanks for flagging — we can see the transfer is stuck at our banking partner. Investigating now.',
        sentAt: at(0, 1),
      },
    ],
  },
  {
    id: 'TK-2',
    subject: 'Guest left AC unit damaged',
    category: 'Property',
    status: 'in_progress',
    updatedAt: at(1),
    hasUnreadUpdate: false,
    messages: [
      {
        id: 'MSG-3',
        from: 'owner',
        text: 'Guest checked out this morning and the AC unit in Deluxe Double is leaking and won’t power on. Needs a technician.',
        sentAt: at(1, 3),
      },
      {
        id: 'MSG-4',
        from: 'support',
        text: "Sorry to hear that. We've flagged this for our maintenance partner — someone will be in touch to schedule a visit within 24 hours.",
        sentAt: at(1),
      },
    ],
  },
  {
    id: 'TK-3',
    subject: "Can't update bank details",
    category: 'Account',
    status: 'resolved',
    updatedAt: at(11),
    hasUnreadUpdate: false,
    messages: [
      {
        id: 'MSG-5',
        from: 'owner',
        text: "The 'Edit payout method' screen just spins when I try to save a new account number.",
        sentAt: at(11, 4),
      },
      {
        id: 'MSG-6',
        from: 'support',
        text: 'That was a temporary issue on our end, fixed now — please try again and let us know if it still fails.',
        sentAt: at(11, 1),
      },
      {
        id: 'MSG-7',
        from: 'owner',
        text: 'Works now, thank you!',
        sentAt: at(11),
      },
    ],
  },
];

export function getTicket(id: string | undefined): SupportTicket | undefined {
  return TICKETS.find((t) => t.id === id);
}

// ── Mutation ──────────────────────────────────────────────────────────────
//
// Same shape as everywhere else that creates a record in place: an in-memory
// list, a subscription, an incrementing id. A submitted ticket has to actually
// appear in the list, or Submit is theatre.

const listeners = new Set<() => void>();

export function subscribeTickets(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let nextTicketId = 100;
let nextMessageId = 100;

export function createTicket(input: {
  /** A plain string, not restricted to `TicketCategory` — disputes file under "Dispute". */
  category: string;
  description: string;
  linkedBookingId?: string;
  evidenceCount?: number;
  /** Overrides the auto-derived subject — a dispute's reason reads better than its truncated description. */
  subject?: string;
}): SupportTicket {
  const now = new Date();
  const ticket: SupportTicket = {
    id: `TK-${nextTicketId++}`,
    // Without an explicit subject, it's the description's opening — the way an
    // email client derives one when you don't type it separately.
    subject:
      input.subject ??
      (input.description.length > 60 ? `${input.description.slice(0, 57)}…` : input.description),
    category: input.category,
    status: 'open',
    updatedAt: now,
    // A ticket you just wrote has nothing to catch up on.
    hasUnreadUpdate: false,
    linkedBookingId: input.linkedBookingId,
    description: input.description,
    evidenceCount: input.evidenceCount,
    // What you typed as the description is the thread's opening message —
    // the two aren't separate things a real support system would ask twice.
    messages: [{ id: `MSG-${nextMessageId++}`, from: 'owner', text: input.description, sentAt: now }],
  };
  TICKETS.unshift(ticket);
  listeners.forEach((fn) => fn());
  return ticket;
}

/** Opening the thread is what "read" means — clears the list's unread dot. */
export function markTicketOpened(id: string) {
  const t = TICKETS.find((x) => x.id === id);
  if (t && t.hasUnreadUpdate) {
    t.hasUnreadUpdate = false;
    listeners.forEach((fn) => fn());
  }
}

export function sendMessage(id: string, text: string) {
  const t = TICKETS.find((x) => x.id === id);
  const trimmed = text.trim();
  if (!t || !trimmed) return;
  const now = new Date();
  t.messages.push({ id: `MSG-${nextMessageId++}`, from: 'owner', text: trimmed, sentAt: now });
  t.updatedAt = now;
  listeners.forEach((fn) => fn());
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

export function statusLabel(status: TicketStatus): string {
  return STATUS_LABEL[status];
}

/**
 * Recent activity reads as elapsed time; anything older than yesterday reads
 * as a plain date — "2h ago" and "Yesterday" stay legible, but nobody wants
 * to do the arithmetic on "11d ago" to know if a ticket is stale.
 */
export function ticketTimeLabel(d: Date, now = new Date()): string {
  const diff = now.getTime() - d.getTime();
  if (diff < HOUR) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, yesterday)) return 'Yesterday';

  return formatShortDate(d);
}
