/* ══════════════════════════════════════════════════════════════════════════
   The console's live line to the support queue.

   The first console-side socket in this codebase, and it exists because
   support is the one screen here where the OTHER end is a person waiting.
   Everywhere else in this console the freshest data is whatever was true when
   somebody pressed refresh, and that is fine — a rider approval is not less
   correct for being thirty seconds old. A chat is: a reply that arrives on the
   next poll is a conversation with a thirty-second pause in it, and the person
   on the other end reads that pause as nobody being there.

   ## The same rule the apps follow

   An optimisation, never a dependency. Everything this delivers is also on the
   page's poll, `socket.io-client` connects with the admin token the axios
   instance already holds, and a console with no socket server behaves exactly
   as it did before — just slower. Nothing on the support page waits for a
   connection before rendering.

   ## Why the base URL is stripped of `/api`

   `VITE_API_BASE_URL` points at the API ROOT (`…/api`), because that is what
   axios needs. socket.io attaches to the HTTP server itself at the default
   path, one level up, so pointing it at `/api` would connect to nothing and
   retry forever in the background while the page looked fine.

   ## One connection, many subscribers

   The queue list and the open thread both want events, and they mount and
   unmount independently. So this module owns the connection and hands each of
   them a listener plus an unsubscribe — the connection outlives any one
   component, the listeners do not.
   ══════════════════════════════════════════════════════════════════════════ */
import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL } from '../api/axiosInstance';

/** A message arrived on some thread — either side said it. */
export interface SupportMessageEvent {
  reference: string;
  message: {
    id: string;
    author: 'customer' | 'support' | 'system';
    authorName: string;
    body: string;
    at: string;
  } | null;
  ticket: Record<string, unknown>;
}

/** A thread was opened, resolved, assigned, re-prioritised. */
export interface SupportTicketEvent {
  reference?: string;
  ticket: Record<string, unknown>;
}

type MessageListener = (event: SupportMessageEvent) => void;
type TicketListener = (event: SupportTicketEvent) => void;

const messageListeners = new Set<MessageListener>();
const openedListeners = new Set<TicketListener>();
const updatedListeners = new Set<TicketListener>();

let socket: Socket | null = null;
/**
 * The token the live socket was opened with.
 *
 * Held so `connectSupportSocket` can be idempotent on the TOKEN rather than on
 * the mere existence of a socket. The difference is a security one: this
 * console is a single-page app, so signing out and signing back in on a shared
 * workstation never reloads the page, and a connection kept because "a socket
 * already exists" is the previous person's connection — sitting in the
 * server's `support` firehose, which carries every safety report and every
 * requester's phone number on the platform.
 */
let openedWith: string | null = null;
/** Reconnection is infinite; only the first failure of an outage is logged. */
let warnedOffline = false;

/**
 * The origin socket.io lives on.
 *
 * `http://localhost:5001/api` → `http://localhost:5001`. Written as a URL parse
 * rather than a string replace so a base of `https://api.lampose.com/api`
 * yields the host and not a mangled path.
 */
const socketOrigin = (): string => {
  try {
    const url = new URL(API_BASE_URL, window.location.origin);
    return url.origin;
  } catch {
    return window.location.origin;
  }
};

const fire = <T,>(set: Set<(event: T) => void>, event: T) => {
  set.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* One component throwing in its handler must not stop the others, and
         must not tear down the connection. */
    }
  });
};

/**
 * Open the connection for this admin session.
 *
 * Idempotent: calling it again while connected returns the existing socket
 * rather than opening a second one. The support page mounts and unmounts as
 * somebody moves between tabs, and a socket per mount is a socket per mount
 * that never closes.
 */
export function connectSupportSocket(token: string | null): Socket | null {
  if (!token) return null;

  /* Same person, existing connection — reuse it. The support page mounts and
     unmounts as somebody moves between tabs, and a socket per mount is a
     socket per mount that never closes. */
  if (socket && openedWith === token) return socket;

  /*
   * A DIFFERENT token means a different person, so the old socket is torn down
   * rather than reused. Belt and braces against `logout()` ever forgetting to
   * call `disconnectSupportSocket` — that omission shipped once already, and
   * its symptom was invisible: the login screen renders correctly while the
   * previous agent's stream keeps arriving in the same browser context.
   */
  if (socket) disconnectSupportSocket();

  openedWith = token;

  socket = io(socketOrigin(), {
    /* Both transports. A console behind a proxy that has not been taught to
       forward `Upgrade` still works, by long-polling — refusing the fallback
       would mean support silently loses live replies on exactly the
       deployments least likely to notice. */
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    warnedOffline = false;
  });

  socket.on('connect_error', (err: Error) => {
    if (warnedOffline) return;
    warnedOffline = true;
    console.warn(
      `[support socket] can't reach ${socketOrigin()} (${err?.message ?? err}) — `
      + 'the queue falls back to its poll.',
    );
  });

  /* The server disconnects a socket it cannot attribute. Worth saying once,
     because the cause is almost always an expired admin session and the
     symptom otherwise is "the page stopped updating". */
  socket.on('unauthorised', () => {
    console.warn('[support socket] this session is not valid for realtime updates.');
  });

  socket.on('support_message', (event: SupportMessageEvent) => fire(messageListeners, event));
  socket.on('support_ticket_opened', (event: SupportTicketEvent) => fire(openedListeners, event));
  socket.on('support_ticket_updated', (event: SupportTicketEvent) => fire(updatedListeners, event));

  return socket;
}

/** Close it. Called on sign-out, so the next admin does not inherit a room. */
export function disconnectSupportSocket(): void {
  try {
    socket?.removeAllListeners();
    socket?.disconnect();
  } catch {
    /* Already gone. */
  }
  socket = null;
  openedWith = null;
  warnedOffline = false;
}

/**
 * Watch one thread.
 *
 * The server decides whether this socket may join — it reads the ticket and
 * checks the asker is a party to it. An administrator is a party to every
 * thread, which is what working the queue means.
 */
export function trackTicket(reference: string): void {
  if (reference) socket?.emit('track_ticket', { reference });
}

export function untrackTicket(reference: string): void {
  if (reference) socket?.emit('untrack_ticket', { reference });
}

export const onSupportMessage = (listener: MessageListener): (() => void) => {
  messageListeners.add(listener);
  return () => { messageListeners.delete(listener); };
};

export const onTicketOpened = (listener: TicketListener): (() => void) => {
  openedListeners.add(listener);
  return () => { openedListeners.delete(listener); };
};

export const onTicketUpdated = (listener: TicketListener): (() => void) => {
  updatedListeners.add(listener);
  return () => { updatedListeners.delete(listener); };
};

/** Whether the live line is actually up — the page says so rather than lying. */
export const supportSocketConnected = (): boolean => !!socket?.connected;
