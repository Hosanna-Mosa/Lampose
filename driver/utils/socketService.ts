import { io, Socket } from "socket.io-client";
import { API_URL } from "./api";

type Listener = (...args: any[]) => void;

/**
 * Single shared socket.io connection for the Driver app.
 *
 * Listeners registered before `connect()` are buffered and attached once the
 * socket exists, so screens can subscribe without caring about connect order.
 */
class SocketService {
  private socket: Socket | null = null;
  private pending = new Map<string, Set<Listener>>();
  private trackedOrders = new Set<string>();
  /* Ticket rooms, re-joined on reconnect exactly as order rooms are. They
     were joined once on open, so a reply arriving after any network blip
     went to a room this socket was no longer in. */
  private trackedTickets = new Set<string>();
  private driverId: string | null = null;
  /* The token this socket was opened with. A different one (signed in
     again) means a new socket — the old one kept authenticating as the
     session that had ended. */
  private token: string | null = null;
  /** Reconnection is infinite; only report the first failure of each outage. */
  private warnedOffline = false;

  get connected(): boolean {
    return !!this.socket?.connected;
  }

  connect(driverId?: string | null, token?: string | null): Socket | null {
    if (!API_URL) {
      console.warn("[socket] EXPO_PUBLIC_API_URL is not set — realtime disabled.");
      return null;
    }
    if (driverId) this.driverId = driverId;
    if (this.socket && token && this.token && token !== this.token) this.teardown();
    if (this.socket) return this.socket;
    this.token = token ?? null;

    this.socket = io(API_URL, {
      /* Not websocket-only: behind a reverse proxy that does not forward the
         Upgrade/Connection headers (see Backend/deploy/nginx-api.lampose.com.conf
         and its own note on this), a pure WebSocket handshake never completes
         and this connection carries a rider's 15-second offer window — the one
         thing in this app polling was never meant to be relied on for.
         `polling` is the fallback every other app's socket client already
         keeps (User App, Stay Partner, Admin); this one had quietly dropped
         it, identically to Food-Partner's `orderSocket.ts`. */
      transports: ["websocket", "polling"],
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 10000,
    });

    this.socket.on("connect", () => {
      this.warnedOffline = false;
      // Re-join any rooms we were watching before the drop. Duty is NOT
      // re-asserted here: it lives on `POST /me/duty`, and a socket that could
      // put a rider back on duty would put them back on after a reconnect they
      // did not ask for.
      this.trackedOrders.forEach((orderNumber) =>
        this.socket?.emit("track_order", { orderNumber }),
      );
      this.trackedTickets.forEach((reference) =>
        this.socket?.emit("track_ticket", { reference }),
      );
    });

    /* The server's word for a token it will not take, sent just before it
       hangs up. socket.io never reconnects after a SERVER-side disconnect, so
       this connection is finished: drop it, and the next `connect()` (the
       store calls it on every profile read) opens a fresh one with whatever
       token is current. It used to sit dead with offers silently not
       arriving. */
    this.socket.on("unauthorised", () => {
      console.warn("[socket] the server refused this session — will reconnect on the next profile read.");
      this.teardown();
    });
    this.socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") this.teardown();
    });

    this.socket.on("connect_error", (err) => {
      if (this.warnedOffline) return;
      this.warnedOffline = true;
      console.warn(
        `[socket] can't reach ${API_URL} (${err?.message ?? err}) — retrying quietly in the background.`,
      );
    });

    // Flush listeners that were registered before the socket existed.
    this.pending.forEach((listeners, event) => {
      listeners.forEach((fn) => this.socket?.on(event, fn));
    });

    return this.socket;
  }

  /** Close the socket but remember the rooms, so a new one re-joins them. */
  private teardown() {
    const socket = this.socket;
    this.socket = null;
    this.token = null;
    socket?.removeAllListeners();
    socket?.disconnect();
  }

  disconnect() {
    this.teardown();
    this.trackedOrders.clear();
    this.trackedTickets.clear();
  }

  on(event: string, listener: Listener) {
    if (!this.pending.has(event)) this.pending.set(event, new Set());
    this.pending.get(event)!.add(listener);
    this.socket?.on(event, listener);
  }

  off(event: string, listener: Listener) {
    this.pending.get(event)?.delete(listener);
    this.socket?.off(event, listener);
  }

  emit(event: string, payload?: unknown) {
    if (!this.socket?.connected) {
      console.warn(`[socket] dropped "${event}" — not connected.`);
      return;
    }
    this.socket.emit(event, payload);
  }

  /**
   * Watch one order.
   *
   * The server decides whether this socket may join: it reads the order and
   * checks that this rider is the one assigned to it. Asking for a room is not
   * the same as being let into it, which is what stops a six-digit order number
   * being enough to watch a stranger's delivery.
   */
  trackOrder(orderNumber: string) {
    if (!orderNumber) return;
    this.trackedOrders.add(orderNumber);
    this.emit("track_order", { orderNumber });
  }

  trackTicket(reference: string) {
    if (!reference) return;
    this.trackedTickets.add(reference);
    if (this.socket?.connected) this.socket.emit("track_ticket", { reference });
  }

  untrackTicket(reference: string) {
    this.trackedTickets.delete(reference);
    if (this.socket?.connected) this.socket.emit("untrack_ticket", { reference });
  }

  untrackOrder(orderNumber: string) {
    this.trackedOrders.delete(orderNumber);
    this.emit("untrack_order", { orderNumber });
  }

  /**
   * Broadcast the rider's position to whoever is watching this order.
   *
   * A RELAY, not a write. The position the dispatcher matches on is set by
   * `PATCH /me/location`, which is validated and rate-limited; this is the
   * copy that moves the marker on the diner's map between those. The server
   * drops it unless the socket is actually in that order's room.
   */
  sendLocation(payload: {
    orderNumber: string;
    lat: number;
    lng: number;
    heading?: number;
  }) {
    this.emit("driver_location", payload);
  }
}

export const socketService = new SocketService();
export default socketService;
