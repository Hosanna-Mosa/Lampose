import { create } from "zustand";
import type { OrdersTab, Period, Phase } from "@/constants/lampose";

/**
 * Delivery-flow state, mirroring the prototype's state machine:
 * duty toggle → searching → request (30s) → active (6 stages) → complete.
 *
 * Kept separate from `driverStore`, which owns the session. This is the part
 * that a live dispatch API would eventually drive.
 */

export type OverlayKey =
  | "gps"
  | "permission"
  | "network"
  | "server"
  | "docexpired"
  | "problem"
  | "cancel"
  | "logout"
  | "withdraw"
  | null;

type FlowState = {
  online: boolean;
  phase: Phase;
  stage: number;
  countdown: number;
  overlay: OverlayKey;
  toast: string | null;

  ordersTab: OrdersTab;
  period: Period;
  switches: Record<string, boolean>;

  onlineSecs: number;
  earned: number;
  orderCount: number;

  goOnline: () => void;
  goOffline: () => void;
  setPhase: (phase: Phase) => void;
  startRequest: () => void;
  tickCountdown: () => void;
  acceptOrder: () => void;
  declineOrder: () => void;
  advanceStage: () => void;
  completeDelivery: () => void;
  resetFlow: () => void;

  setOverlay: (overlay: OverlayKey) => void;
  say: (message: string) => void;
  clearToast: () => void;

  setOrdersTab: (tab: OrdersTab) => void;
  setPeriod: (period: Period) => void;
  toggleSwitch: (key: string) => void;
};

export const REQUEST_SECONDS = 30;
export const TOTAL_STAGES = 6;

export const useFlowStore = create<FlowState>()((set, get) => ({
  online: false,
  phase: "idle",
  stage: 0,
  countdown: REQUEST_SECONDS,
  overlay: null,
  toast: null,

  ordersTab: "Active",
  period: "Today",
  switches: { orders: true, earnings: true, incentives: true, news: false },

  onlineSecs: 23040,
  earned: 842,
  orderCount: 12,

  goOnline: () => set({ online: true, phase: "connecting" }),
  goOffline: () => set({ online: false, phase: "idle", stage: 0 }),
  setPhase: (phase) => set({ phase }),

  startRequest: () => set({ phase: "request", countdown: REQUEST_SECONDS }),

  tickCountdown: () => {
    const next = get().countdown - 1;
    if (next <= 0) set({ countdown: 0, phase: "expired" });
    else set({ countdown: next });
  },

  acceptOrder: () => set({ phase: "active", stage: 0, overlay: null }),
  declineOrder: () => set({ phase: "searching", overlay: null }),

  advanceStage: () => {
    const s = get().stage;
    if (s < TOTAL_STAGES - 1) set({ stage: s + 1 });
  },

  completeDelivery: () =>
    set((s) => ({
      phase: "done",
      earned: s.earned + 86,
      orderCount: s.orderCount + 1,
    })),

  resetFlow: () => set({ phase: "searching", stage: 0, countdown: REQUEST_SECONDS }),

  setOverlay: (overlay) => set({ overlay }),
  say: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),

  setOrdersTab: (ordersTab) => set({ ordersTab }),
  setPeriod: (period) => set({ period }),
  toggleSwitch: (key) => set((s) => ({ switches: { ...s.switches, [key]: !s.switches[key] } })),
}));
