import { io, type Socket } from 'socket.io-client';

import { getAuthToken } from './api/client';
import { API_BASE_URL } from './api/config';

/* ══════════════════════════════════════════════════════════════════════════
   The live line between this app and the backend.

   ## Why this app has a socket at all now

   It deliberately did not — `partner.routes.js` used to say so in as many
   words, and `realtime.js` had no room for a partner identity at all. Two
   things changed that: a stay request is a three-minute clock, the same
   reason the User App's food/driver sockets exist, and a support thread with
   a property owner in it is a live conversation two people are typing into,
   the same reason the User App's `support.socket.ts` exists. This file is
   both of those, merged into one connection rather than two, because they
   share one identity and one lifecycle.

   ## It is an optimisation, and nothing may depend on it

   `useStayRequests` already polls every four seconds and `IncomingRequestAlert`
   already rings off whatever that poll finds; this file exists to make the
   common case faster, not to replace the floor. Every event here just
   invalidates a react-query key — nobody merges a socket payload into the
   cache directly, so a missed event self-heals on the next poll or focus
   refetch. A backend with socket.io absent (`require('socket.io')` failed) or
   unreachable (a proxy that does not forward `Upgrade`) leaves this app
   exactly as functional as it was before this file existed.

   ## The rooms are the server's decision

   A signed-in owner is put in `partner:<id>` from the handshake token alone —
   see `realtime.js`. `stay_request_new` / `stay_request_updated` /
   `booking_updated` arrive there with no subscription needed. Support is the
   one exception: an OPEN thread additionally asks for `ticket:<reference>`
   with `track_ticket`, the same guarded join every other app's support socket
   uses, because a reference is short enough to be read down a phone line and
   the server re-checks this owner is actually a party to it before letting
   the socket in.
   ══════════════════════════════════════════════════════════════════════════ */

export type StayRequestEvent = {
  kind?: string;
  requestId?: string;
  listingId?: string;
  status?: string;
  expiresAt?: string | null;
};

export type BookingEvent = {
  kind?: string;
  bookingId?: string;
  requestId?: string | null;
  listingId?: string;
  status?: string;
};

export type SupportSocketEvent = {
  reference?: string;
  message?: { id: string; author: string; authorName: string; body: string; at: string } | null;
  ticket?: { reference?: string } | null;
};

type Listener<T = unknown> = (event: T) => void;

const EVENT_NAMES = [
  'stay_request_new',
  'stay_request_updated',
  'booking_updated',
  'support_message',
  'support_ticket_updated',
] as const;

function resolveOrigin(base: string): string {
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
}

export const REALTIME_ORIGIN = resolveOrigin(API_BASE_URL);

let socket: Socket | null = null;
const listeners = new Map<string, Set<Listener<any>>>();
const trackedTickets = new Set<string>();
let warnedOffline = false;

function attach(event: string, listener: Listener<any>): void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(listener);
  socket?.on(event, listener);
}

function detach(event: string, listener: Listener<any>): void {
  listeners.get(event)?.delete(listener);
  socket?.off(event, listener);
}

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
 * Idempotent — called from `IncomingRequestAlert`, which is mounted once at
 * the root, so a second call here is just a safety net, not the normal path.
 */
export function connectRealtime(): Socket | null {
  if (socket) return socket;
  if (!REALTIME_ORIGIN) return null;
  if (!getAuthToken()) return null;

  socket = io(REALTIME_ORIGIN, {
    transports: ['websocket', 'polling'],
    /* Re-read on every attempt, not captured once — a socket whose token was
       refused is never retried by socket.io-client after a server-side
       disconnect, so the reconnect that matters is the one after a NEW
       sign-in, which needs the token read fresh. */
    auth: (cb: (data: { token: string | null }) => void) => cb({ token: getAuthToken() }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    warnedOffline = false;
    trackedTickets.forEach((reference) => socket?.emit('track_ticket', { reference }));
  });

  socket.on('connect_error', (error: Error) => {
    if (warnedOffline) return;
    warnedOffline = true;
    console.warn(
      `[realtime] can't reach ${REALTIME_ORIGIN} (${error?.message ?? error}) — `
        + 'falling back to polling.',
    );
  });

  socket.on('unauthorised', () => {
    console.warn('[realtime] handshake refused — will retry once the session refreshes.');
    teardown();
  });

  listeners.forEach((set, event) => {
    set.forEach((listener) => socket?.on(event, listener));
  });

  return socket;
}

/** Close it. Called on sign-out — the room belonged to the account leaving. */
export function disconnectRealtime(): void {
  teardown();
  trackedTickets.clear();
  warnedOffline = false;
}

/** A stay request was created, accepted, declined, expired or withdrawn. */
export function onStayRequestEvent(handler: Listener<StayRequestEvent>): () => void {
  attach('stay_request_new', handler);
  attach('stay_request_updated', handler);
  return () => {
    detach('stay_request_new', handler);
    detach('stay_request_updated', handler);
  };
}

/** A booking this owner holds was checked in, checked out or cancelled. */
export function onBookingEvent(handler: Listener<BookingEvent>): () => void {
  attach('booking_updated', handler);
  return () => detach('booking_updated', handler);
}

/** Anything on any support thread this owner is a party to — for the inbox. */
export function onSupportEvent(handler: Listener<SupportSocketEvent>): () => void {
  EVENT_NAMES.slice(3).forEach((event) => attach(event, handler));
  return () => EVENT_NAMES.slice(3).forEach((event) => detach(event, handler));
}

/** Watch one thread while its screen is open — see the header. */
export function watchSupportTicket(reference: string, handler: Listener<SupportSocketEvent>): () => void {
  const wanted = reference.trim().toUpperCase();
  if (!wanted) return () => {};

  const filtered: Listener<SupportSocketEvent> = (event) => {
    const ref = (event.reference ?? event.ticket?.reference ?? '').toUpperCase();
    if (ref !== wanted) return;
    handler(event);
  };

  attach('support_message', filtered);
  attach('support_ticket_updated', filtered);

  trackedTickets.add(wanted);
  socket?.emit('track_ticket', { reference: wanted });

  return () => {
    detach('support_message', filtered);
    detach('support_ticket_updated', filtered);
    trackedTickets.delete(wanted);
    socket?.emit('untrack_ticket', { reference: wanted });
  };
}
