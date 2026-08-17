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

/**
 * `closed` is separate from `resolved`, and the difference is what the row is
 * allowed to offer.
 *
 * Resolved means something happened and the thread is still repliable — a
 * student who says "the pump broke again" reopens it. Closed means it is
 * finished and the server will refuse a reply, so the screen has to offer a
 * new request instead of a text box that returns a 409.
 */
export type TicketState = 'open' | 'awaiting-you' | 'resolved' | 'closed';

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
  /** The server's reference — "TKT-K4M2PX". Shown on the row and read to
      support down a phone line, which is why it is not a Mongo id. */
  id: string;
  /**
   * Which of the two things this is.
   *
   * A field on the row rather than a second type, and worth saying why given
   * how hard the rest of this file insists on the distinction. What must never
   * merge is the two SUBMISSION paths and the two queues — a report reaching
   * support because a string was misspelled is the failure being guarded
   * against, and that guard lives on separate endpoints, separate API
   * functions and an immutable discriminator in the database.
   *
   * A customer's own list is the one place both belong together: somebody who
   * filed a report is owed sight of it, and hiding it here would make the app
   * look like it had thrown the thing away. The row uses this to say "Safety
   * report" rather than a category label.
   */
  kind: 'ticket' | 'report';
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
