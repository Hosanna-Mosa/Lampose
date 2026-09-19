import { io, type Socket } from 'socket.io-client';

import { getAuthToken } from './api/client';
import { API_BASE_URL } from './api/config';
import type { BackendTicketMessage } from './api/types';

/* ══════════════════════════════════════════════════════════════════════════
   The live line to support.

   ## Why this app has a socket at all now

   It deliberately did not. `app/food/order/[id].tsx` says so in as many
   words: the realtime layer exists for the RIDER's fifteen-second offer, and
   a delivery that is being tracked is well served by a request that works on
   any network. That reasoning holds for a map and does not hold here. The
   other end of a support thread is a person typing a sentence about
   somebody's deposit, and a poll interval is the gap in which a student
   decides nobody is there and files the same complaint a second time.

   ## It is an optimisation, and nothing may depend on it

   Every fact this delivers is also readable over HTTP —
   `Backend/src/infrastructure/realtime/realtime.js` says so, and the backend
   treats socket.io as an optional dependency whose absence turns every emit
   into a no-op. So the list keeps its pull-to-refresh and its focus refetch,
   the thread keeps its fetch, the composer never waits on a connection, and
   nothing on either screen reports whether this file managed to connect. A
   student on a train sees exactly the app they saw before.

   ## The rooms are the server's decision, not ours

   A signed-in diner is put in `customer:<id>` from the handshake token alone,
   and support events for every thread they own are emitted into it. That is
   what makes the LIST live with no subscription at all — and it is exactly
   why a screen showing ONE thread has to filter on the reference. Without
   that filter a reply on ticket B appends a bubble to open ticket A.

   `track_ticket` only adds the per-thread room, and the server reads the
   ticket before it lets anybody in: asking for a room is not being given it,
   which is what stops a six-character reference read down a phone line from
   being enough to watch a stranger's complaint.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The two events this app receives, in the one shape both arrive in.
 *
 * `reference` is optional, and that is not defensive typing. `ticketOpened`
 * in `support.notifier.js` emits `support_ticket_updated` with the row and NO
 * top-level reference, while `messageAdded` and `ticketUpdated` both carry
 * one — so a filter written as `event.reference !== ref` silently drops the
 * one event that means "a new thread exists". Read it through `referenceOf`,
 * never off the field.
 *
 * `ticket` is deliberately typed as an opaque row. It is the ADMIN's summary
 * (`toAdminSummary()`), whose `unread` asks the opposite question to the
 * diner's — "did the customer say something support has not read" — so
 * writing it into a cache would bold a row when the student last spoke and
 * clear it when support replied. It is a signal that something moved, and the
 * hooks treat it as nothing more.
 */
export type SupportSocketEvent = {
  reference?: string;
  message?: BackendTicketMessage | null;
  ticket?: { reference?: string } | null;
};

/*
 * Untyped at the registry level, deliberately.
 *
 * The connection now carries two payload shapes on one socket — support's
 * `SupportSocketEvent` and the stay side's `StayEvent` below — and `attach`/
 * `detach` are a pure string-keyed registry that never reads a field off
 * what passes through them. Typing this as `(event: SupportSocketEvent) =>
 * void` was fine while only one shape existed; keeping it that way once a
 * second one does would make every stay-side subscription an unsound cast
 * instead of a plain function. Every PUBLIC function below (`onSupportEvent`,
 * `watchTicket`, `onStayRequestEvent`, `onBookingEvent`) is still fully typed
 * on its own payload — only the shared plumbing between them is not.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (event: any) => void;

/** The two server-to-client names, listened for together everywhere. */
const SUPPORT_EVENTS = ['support_message', 'support_ticket_updated'] as const;

/**
 * The socket connects to the ORIGIN; the REST calls own the path.
 *
 * `API_BASE_URL` is already origin-shaped for every configuration this app
 * has today — `normalizeBase()` strips a trailing slash and a trailing
 * `/api` — so this is defence against a future base that carries a path
 * rather than a fix for a present bug. It is wrapped because a spec-compliant
 * `URL` THROWS on an unparseable input and Expo installs one: a typo in
 * EXPO_PUBLIC_API_URL would otherwise crash the support screens at import
 * time instead of leaving them on HTTP, which is the wrong way round for a
 * connection that is meant to be optional.
 */
function resolveOrigin(base: string): string {
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
}

export const SUPPORT_SOCKET_ORIGIN = resolveOrigin(API_BASE_URL);

/** Uppercased, the way the server uppercases it before joining the room. */
function normalizeReference(reference: string | null | undefined): string {
  return (reference ?? '').trim().toUpperCase();
}

/**
 * Which thread an event is about.
 *
 * The top-level field where there is one, the row's own reference where there
 * is not — see the note on `SupportSocketEvent`.
 */
export function referenceOf(event: SupportSocketEvent | null | undefined): string {
  if (!event) return '';
  return normalizeReference(event.reference ?? event.ticket?.reference ?? '');
}

/* ------------------------------------------------------------------ *
 * The connection
 * ------------------------------------------------------------------ */

let socket: Socket | null = null;

/**
 * Listeners registered by screens, kept here rather than only on the socket.
 *
 * A screen can mount before the connection exists — a deep link into a thread
 * on a cold start does exactly that, because the session is restored from
 * AsyncStorage asynchronously — and a listener attached to a socket that is
 * still null would simply be dropped on the floor. Holding them here means
 * they are flushed onto whichever socket comes next, including the one that
 * replaces a refused handshake.
 */
const listeners = new Map<string, Set<Listener>>();

/** The per-thread rooms to re-join after a drop. */
const tracked = new Set<string>();
/** The per-ORDER rooms to re-join after a drop — kept separate from
    `tracked` above because the two re-join with different event names
    (`track_ticket` vs `track_order`) on reconnect; conflating them would
    mean an order re-joined as a ticket reference and never actually
    re-subscribed. */
const trackedOrders = new Set<string>();

/** Reconnection is infinite; only the first failure of an outage is logged. */
let warnedOffline = false;

function attach(event: string, listener: Listener): void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(listener);
  socket?.on(event, listener);
}

function detach(event: string, listener: Listener): void {
  listeners.get(event)?.delete(listener);
  socket?.off(event, listener);
}

/**
 * Drop the connection but keep the subscribers.
 *
 * Used when the server hangs up on us, where the screens are still mounted
 * and still want their listeners: the registry above and the tracked rooms
 * both survive, so the next `connectSupportSocket()` re-attaches every one of
 * them and re-joins every room. Only sign-out forgets them.
 */
function teardown(): void {
  try {
    socket?.removeAllListeners();
    socket?.disconnect();
  } catch {
    /* Already gone. */
  }
  socket = null;
}

/**
 * Open the connection for this session, or hand back the one already open.
 *
 * Idempotent, because both support screens ask for it and the list stays
 * mounted underneath the thread — a socket per mount is a socket per mount
 * that never closes.
 *
 * ## The token is read at connect time AND at every reconnect
 *
 * `auth` is given as a callback rather than an object on purpose. A socket
 * whose token does not verify is not retried: the server emits `unauthorised`
 * and disconnects it, and socket.io-client does not reconnect after a
 * server-side disconnect. Capturing the token in an object would replay a
 * stale one after every drop, which is a connection that is permanently and
 * silently dead while looking exactly like a quiet afternoon on the support
 * queue. The callback re-reads `getAuthToken()` on each attempt instead.
 *
 * Returns null when there is no session to authenticate with, and the caller
 * is expected to shrug: everything on both screens works over HTTP.
 */
export function connectSupportSocket(): Socket | null {
  if (socket) return socket;
  if (!SUPPORT_SOCKET_ORIGIN) return null;
  /* A handshake with no token is refused and never retried, so it is worse
     than not connecting at all — `getAuthToken()` is null for the first
     frames of every cold start. The hooks call this again once a fetch has
     proved there is a session. */
  if (!getAuthToken()) return null;

  socket = io(SUPPORT_SOCKET_ORIGIN, {
    /*
     * Websocket first, polling kept on the end.
     *
     * The three sibling apps are websocket-only, and for a rider's offer that
     * is right — a long-polled offer is not worth having. This one keeps the
     * fallback because `Backend/deploy/` warns that a proxy which does not
     * forward `Upgrade`/`Connection` makes socket.io long-poll, and for a
     * support conversation a slower live line is still much better than none.
     */
    transports: ['websocket', 'polling'],
    auth: (cb: (data: { token: string | null }) => void) => cb({ token: getAuthToken() }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    warnedOffline = false;
    /* Re-join the per-thread AND per-order rooms. Membership lives on the
       connection, so a thread or an order watched before a tunnel is one
       nobody is watching after it unless this runs. */
    tracked.forEach((reference) => socket?.emit('track_ticket', { reference }));
    trackedOrders.forEach((orderNumber) => socket?.emit('track_order', { orderNumber }));
  });

  socket.on('connect_error', (error: Error) => {
    /* Once per outage, not once per retry. An unreachable server retries
       forever by design, and a line a second buries everything else in the
       console. Nothing is shown on screen: no support screen has a connection
       indicator, and inventing one would report a fact the student cannot act
       on about a channel they were never told about. */
    if (warnedOffline) return;
    warnedOffline = true;
    console.warn(
      `[support socket] can't reach ${SUPPORT_SOCKET_ORIGIN} (${error?.message ?? error}) — `
        + 'support falls back to its fetch and its pull-to-refresh.',
    );
  });

  socket.on('unauthorised', () => {
    /* The server has already hung up and will not be reconnected to, so the
       dead socket is dropped rather than kept as something that looks live.
       The session itself is not touched from here — `client.ts` owns that,
       and a websocket handshake is a worse witness to an expired token than
       the 401 the next request will produce. */
    console.warn('[support socket] handshake refused — a later screen will try again.');
    teardown();
  });

  /* Whatever was registered before the socket existed. */
  listeners.forEach((set, event) => {
    set.forEach((listener) => socket?.on(event, listener));
  });

  return socket;
}

/**
 * Close it. Called on sign-out.
 *
 * The server put this socket in `customer:<id>` from the handshake token and
 * never re-checks it, so a connection left open outlives the session that
 * opened it — on a shared handset that is the next person's app holding a
 * live line to the previous student's deposit dispute.
 */
export function disconnectSupportSocket(): void {
  teardown();
  /* The rooms belonged to the account that just left. A reconnect for the
     next person must not re-join a thread — or an order — of theirs. */
  tracked.clear();
  trackedOrders.clear();
  warnedOffline = false;
}

/* ------------------------------------------------------------------ *
 * Subscribing
 * ------------------------------------------------------------------ */

/**
 * Anything happening on any of this diner's threads — for the list.
 *
 * No filter and no `track_ticket`: `customer:<id>` is already scoped to one
 * person, and every event arriving in it is about a thread on this list.
 *
 * Returns an unsubscribe, so a screen can listen without owning the
 * connection's lifetime — the socket outlives any one screen, the listener
 * does not.
 */
export function onSupportEvent(handler: Listener): () => void {
  SUPPORT_EVENTS.forEach((event) => attach(event, handler));
  return () => {
    SUPPORT_EVENTS.forEach((event) => detach(event, handler));
  };
}

/* ------------------------------------------------------------------ *
 * The stay side
 * ------------------------------------------------------------------ *
 *
 * The same connection, the same `customer:<id>` room, two more event names.
 * Support earned this socket first (see the header); a stay request's
 * three-minute clock and a booking's owner-driven status both need the same
 * thing a support reply does — a poll interval is the gap in which a
 * student decides nothing happened yet. Nothing here is a second
 * connection: `connectSupportSocket()` is still the one call that opens it,
 * from whichever hook needs it first.
 */

export type StayEvent = {
  kind?: string;
  requestId?: string;
  bookingId?: string;
  listingId?: string;
  status?: string;
  expiresAt?: string | null;
};

/** A stay request was created, accepted, declined, expired or withdrawn. */
export function onStayRequestEvent(handler: (event: StayEvent) => void): () => void {
  attach('stay_request_new', handler);
  attach('stay_request_updated', handler);
  return () => {
    detach('stay_request_new', handler);
    detach('stay_request_updated', handler);
  };
}

/** A booking this student holds was checked in, checked out or cancelled. */
export function onBookingEvent(handler: (event: StayEvent) => void): () => void {
  attach('booking_updated', handler);
  return () => detach('booking_updated', handler);
}

/* ------------------------------------------------------------------ *
 * The food-order-tracking side
 * ------------------------------------------------------------------ *
 *
 * A THIRD reason to reuse this one connection, after support and stay.
 * `app/food/order/[id].tsx` used to explain, at length, why it deliberately
 * had no socket: a tracking screen is well served by a request that works
 * on any network, and "a marker that moves eight seconds late says nothing
 * about whether anyone is there." That reasoning was sound and is still why
 * the poll stays — nothing here removes it, and everything this delivers is
 * also readable on the next poll, same as support and stay. What changed is
 * that the person asking judged eight seconds of visible lag on a MOVING
 * marker worse than the poll interval's inherent staleness, for this one
 * value specifically — direction, not position, distance or status, all of
 * which are still perfectly well served by the existing poll. `watchOrder`
 * exists to narrow the win to exactly that: a live `heading` (and the fix
 * it came with) between polls, nothing broader.
 */

export type FoodOrderLocationEvent = {
  orderNumber?: string;
  driverId?: string;
  lat: number;
  lng: number;
  /** Omitted, not `null`, on a fix the driver's phone had no bearing for —
      see `driver.controller.js`'s own comment on why, and hold the last
      known heading rather than reading this as "facing nowhere" when it's
      absent. */
  heading?: number;
  at: string;
};

/**
 * Watch ONE order's live position/heading — the same shape as `watchTicket`,
 * the same rule: the client names an order number, the server reads the
 * document and decides whether this socket's identity is actually a party
 * to it before joining `order:<orderNumber>`.
 *
 * Filtered by `orderNumber` on the payload, same as `watchTicket` filters by
 * reference — `track_order` scopes which ROOM this socket is in, but this
 * app can still ask to watch a second order (a diner backing out of one
 * tracking screen into another without the first ever unmounting) while the
 * listener registry above stays a single global map per event name, so the
 * filter is what stops order B's fixes from being handed to order A's
 * screen rather than room membership alone.
 */
export function watchOrder(
  orderNumber: string,
  handler: (event: FoodOrderLocationEvent) => void,
): () => void {
  const wanted = (orderNumber ?? '').trim().toUpperCase();
  if (!wanted) return () => {};

  const filtered: Listener = (event: FoodOrderLocationEvent) => {
    if ((event?.orderNumber ?? '').trim().toUpperCase() !== wanted) return;
    handler(event);
  };

  attach('driver_location', filtered);

  trackedOrders.add(wanted);
  socket?.emit('track_order', { orderNumber: wanted });

  return () => {
    detach('driver_location', filtered);
    trackedOrders.delete(wanted);
    socket?.emit('untrack_order', { orderNumber: wanted });
  };
}

/**
 * Watch ONE thread.
 *
 * The filter is the whole point of this function. The diner is already in
 * their own room and therefore already receives `support_message` for every
 * thread they own, so a screen showing one and appending everything it hears
 * would put support's reply about a broken geyser into an open conversation
 * about a deposit.
 *
 * Both sides of the comparison are uppercased because the server uppercases a
 * reference before joining the room while the payload carries the raw stored
 * value. They agree today — references are generated uppercase — and a
 * hand-typed or lowercased deep link is the day they would not.
 *
 * `track_ticket` on top of that adds `ticket:<reference>`. The unsubscribe
 * leaves it again.
 */
export function watchTicket(reference: string, handler: Listener): () => void {
  const wanted = normalizeReference(reference);
  if (!wanted) return () => {};

  const filtered: Listener = (event) => {
    if (referenceOf(event) !== wanted) return;
    handler(event);
  };

  SUPPORT_EVENTS.forEach((event) => attach(event, filtered));

  tracked.add(wanted);
  socket?.emit('track_ticket', { reference: wanted });

  return () => {
    SUPPORT_EVENTS.forEach((event) => detach(event, filtered));
    tracked.delete(wanted);
    socket?.emit('untrack_ticket', { reference: wanted });
  };
}
