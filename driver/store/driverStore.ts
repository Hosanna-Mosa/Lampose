import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { api, ApiError } from "@/utils/api";
import type { ChatMessage } from "@/utils/chatMessages";
import {
  isMockAuth,
  mockLogin,
  mockMe,
  mockPatchAccount,
  type AuthResponse,
} from "@/utils/mockAuth";
import { socketService } from "@/utils/socketService";

// ─── Domain types ─────────────────────────────────────────────────────────────

export type ServiceType = "delivery" | "bike" | "auto" | "cab" | "cab_prime" | "helper";

export type OrderStatus =
  | "pending"
  | "accepted"
  | "driver_assigned"
  | "en_route_pickup"
  | "arrived_pickup"
  | "picking_items"
  | "en_route_delivery"
  | "arrived_delivery"
  | "delivered"
  | "completed"
  | "cancelled";

export type OrderItem = { name: string; quantity: number; price?: number };

export type OrderStop = {
  type: "pickup" | "delivery" | "drop";
  lat: number;
  lng: number;
  address?: string;
  locationName?: string;
  items?: OrderItem[] | { lines?: OrderItem[] };
};

export type Order = {
  id: string;
  status: OrderStatus;
  serviceType: ServiceType | string;
  stops: OrderStop[];
  customerName?: string;
  customerPhone?: string;
  vendorName?: string;
  vendorPhone?: string;
  /** Kilometres, as returned by the routing service. */
  distance?: string;
  /** Minutes for deliveries and rides; booked hours for helper tasks. */
  duration?: string;
  polyline?: string;
  payout?: number;
  totalPrice?: number;
  paymentMode?: "cash" | "online";
  pickupCode?: string;
  deliveryOtp?: string;
  createdAt?: string;
};

export type EarningsSummary = {
  today: number;
  week: number;
  month: number;
  todayTrips: number;
  weekTrips: number;
  onlineMinutes: number;
  dailyTarget: number;
  /** Last 7 days, oldest first — drives the earnings bar chart. */
  weekly: { day: string; amount: number }[];
};

export type Vehicle = {
  type: "bike" | "scooter" | "auto" | "car";
  model?: string;
  plate?: string;
};

const EMPTY_EARNINGS: EarningsSummary = {
  today: 0,
  week: 0,
  month: 0,
  todayTrips: 0,
  weekTrips: 0,
  onlineMinutes: 0,
  dailyTarget: 1500,
  weekly: [],
};

// ─── Store shape ──────────────────────────────────────────────────────────────

type DriverState = {
  // Session
  token: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverUserId: string | null;
  hasCompletedOnboarding: boolean;
  identityVerified: boolean;
  vehicle: Vehicle | null;
  /** True once the persisted state has been read back from storage. */
  hydrated: boolean;

  // Duty
  isOnline: boolean;
  togglingDuty: boolean;

  // Work
  currentOrder: Order | null;
  orderRequests: Order[];
  history: Order[];
  loadingRequests: boolean;
  loadingHistory: boolean;

  // Earnings
  earnings: EarningsSummary;
  loadingEarnings: boolean;

  // Chat
  activeChat: ChatMessage[];
  unreadCount: number;
  isChatActive: boolean;

  // ── Actions ────────────────────────────────────────────────────────────────
  setAuthenticated: (
    name: string,
    phone: string,
    token: string,
    userId: string,
    extras?: { hasCompletedOnboarding?: boolean; identityVerified?: boolean },
  ) => void;
  loginWithPassword: (phone: string, password: string) => Promise<void>;
  refreshSession: () => Promise<boolean>;
  logout: () => Promise<void>;

  setHasCompletedOnboarding: (done: boolean) => void;
  setIdentityVerified: (verified: boolean) => void;
  setVehicle: (vehicle: Vehicle | null) => void;

  setOnline: (online: boolean) => Promise<void>;

  fetchOrderRequests: () => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  declineOrder: (orderId: string) => void;
  setCurrentOrder: (order: Order | null) => void;
  updateOrderStatus: (status: OrderStatus, code?: string) => Promise<void>;
  completeOrder: () => void;
  cancelOrder: (reason?: string) => Promise<void>;

  fetchEarnings: () => Promise<void>;
  fetchHistory: () => Promise<void>;

  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
  setUnreadCount: (count: number) => void;
  setIsChatActive: (active: boolean) => void;
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDriverStore = create<DriverState>()(
  persist(
    (set, get) => ({
      token: null,
      driverName: null,
      driverPhone: null,
      driverUserId: null,
      hasCompletedOnboarding: false,
      identityVerified: false,
      vehicle: null,
      hydrated: false,

      isOnline: false,
      togglingDuty: false,

      currentOrder: null,
      orderRequests: [],
      history: [],
      loadingRequests: false,
      loadingHistory: false,

      earnings: EMPTY_EARNINGS,
      loadingEarnings: false,

      activeChat: [],
      unreadCount: 0,
      isChatActive: false,

      // ── Session ──────────────────────────────────────────────────────────

      setAuthenticated: (name, phone, token, userId, extras) => {
        set({
          driverName: name,
          driverPhone: phone,
          token,
          driverUserId: userId,
          hasCompletedOnboarding: extras?.hasCompletedOnboarding ?? get().hasCompletedOnboarding,
          identityVerified: extras?.identityVerified ?? get().identityVerified,
        });
        socketService.connect(userId, token);
      },

      loginWithPassword: async (phone, password) => {
        const data = isMockAuth
          ? await mockLogin(phone, password)
          : await api<AuthResponse>("/api/v1/auth/login", {
              method: "POST",
              body: { phone, password, role: "DRIVER" },
            });

        const user = data.user;
        get().setAuthenticated(user.name, user.phone, data.token, user.id ?? user._id ?? "", {
          hasCompletedOnboarding: user.hasCompletedOnboarding,
          identityVerified: user.identityVerified,
        });
      },

      refreshSession: async () => {
        const token = get().token;
        if (!token) return false;

        try {
          const data = isMockAuth
            ? await mockMe(token)
            : await api<{ user: AuthResponse["user"] }>("/api/v1/auth/me", { token });

          const user = data?.user;
          if (user) {
            set({
              driverName: user.name ?? get().driverName,
              driverPhone: user.phone ?? get().driverPhone,
              driverUserId: user.id ?? user._id ?? get().driverUserId,
              hasCompletedOnboarding:
                user.hasCompletedOnboarding ?? get().hasCompletedOnboarding,
              identityVerified: user.identityVerified ?? get().identityVerified,
            });
          }
          socketService.connect(get().driverUserId, token);
          return true;
        } catch (err) {
          // Only a rejected token invalidates the session; a flaky network shouldn't
          // sign the driver out mid-shift.
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            await get().logout();
            return false;
          }
          socketService.connect(get().driverUserId, token);
          return true;
        }
      },

      logout: async () => {
        socketService.disconnect();
        set({
          token: null,
          driverName: null,
          driverPhone: null,
          driverUserId: null,
          identityVerified: false,
          hasCompletedOnboarding: false,
          vehicle: null,
          isOnline: false,
          currentOrder: null,
          orderRequests: [],
          history: [],
          earnings: EMPTY_EARNINGS,
          activeChat: [],
          unreadCount: 0,
          isChatActive: false,
        });
      },

      setHasCompletedOnboarding: (done) => {
        set({ hasCompletedOnboarding: done });
        // Keep the demo account in step so progress survives a sign-out.
        if (isMockAuth) mockPatchAccount(get().token, { hasCompletedOnboarding: done });
      },

      setIdentityVerified: (verified) => {
        set({ identityVerified: verified });
        if (isMockAuth) mockPatchAccount(get().token, { identityVerified: verified });
      },
      setVehicle: (vehicle) => set({ vehicle }),

      // ── Duty ─────────────────────────────────────────────────────────────

      setOnline: async (online) => {
        const { token, driverUserId } = get();
        set({ isOnline: online, togglingDuty: true });

        try {
          await api("/api/v1/drivers/me/duty", {
            method: "POST",
            body: { online },
            token,
          });
        } catch (err) {
          // Keep the local switch — the socket heartbeat re-asserts duty state.
          console.warn("[duty] sync failed:", (err as Error).message);
        } finally {
          set({ togglingDuty: false });
        }

        socketService.emit(online ? "driver_online" : "driver_offline", {
          driverId: driverUserId,
        });
        if (online) get().fetchOrderRequests();
        else set({ orderRequests: [] });
      },

      // ── Work ─────────────────────────────────────────────────────────────

      fetchOrderRequests: async () => {
        const { token, isOnline } = get();
        if (!token || !isOnline) return;

        set({ loadingRequests: true });
        try {
          const data = await api<{ orders?: Order[] } | Order[]>("/api/v1/orders/available", {
            token,
          });
          const orders = Array.isArray(data) ? data : (data?.orders ?? []);
          set({ orderRequests: orders.map(normaliseOrder) });
        } catch (err) {
          console.warn("[requests] fetch failed:", (err as Error).message);
        } finally {
          set({ loadingRequests: false });
        }
      },

      acceptOrder: async (orderId) => {
        const { token, orderRequests } = get();
        const local = orderRequests.find((o) => o.id === orderId);

        let accepted: Order | null = local ? { ...local, status: "accepted" } : null;
        try {
          const data = await api<{ order?: Order } | Order>(
            `/api/v1/orders/${orderId}/accept`,
            { method: "POST", token },
          );
          const fromServer = (data as { order?: Order })?.order ?? (data as Order);
          if (fromServer?.id || fromServer?.stops) accepted = normaliseOrder(fromServer);
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;
          console.warn("[accept] server sync failed, continuing locally:", (err as Error).message);
        }

        if (!accepted) throw new ApiError("That job is no longer available.", 410);

        set({
          currentOrder: accepted,
          orderRequests: orderRequests.filter((o) => o.id !== orderId),
          activeChat: [],
          unreadCount: 0,
        });
        socketService.trackOrder(accepted.id);
      },

      declineOrder: (orderId) =>
        set((s) => ({ orderRequests: s.orderRequests.filter((o) => o.id !== orderId) })),

      setCurrentOrder: (order) => {
        set({ currentOrder: order, activeChat: [], unreadCount: 0 });
        if (order?.id) socketService.trackOrder(order.id);
      },

      updateOrderStatus: async (status, code) => {
        const { currentOrder, token } = get();
        if (!currentOrder) return;

        try {
          await api(`/api/v1/orders/${currentOrder.id}/status`, {
            method: "PATCH",
            body: { status, code },
            token,
          });
        } catch (err) {
          // A 4xx means the server rejected the transition (usually a bad
          // verification code) — surface it. Transport failures fall through so
          // the driver isn't blocked by patchy coverage.
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;
          console.warn("[status] server sync failed, applying locally:", (err as Error).message);
        }

        set({ currentOrder: { ...currentOrder, status } });
        socketService.emit("order_status_update", {
          orderId: currentOrder.id,
          status,
        });
      },

      completeOrder: () => {
        const { currentOrder, history, earnings } = get();
        if (!currentOrder) return;

        const finished: Order = { ...currentOrder, status: "completed" };
        const payout = Number(finished.payout ?? finished.totalPrice ?? 0);

        socketService.untrackOrder(finished.id);
        set({
          currentOrder: null,
          history: [finished, ...history].slice(0, 100),
          activeChat: [],
          unreadCount: 0,
          isChatActive: false,
          earnings: {
            ...earnings,
            today: earnings.today + payout,
            week: earnings.week + payout,
            month: earnings.month + payout,
            todayTrips: earnings.todayTrips + 1,
            weekTrips: earnings.weekTrips + 1,
          },
        });
      },

      cancelOrder: async (reason) => {
        const { currentOrder, token } = get();
        if (!currentOrder) return;

        try {
          await api(`/api/v1/orders/${currentOrder.id}/cancel`, {
            method: "POST",
            body: { reason: reason ?? "Cancelled by driver" },
            token,
          });
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;
          console.warn("[cancel] server sync failed:", (err as Error).message);
        }

        socketService.untrackOrder(currentOrder.id);
        set({ currentOrder: null, activeChat: [], unreadCount: 0, isChatActive: false });
      },

      // ── Earnings & history ───────────────────────────────────────────────

      fetchEarnings: async () => {
        const { token } = get();
        if (!token) return;

        set({ loadingEarnings: true });
        try {
          const data = await api<Partial<EarningsSummary>>("/api/v1/drivers/me/earnings", {
            token,
          });
          set({ earnings: { ...EMPTY_EARNINGS, ...get().earnings, ...data } });
        } catch (err) {
          console.warn("[earnings] fetch failed:", (err as Error).message);
        } finally {
          set({ loadingEarnings: false });
        }
      },

      fetchHistory: async () => {
        const { token } = get();
        if (!token) return;

        set({ loadingHistory: true });
        try {
          const data = await api<{ orders?: Order[] } | Order[]>("/api/v1/orders/history", {
            token,
          });
          const orders = Array.isArray(data) ? data : (data?.orders ?? []);
          set({ history: orders.map(normaliseOrder) });
        } catch (err) {
          console.warn("[history] fetch failed:", (err as Error).message);
        } finally {
          set({ loadingHistory: false });
        }
      },

      // ── Chat ─────────────────────────────────────────────────────────────

      addChatMessage: (message) =>
        set((s) => {
          if (s.activeChat.some((m) => m.id === message.id)) return s;
          const fromCustomer = message.from === "customer";
          return {
            activeChat: [...s.activeChat, message],
            unreadCount: fromCustomer && !s.isChatActive ? s.unreadCount + 1 : s.unreadCount,
          };
        }),

      clearChat: () => set({ activeChat: [], unreadCount: 0 }),
      setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),
      setIsChatActive: (active) =>
        set(active ? { isChatActive: true, unreadCount: 0 } : { isChatActive: false }),
    }),
    {
      name: "driver-store",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({
        token: s.token,
        driverName: s.driverName,
        driverPhone: s.driverPhone,
        driverUserId: s.driverUserId,
        hasCompletedOnboarding: s.hasCompletedOnboarding,
        identityVerified: s.identityVerified,
        vehicle: s.vehicle,
        isOnline: s.isOnline,
        currentOrder: s.currentOrder,
        earnings: s.earnings,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn("[store] rehydrate failed:", error);
        // Flip the gate regardless — a failed read just means a cold start.
        useDriverStore.setState({ hydrated: true });
        if (state?.token) socketService.connect(state.driverUserId, state.token);
      },
    },
  ),
);

/** Coerce a server order payload into the shape the screens expect. */
function normaliseOrder(raw: any): Order {
  const stops: OrderStop[] = Array.isArray(raw?.stops)
    ? raw.stops.map((s: any) => ({
        type: String(s?.type ?? "pickup").toLowerCase() as OrderStop["type"],
        lat: Number(s?.lat ?? s?.latitude ?? 0),
        lng: Number(s?.lng ?? s?.longitude ?? 0),
        address: s?.address ?? "",
        locationName: s?.locationName ?? s?.name ?? "",
        items: s?.items,
      }))
    : [];

  return {
    ...raw,
    id: String(raw?.id ?? raw?._id ?? ""),
    status: String(raw?.status ?? "pending").toLowerCase() as OrderStatus,
    serviceType: String(raw?.serviceType ?? "delivery").toLowerCase(),
    stops,
  };
}

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectPickupStop = (order: Order | null): OrderStop | undefined =>
  order?.stops?.find((s) => s.type === "pickup");

export const selectDropStop = (order: Order | null): OrderStop | undefined =>
  order?.stops?.find((s) => s.type === "delivery" || s.type === "drop");

/** Flatten whichever stop is carrying the line items. */
export const selectOrderItems = (order: Order | null): OrderItem[] => {
  for (const stop of order?.stops ?? []) {
    const items = stop.items;
    if (Array.isArray(items) && items.length) return items;
    const lines = (items as { lines?: OrderItem[] } | undefined)?.lines;
    if (Array.isArray(lines) && lines.length) return lines;
  }
  return [];
};

export const isRideService = (serviceType?: string): boolean =>
  ["bike", "auto", "cab", "cab_prime"].includes(String(serviceType ?? "").toLowerCase());

export const isHelperService = (serviceType?: string): boolean =>
  String(serviceType ?? "").toLowerCase() === "helper";
