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
  private driverId: string | null = null;
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
      if (this.driverId) this.socket?.emit("driver_online", { driverId: this.driverId });
      // Re-join any rooms we were watching before the drop.
      this.trackedOrders.forEach((orderId) => this.socket?.emit("track_order", { orderId }));
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
      console.warn(`[socket] dropped "${event}" — not connected.`);
      return;
    }
    this.socket.emit(event, payload);
  }

  /** Join an order's room so its chat and status events reach this client. */
  trackOrder(orderId: string) {
    if (!orderId) return;
    this.trackedOrders.add(orderId);
    this.emit("track_order", { orderId });
  }

  untrackOrder(orderId: string) {
    this.trackedOrders.delete(orderId);
    this.emit("untrack_order", { orderId });
  }

  /** Broadcast the driver's position for live customer tracking. */
  sendLocation(payload: {
    driverId: string;
    lat: number;
    lng: number;
    heading?: number;
    orderId?: string;
  }) {
    this.emit("driver_location_update", payload);
  }
}

export const socketService = new SocketService();
export default socketService;
