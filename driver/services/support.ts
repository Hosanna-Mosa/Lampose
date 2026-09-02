/* ══════════════════════════════════════════════════════════════════════════
   Support, from the rider's side.

   `/api/v2/drivers/support` — the rider's own router, behind `requireDriver`.
   The diner's and the kitchen's apps reach the same collection through their
   own routers behind their own guards, and none of the three can see another's
   threads. A reference is six characters and gets read down a phone line, so
   it was never a secret; the server filters on the owner, not on the reference.

   ## Behind `requireDriver`, not `requireApprovedDriver`

   Worth knowing here because it changes what the app may show: a rider whose
   documents were just rejected can still open a ticket. They are the rider
   most likely to need one, and gating help behind approval would lock out
   exactly the people with something to ask.

   ## The category list comes from the server

   Not from a constant in this app. Three apps drawing three category lists
   from three constants files is three chances for one to drift from the
   server's enum, and the symptom is a rider picking "Payout" and being told
   "please choose what this is about". `fetchCategories` asks; `CATEGORY_LABEL`
   below only supplies the WORDS, and an id it has never heard of falls back to
   itself rather than rendering blank.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from "@/utils/api";
import socketService from "@/utils/socketService";

const BASE = "/api/v2/drivers/support";

/* ------------------------------------------------------------------ *
 * Shapes — the server's, unchanged
 * ------------------------------------------------------------------ */

export type TicketStatus = "open" | "awaiting_customer" | "resolved" | "closed";

/**
 * `customer` means "the person who filed it", whichever app they used.
 *
 * The wire value is the diner-era word and is deliberately not renamed: the
 * User App already reads it, and two values meaning the same thing is exactly
 * the drift this module avoids elsewhere. In the rider's app it renders as
 * "You".
 */
export type MessageAuthor = "customer" | "support" | "system";

export type SupportMessage = {
  id: string;
  author: MessageAuthor;
  authorName: string;
  body: string;
  at: string;
};

export type SupportTicket = {
  reference: string;
  kind: "ticket" | "report";
  category: string | null;
  subject: string;
  status: TicketStatus;
  outcome: string;
  orderNumber: string | null;
  /** Something SUPPORT said that the rider has not opened yet. */
  unread: boolean;
  messageCount: number;
  lastMessagePreview: string;
  lastActivityAt: string;
  createdAt: string;
};

export type SupportThread = SupportTicket & { messages: SupportMessage[] };

type Envelope<T> = { success: boolean; data: T; unread?: number; message?: string };

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/**
 * What each category id is called, and what it covers.
 *
 * The hint matters more than the label: a rider picking wrong sends their
 * payout question to whoever answers app bugs, and the delay that causes is
 * the thing they will remember. `payout` and `earnings` are the pair most
 * often confused, so their hints are written against each other.
 */
export const CATEGORY_LABEL: Record<string, { label: string; hint: string }> = {
  payout: {
    label: "A payout",
    hint: "A weekly settlement that has not arrived, or arrived short.",
  },
  earnings: {
    label: "What a trip paid",
    hint: "One delivery paid the wrong amount, or is missing from your earnings.",
  },
  order: {
    label: "A delivery",
    hint: "The restaurant, the customer, the address, or an order that went wrong.",
  },
  account: {
    label: "My account",
    hint: "Documents, verification, a suspension, or your details.",
  },
  app: {
    label: "The app",
    hint: "Something is broken — GPS, notifications, offers not arriving.",
  },
  safety: {
    label: "Safety",
    hint: "Something happened on a delivery that we need to know about.",
  },
  other: { label: "Something else", hint: "Anything the list above does not cover." },
};

export const STATUS_WORD: Record<TicketStatus, { label: string; tone: "warning" | "info" | "success" | "muted" }> = {
  open: { label: "Open", tone: "warning" },
  /* "We are waiting on you", not "awaiting customer" — the rider reading this
     needs to know the ball is theirs, and the internal word does not say so. */
  awaiting_customer: { label: "Waiting on you", tone: "info" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "muted" },
};

/**
 * The two tables above, read safely.
 *
 * Both are plain records rather than functions, and both are indexed with a
 * value that arrived over the wire — so both can be handed a key they have
 * never seen. That is not a defect on the category side: the SERVER owns the
 * enum, which is the entire reason `fetchCategories` exists, so a new one is
 * an ordinary Tuesday rather than a bug. `CATEGORY_LABEL[id].label` would
 * throw on it, and a screen crashing because support added a topic is a worse
 * outcome than a screen showing the topic's id.
 *
 * Every call site needs this, so it is written once here rather than as
 * `?.label ?? id` repeated across three screens where one copy will be missed.
 */
export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "";
  return CATEGORY_LABEL[category]?.label ?? category;
}

export function categoryHint(category: string | null | undefined): string {
  if (!category) return "";
  return CATEGORY_LABEL[category]?.hint ?? "";
}

export function statusWord(status: TicketStatus): { label: string; tone: "warning" | "info" | "success" | "muted" } {
  return STATUS_WORD[status] ?? { label: String(status || "Open"), tone: "muted" };
}

/* ------------------------------------------------------------------ *
 * Calls
 * ------------------------------------------------------------------ */

export async function fetchCategories(token: string): Promise<string[]> {
  const res = await api<Envelope<{ categories: string[] }>>(`${BASE}/categories`, { token });
  return res?.data?.categories ?? [];
}

export async function listTickets(
  token: string,
): Promise<{ tickets: SupportTicket[]; unread: number }> {
  const res = await api<Envelope<SupportTicket[]>>(`${BASE}/tickets`, { token });
  return {
    tickets: Array.isArray(res?.data) ? res.data : [],
    unread: typeof res?.unread === "number" ? res.unread : 0,
  };
}

export async function fetchTicket(token: string, reference: string): Promise<SupportThread> {
  const res = await api<Envelope<SupportThread>>(
    `${BASE}/tickets/${encodeURIComponent(reference)}`,
    { token },
  );
  return res.data;
}

export async function createTicket(
  token: string,
  input: { category: string; body: string; orderNumber?: string },
): Promise<SupportThread> {
  const res = await api<Envelope<SupportThread>>(`${BASE}/tickets`, {
    method: "POST",
    token,
    body: {
      category: input.category,
      body: input.body,
      ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}),
    },
  });
  return res.data;
}

export async function replyToTicket(
  token: string,
  reference: string,
  body: string,
): Promise<SupportThread> {
  const res = await api<Envelope<SupportThread>>(
    `${BASE}/tickets/${encodeURIComponent(reference)}/messages`,
    { method: "POST", token, body: { body } },
  );
  return res.data;
}

/**
 * Move the rider's read watermark.
 *
 * Its own call rather than a side effect of opening the thread, matching the
 * server: a retry or a refetch that silently cleared an unread mark would
 * clear a badge nobody ever looked at.
 */
export async function markTicketRead(token: string, reference: string): Promise<void> {
  try {
    await api(`${BASE}/tickets/${encodeURIComponent(reference)}/read`, {
      method: "POST", token, body: {},
    });
  } catch {
    /* A watermark that did not move is a badge that stays on for one more
       screen. Not worth an error in front of somebody who is mid-complaint. */
  }
}

/* ------------------------------------------------------------------ *
 * Live
 * ------------------------------------------------------------------ */

export type SupportSocketEvent = {
  reference: string;
  message?: SupportMessage | null;
  ticket?: Partial<SupportTicket>;
};

/**
 * Watch one thread.
 *
 * The rider is already in `driver:<id>` from the offer socket and therefore
 * already receives `support_message` for every thread they own — which is what
 * makes the LIST badge live without any of this. `track_ticket` additionally
 * joins `ticket:<reference>`; the server reads the ticket and refuses anybody
 * who is not a party to it, so asking for the room is not being let into it.
 *
 * Returns an unsubscribe that also leaves the room, so a screen can attach
 * without owning the socket's lifetime.
 */
export function watchTicket(
  reference: string,
  onEvent: (event: SupportSocketEvent) => void,
): () => void {
  const handler = (event: SupportSocketEvent) => {
    /* The rider's own room carries events for ALL their threads, so a screen
       showing one has to filter. Without this, opening ticket A and receiving
       a reply on ticket B would append B's message to A. */
    if (!event || event.reference !== reference) return;
    onEvent(event);
  };

  socketService.on("support_message", handler);
  socketService.on("support_ticket_updated", handler);
  socketService.emit("track_ticket", { reference });

  return () => {
    socketService.off("support_message", handler);
    socketService.off("support_ticket_updated", handler);
    socketService.emit("untrack_ticket", { reference });
  };
}

/** Anything happening on any of this rider's threads — for the list screen. */
export function watchSupport(onEvent: (event: SupportSocketEvent) => void): () => void {
  socketService.on("support_message", onEvent);
  socketService.on("support_ticket_updated", onEvent);
  return () => {
    socketService.off("support_message", onEvent);
    socketService.off("support_ticket_updated", onEvent);
  };
}

/* ------------------------------------------------------------------ *
 * Limits, and reading a failure
 * ------------------------------------------------------------------ */

/**
 * The longest body the server will accept, mirrored from `BODY_MAX_CHARS` in
 * `ticket.model.js`.
 *
 * A mirrored number is a number that can drift, so it caps the keyboard and
 * draws a counter and nothing else — it never decides whether to send. If the
 * two ever disagree the server refuses with a sentence of its own, and that
 * sentence is what the rider reads.
 */
export const BODY_MAX = 4000;

/**
 * Was this the 409 that says the thread is shut?
 *
 * Matched on the `code`, not on the status: 409 is a generic conflict and a
 * screen that hid its composer for every one of them would hide it for reasons
 * that had nothing to do with the thread being closed.
 */
export function isTicketClosed(err: unknown): boolean {
  const e = err as { status?: number; payload?: { code?: string } | null } | null;
  return e?.status === 409 && e?.payload?.code === "TICKET_CLOSED";
}

/**
 * The sentence to put in front of the rider when a support call fails.
 *
 * Here rather than copied into all three screens, because the interesting
 * branch is not the happy one: `ApiError` carries `status: 0` for three
 * different things that never reached the server — an unset `EXPO_PUBLIC_API_URL`,
 * a timeout, and fetch giving up — and only two of those write a sentence a
 * rider can act on. The third says "Network request failed", which is not one,
 * and blaming their connection for what may be a misconfigured build is the
 * wrong thing to tell somebody who is already unable to get help.
 *
 * Everything else prefers the SERVER's own words. It wrote them for exactly
 * this case ("Please choose what this is about", "This one is closed") and a
 * generic replacement would throw away the only instruction on screen.
 */
export function supportErrorText(err: unknown, fallback: string): string {
  const e = err as { status?: number; message?: string; payload?: { message?: string } | null } | null;

  if (e?.status === 0) {
    return e.message && e.message !== "Network request failed"
      ? e.message
      : "We could not reach Lampose just now. Try again in a moment.";
  }

  return e?.payload?.message || e?.message || fallback;
}
