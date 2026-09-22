/* ══════════════════════════════════════════════════════════════════════════
   The live line to the kitchen.

   Before this file the Orders screen had two ways of learning about an order,
   and both had a hole in them:

     · a PUSH, which needs a registered device token — and there is none on a
       simulator, none on a refused permission, and none before the first
       successful registration. The first restaurant in production had zero.
     · a POLL every twenty seconds, which works, but arrives up to twenty
       seconds late and SILENTLY: the list grows by one and nothing says so.

   So a kitchen with no push registration found out about an order by noticing
   that the screen had changed. This is the third way, and it is the one that
   needs nothing but the session the app is already holding: the backend emits
   `order_placed` into the `restaurant:<id>` room the moment the order is
   written, and the tablet on the counter chimes.

   ## It is an optimisation, exactly like the rider's

   The same rule the Driver app follows. Everything this delivers is also
   readable over HTTP — the twenty-second poll stays exactly as it was, and a
   deployment with no socket server degrades to it. Nothing about the order
   queue depends on this connection being up; it only decides how quickly, and
   how audibly, the kitchen finds out.

   ## One connection, several subscribers

   Support rides this socket too (`services/support.ts`). It is the same room —
   the server fans a support event for this restaurant into `restaurant:<id>`,
   exactly as it does an order — so a second `io()` would buy nothing and cost
   a second reconnect loop, a second set of rooms and a second thing to close
   on sign-out. `onSocketEvent`/`emitSocket` below are the general form of
   `onOrderPlaced`, and everything in the app goes through them.

   ## The token is the same session the REST calls carry

   `restaurant:<restaurantId>` is derived by the server from the token's own
   claims (`rooms.foodpartner`), never from anything the client asks to join —
   so one kitchen cannot subscribe to another's queue by sending an id.
   ══════════════════════════════════════════════════════════════════════════ */
import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";

export type OrderPlaced = {
  orderNumber: string;
  grandTotal: number;
  itemCount: number;
  summary: string;
  placedAt: string;
};

/**
 * Everything that happens to an order that is already in the kitchen.
 *
 * One payload, three audiences — the diner, the rider and the restaurant all
 * receive this same object (`dispatchUpdate` in the backend's
 * `foodDispatch.service.js`, fanned out by `toOrderParties`), which is why it
 * carries the rider rather than anything kitchen-shaped. The fields this app
 * reads are `status` and `orderNumber`; the rest arrives on the next refresh
 * of the order itself, from the endpoint that is the authority on it.
 */
export type DispatchUpdate = {
  orderNumber: string;
  status: string;
  dispatchState?: "idle" | "searching" | "assigned" | "unassigned";
  paymentStatus?: string;
  rider?: { name?: string; phone?: string } | null;
  failureReason?: string;
};

let socket: Socket | null = null;
/** Reconnection is infinite; only the first failure of each outage is logged. */
let warnedOffline = false;

type SocketHandler = (payload: any) => void;

/*
 * Every listener anybody has asked for, by event name.
 *
 * Held HERE rather than on the socket, because the socket is not a stable
 * object: `disconnectOrderSocket` removes all of its listeners and nulls it,
 * and it is called both on sign-out and by the teardown of `startOrderPump`
 * whenever the session token changes. A screen that had attached straight to
 * the instance would go silent at that moment, and its unsubscribe closure
 * would quietly become a no-op.
 *
 * So subscribers register with the module, the module attaches them to
 * whichever socket currently exists, and `connectOrderSocket` re-attaches the
 * whole registry to a newly created one. That also covers the other half of
 * the same problem: a listener registered BEFORE anything connected — a
 * support thread opened on a cold start — is attached the moment there is
 * something to attach it to, rather than being dropped on the floor.
 */
const subscribers = new Map<string, Set<SocketHandler>>();

/** Put every registered listener onto a socket that has just been created. */
const attachAll = (s: Socket) => {
  subscribers.forEach((handlers, event) => {
    handlers.forEach((handler) => s.on(event, handler));
  });
};

/**
 * Open the connection for this partner session.
 *
 * Idempotent on the token: calling it again with the same session returns the
 * existing socket rather than opening a second one, because the Orders screen
 * mounts and unmounts as the kitchen moves between tabs and a socket per mount
 * is a socket per mount that never closes.
 */
export function connectOrderSocket(token: string | null): Socket | null {
  if (!API_URL || !token) return null;
  if (socket) return socket;

  socket = io(API_URL, {
    /* Not websocket-only: behind a reverse proxy that does not forward the
       Upgrade/Connection headers (see Backend/deploy/nginx-api.lampose.com.conf
       and its own note on this), a pure WebSocket handshake never completes
       and this app has nothing else — the support thread screen in particular
       has no poll of its own and depends entirely on this connection for a
       reply to appear without leaving and coming back. `polling` is the
       fallback every other app's socket client already keeps (User App,
       Stay Partner, Admin); this one had quietly dropped it. */
    transports: ["websocket", "polling"],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 10000,
  });

  socket.on("connect", () => {
    warnedOffline = false;
  });

  socket.on("connect_error", (err) => {
    /* Warned once per outage, not once per retry. An unreachable server
       retries forever by design, and a log line per second buries everything
       else in the console. */
    if (warnedOffline) return;
    warnedOffline = true;
    console.warn(
      `[socket] can't reach ${API_URL} (${err?.message ?? err}) — `
      + "the order queue falls back to its poll.",
    );
  });

  /* Whatever was already waiting for events — a support screen that mounted
     before the session hydrated, or a listener left over from the socket this
     one replaces. */
  attachAll(socket);

  return socket;
}

/**
 * Subscribe to one event on the app's single socket.
 *
 * The general form of `onOrderPlaced`, added when support started riding this
 * connection. Two things it does that a bare `socket.on` cannot:
 *
 *   · it works before there IS a socket. The registry holds the listener and
 *     `connectOrderSocket` attaches it, so a screen mounted during a cold
 *     start is live as soon as the connection is.
 *   · it survives the socket being replaced. `disconnectOrderSocket` throws
 *     the instance away on every sign-out and on every token change; the
 *     registry is what makes the next one carry the same subscribers.
 *
 * Returns an unsubscribe, so a screen can attach without owning the socket's
 * lifetime — the connection outlives any one screen, the listener does not.
 */
export function onSocketEvent(event: string, handler: SocketHandler): () => void {
  let handlers = subscribers.get(event);
  if (!handlers) {
    handlers = new Set<SocketHandler>();
    subscribers.set(event, handlers);
  }
  handlers.add(handler);
  socket?.on(event, handler);

  return () => {
    handlers?.delete(handler);
    socket?.off(event, handler);
  };
}

/**
 * Send something up the same connection.
 *
 * A no-op with no socket, and that is the correct behaviour rather than a
 * silent failure to paper over: everything this app emits — `track_ticket` is
 * the only one today — is an optimisation on top of a room the handshake
 * already put us in, and an HTTP refetch covers whatever the socket missed.
 * socket.io itself buffers a packet emitted while a live socket is merely
 * disconnected and flushes it on reconnect.
 */
export function emitSocket(event: string, payload?: unknown): void {
  socket?.emit(event, payload);
}

/**
 * Listen for new orders.
 *
 * Kept as its own named function — the order queue is the reason this file
 * exists and reads better than a string at the call site — but routed through
 * the registry above, so the pump also survives the socket being recreated.
 */
export function onOrderPlaced(handler: (order: OrderPlaced) => void): () => void {
  return onSocketEvent("order_placed", handler as SocketHandler);
}

/**
 * Listen for what happens to an order after it is placed.
 *
 * The other half of the queue, and named for the same reason `onOrderPlaced`
 * is: an order arriving and an order being taken away are the two things this
 * connection exists to say. The server sends this into `restaurant:<id>` on
 * every cancellation and every rider event, so it is also how a rider's name
 * reaches the card without waiting for the poll.
 */
export function onDispatchUpdate(handler: (update: DispatchUpdate) => void): () => void {
  return onSocketEvent("dispatch_update", handler as SocketHandler);
}

/**
 * The server refusing this session.
 *
 * Sent once, immediately before the server hangs the socket up itself. That
 * matters because socket.io reconnects from every kind of drop EXCEPT a
 * server-side disconnect — so unlike a dropped kitchen wifi, this one never
 * comes back on its own, and an app that ignored it would sit there looking
 * connected forever. `orderPump` turns it into a signed-out state.
 */
export function onUnauthorised(handler: (payload: { message?: string }) => void): () => void {
  return onSocketEvent("unauthorised", handler as SocketHandler);
}

/**
 * Close it. Called on sign-out, so the next partner does not inherit a room.
 *
 * The subscriber registry is deliberately NOT cleared. The listeners in it
 * belong to screens that are still mounted — this is also called from the
 * order pump's teardown, which runs on any token change, not only on a
 * sign-out — and dropping them would leave those screens attached to nothing
 * with no way to notice. The rooms are the sensitive part, and they are gone
 * with the connection: the next socket joins from its own token's claims.
 */
export function disconnectOrderSocket(): void {
  try {
    socket?.removeAllListeners();
    socket?.disconnect();
  } catch {
    /* Already gone. */
  }
  socket = null;
  warnedOffline = false;
}
