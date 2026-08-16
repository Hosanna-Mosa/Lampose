/**
 * Support, reports and notifications.
 *
 * The load-bearing distinction in this file is between a **ticket** and a
 * **report**, and it is a type-level distinction rather than a flag, because
 * the two paths must never quietly become one.
 *
 * A ticket is a question about a thing. It goes to support, the owner may be
 * looped in, and it is measured in reply times.
 *
 * A report is an allegation about a person. It goes to a safety team, the owner
 * is *not* told it exists until we have looked, and the listing may be
 * suspended while we do. A student who files one has usually already tried
 * asking nicely, and routing them through a ticket queue is how a deposit gets
 * kept and nobody notices.
 */

/* ------------------------------------------------------------------ *
 * Tickets
 * ------------------------------------------------------------------ */

export type TicketState = 'open' | 'awaiting-you' | 'resolved';

export type TicketCategoryId =
  | 'property'
  | 'deposit'
  | 'payment'
  | 'owner'
  | 'booking'
  | 'other';

export type TicketCategory = {
  id: TicketCategoryId;
  label: string;
  /** What it covers, so the student picks correctly the first time. */
  hint: string;
};

export type Ticket = {
  id: string;
  categoryLabel: string;
  title: string;
  /** "Bhavana Girls PG · LAM-4192" — always tied to a booking where there is one. */
  place: string;
  state: TicketState;
  /** "Support replied", "Resolved", "Refunded ₹1,000" — the *outcome*, not the state name. */
  stateLabel: string;
  /** "2 days ago". */
  whenLabel: string;
  unread?: boolean;
};

export type TicketMessageAuthor = 'you' | 'support' | 'system';

export type TicketMessage = {
  id: string;
  author: TicketMessageAuthor;
  /** Named humans on the support side. "LAMPOSE Support" answers nobody. */
  authorName?: string;
  body: string;
  /** "2 days ago, 3:18 pm". */
  whenLabel: string;
  /** A system line records what actually happened, not what was said. */
  systemNote?: boolean;
};

/* ------------------------------------------------------------------ *
 * Reports — the heavier path
 * ------------------------------------------------------------------ */

export type ReportReason = {
  id: string;
  label: string;
  /** Some reasons cannot be investigated without something to look at. */
  evidenceRequired?: boolean;
};

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

export type NotificationKind =
  | 'owner'
  | 'payment'
  | 'refund'
  | 'rent'
  | 'visit'
  | 'support'
  | 'booking';

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** "9:41 am". */
  timeLabel: string;
  unread?: boolean;
  /**
   * Money notifications are typeset differently from activity ones. These are
   * the ones a student scrolls back weeks to find — "when exactly did that
   * refund land" — and they must be findable by shape, not by reading.
   */
  money?: boolean;
};

export type NotificationDay = {
  /** "Today", "Yesterday", "11 August". */
  label: string;
  items: readonly AppNotification[];
};
