/* ══════════════════════════════════════════════════════════════════════════
   Support, from the kitchen's side.

   `/api/v2/food-partners/support` — the restaurant's own router, behind
   `requireFoodPartner`. The diner's and the rider's apps reach the same
   collection through their own routers behind their own guards, and none of
   the three can see another's threads. A reference is six characters and gets
   read down a phone line, so it was never a secret: the server filters on the
   owner, not on the reference.

   Deliberately mirrors `driver/services/support.ts`, because the two apps talk
   to one API and a second shape here would be a second set of bugs. What is
   NOT shared is the vocabulary — see below.

   ## The kitchen's words, not the rider's

   `settlement` is what a restaurant calls the money that arrives weekly; the
   rider calls the same idea a `payout`. Using our internal word, or the
   rider's, produces a category list a counter reads twice and then answers
   with "Other" — which is how a queue stops being sortable.

   ## The categories still come from the SERVER

   `fetchCategories` asks. `CATEGORY_LABEL` below only supplies the words, and
   an id it has never heard of falls back to itself rather than rendering an
   empty pill. Three apps drawing three hardcoded lists is three chances for
   one to drift from the enum, and the drift is invisible until a real person
   picks a category and is told to pick a category.

   ## One socket, not two

   Support rides the connection `orderSocket.ts` already holds — the same one
   carrying `order_placed`. `onSocketEvent` and `emitSocket` exist precisely so
   a second feature can subscribe without opening a second connection, and a
   tablet on a counter should hold exactly one.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from "./api";
import { emitSocket, onSocketEvent } from "./orderSocket";

const BASE = "/api/v2/food-partners/support";

/* ------------------------------------------------------------------ *
 * Shapes — the server's, unchanged
 * ------------------------------------------------------------------ */

export type TicketStatus = "open" | "awaiting_customer" | "resolved" | "closed";

/**
 * `customer` means "whoever filed it", whichever app they used.
 *
 * The wire value keeps the diner-era word on purpose: three apps share one
 * collection, and two spellings of one author is exactly the drift this module
 * avoids elsewhere. It is renamed at the last possible moment — in the bubble,
 * where it reads "You".
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
  /** Something SUPPORT said that nobody at the restaurant has opened yet. */
  unread: boolean;
  messageCount: number;
  lastMessagePreview: string;
  lastActivityAt: string;
  createdAt: string;
};

export type SupportThread = SupportTicket & { messages: SupportMessage[] };

type Envelope<T> = { success: boolean; data: T; unread?: number; message?: string };

/* ------------------------------------------------------------------ *
 * Words — the kitchen's
 * ------------------------------------------------------------------ */

export const CATEGORY_LABEL: Record<string, { label: string; hint: string }> = {
  settlement: {
    label: "Settlement",
    hint: "The weekly payment has not arrived, or arrived short.",
  },
  order: {
    label: "An order",
    hint: "One order went wrong — the items, the total, or a cancellation.",
  },
  menu: {
    label: "The menu",
    hint: "A dish, a price, a photo, or something you cannot change yourself.",
  },
  rider: {
    label: "A rider",
    hint: "Nobody came, they came too early, or something happened at the counter.",
  },
  account: {
    label: "The account",
    hint: "Your details, documents, verification, or the restaurant being offline.",
  },
  app: {
    label: "This app",
    hint: "Something is broken — orders not arriving, no sound, sign-in problems.",
  },
  other: { label: "Something else", hint: "Anything the list above does not cover." },
};

/**
 * The words for one category id, never undefined.
 *
 * A function rather than raw map access at the call site, because the id comes
 * off the wire and the server's list can grow before this app ships again. An
 * unknown id falls back to itself — "settlement" reads acceptably as a label —
 * rather than rendering an empty pill that looks like a loading bug.
 *
 * `null` is a real case too: a safety report carries a `reason` instead of a
 * category, and while this app cannot file one it can still be shown one.
 */
export function categoryWords(id: string | null | undefined): { label: string; hint: string } {
  if (!id) return { label: "Support", hint: "" };
  return CATEGORY_LABEL[id] ?? { label: id, hint: "" };
}

/**
 * The message ceiling to assume until the server says otherwise.
 *
 * Matches `BODY_MAX_CHARS` in `ticket.model.js`. A local fallback rather than a
 * disabled form: the composer must be usable on the first frame, before
 * `/categories` has answered, and a `maxLength` of `undefined` would let
 * somebody type four thousand characters and lose the excess on send.
 */
export const BODY_MAX_FALLBACK = 4000;

export const STATUS_WORD: Record<
  TicketStatus,
  { label: string; tone: "warning" | "info" | "success" | "muted" }
> = {
  open: { label: "Open", tone: "warning" },
  /* "Waiting on you" — the internal word is `awaiting_customer`, which says
     nothing to the person reading it about whose move it is. */
  awaiting_customer: { label: "Waiting on you", tone: "info" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "muted" },
};

/* ------------------------------------------------------------------ *
 * Calls
 * ------------------------------------------------------------------ */

export type SupportAudience = {
  categories: string[];
  /** The server's real ceiling on one message. */
  bodyMax: number;
  /** Whether this app may file a safety report. False for a kitchen. */
  reports: boolean;
};

/**
 * What this audience may file about, from the server.
 *
 * Returns the ceiling alongside the list because the form needs both and one
 * round trip is enough. Falls back to the ids this app knows rather than
 * throwing: a categories endpoint that is briefly unreachable should not stop
 * a restaurant reporting that no rider came.
 */
export async function fetchCategories(token: string): Promise<SupportAudience> {
  const res = await api<Envelope<{
    categories?: string[]; limits?: { bodyMax?: number }; reports?: boolean;
  }>>(`${BASE}/categories`, { token });

  const data = res?.data ?? {};
  return {
    categories: Array.isArray(data.categories) && data.categories.length
      ? data.categories
      : Object.keys(CATEGORY_LABEL),
    bodyMax: Number(data.limits?.bodyMax) || BODY_MAX_FALLBACK,
    reports: data.reports === true,
  };
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
 * Move the restaurant's read watermark.
 *
 * Its own call rather than a side effect of opening the thread, matching the
 * server: a retry or a refetch that silently cleared an unread mark would
 * clear a badge nobody ever looked at — and behind a counter, "nobody" means
 * the other handset.
 */
export async function markTicketRead(token: string, reference: string): Promise<void> {
  try {
    await api(`${BASE}/tickets/${encodeURIComponent(reference)}/read`, {
      method: "POST",
      token,
      body: {},
    });
  } catch {
    /* A watermark that did not move is a badge that stays on for one more
       screen. Not worth an error in front of somebody mid-complaint. */
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
 * Watch ONE thread.
 *
 * The restaurant already sits in `restaurant:<id>` from the order socket, and
 * the server emits support events for ALL of its threads into that room — so
 * the filter on `reference` is what stops a reply about last week's settlement
 * appearing inside an open thread about a rider. Without it the bubble lands
 * in the wrong conversation, which is the single most likely bug in this
 * feature and the reason the filter lives here rather than in each screen.
 *
 * `track_ticket` additionally joins `ticket:<reference>`; the server reads the
 * ticket and refuses anybody who is not a party to it, so asking for the room
 * is not being let into it.
 */
export function watchTicket(
  token: string | null,
  reference: string,
  onEvent: (event: SupportSocketEvent) => void,
): () => void {
  /* The token is taken so a signed-out screen subscribes to nothing rather
     than joining a room it has no session for. The connection itself is
     already open and authenticated by `orderPump`; this only guards the
     subscribe. */
  if (!token || !reference) return () => {};

  const handler = (event: SupportSocketEvent) => {
    if (!event || event.reference !== reference) return;
    onEvent(event);
  };

  const offMessage = onSocketEvent("support_message", handler as (...args: unknown[]) => void);
  const offUpdate = onSocketEvent("support_ticket_updated", handler as (...args: unknown[]) => void);
  emitSocket("track_ticket", { reference });

  return () => {
    offMessage();
    offUpdate();
    emitSocket("untrack_ticket", { reference });
  };
}

/** Anything on any of this restaurant's threads — for the list screen. */
export function watchSupport(onEvent: (event: SupportSocketEvent) => void): () => void {
  const offMessage = onSocketEvent("support_message", onEvent as (...args: unknown[]) => void);
  const offUpdate = onSocketEvent("support_ticket_updated", onEvent as (...args: unknown[]) => void);
  return () => {
    offMessage();
    offUpdate();
  };
}
