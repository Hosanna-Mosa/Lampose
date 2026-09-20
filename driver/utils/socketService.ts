import { io, Socket } from "socket.io-client";

import { logWarn } from "@/services/log";

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
  private driverId: string | null = null;
  /** Reconnection is infinite; only report the first failure of each outage. */
  private warnedOffline = false;

  get connected(): boolean {
    return !!this.socket?.connected;
  }

  connect(driverId?: string | null, token?: string | null): Socket | null {
    if (!API_URL) {
      logWarn("[socket] EXPO_PUBLIC_API_URL is not set — realtime disabled.");
      return null;
    }
    if (driverId) this.driverId = driverId;
    if (this.socket) return this.socket;

    this.socket = io(API_URL, {
      transports: ["websocket"],
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
    });

    this.socket.on("connect_error", (err) => {
      if (this.warnedOffline) return;
      this.warnedOffline = true;
      logWarn(
        `[socket] can't reach ${API_URL} (${err?.message ?? err}) — retrying quietly in the background.`,
      );
    });

    // Flush listeners that were registered before the socket existed.
    this.pending.forEach((listeners, event) => {
      listeners.forEach((fn) => this.socket?.on(event, fn));
    });

    return this.socket;
  }

  disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.trackedOrders.clear();
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
      logWarn(`[socket] dropped "${event}" — not connected.`);
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
