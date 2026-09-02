import { create } from "zustand";
import type { OrdersTab, Period } from "@/constants/lampose";

/**
 * Screen state, and nothing else.
 *
 * This store used to run the delivery itself: a simulated duty toggle, a
 * five-second wait, a thirty-second countdown and a six-stage march, all driven
 * by timers in the screens. That is now real — `driverStore` holds the session,
 * the duty switch, the live offer and the job in hand, and every one of them
 * comes from the backend.
 *
 * What is left here is the part that has no server side: which sheet is open,
 * which tab is selected, which toast is showing. Deliberately NOT merged into
 * `driverStore`, because those two things fail differently — a toast is lost on
 * a re-render and nobody minds, and a job in hand is persisted to disk because
 * losing it strands a rider on a doorstep.
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
  | null;

type FlowState = {
  overlay: OverlayKey;
  toast: string | null;

  ordersTab: OrdersTab;
  period: Period;
  switches: Record<string, boolean>;

  setOverlay: (overlay: OverlayKey) => void;
  say: (message: string) => void;
  clearToast: () => void;

  setOrdersTab: (tab: OrdersTab) => void;
  setPeriod: (period: Period) => void;
  toggleSwitch: (key: string) => void;
};

/** The rider's countdown, matching `OFFER_SECONDS` on the server. */
export const REQUEST_SECONDS = 15;
/** Five, and every one of them is reachable — see `STAGES`. */
export const TOTAL_STAGES = 5;

export const useFlowStore = create<FlowState>()((set) => ({
  overlay: null,
  toast: null,

  ordersTab: "Active",
  period: "Today",
  switches: { orders: true, earnings: true, incentives: true, news: false },

  setOverlay: (overlay) => set({ overlay }),
  say: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),

  setOrdersTab: (ordersTab) => set({ ordersTab }),
  setPeriod: (period) => set({ period }),
  toggleSwitch: (key) => set((s) => ({ switches: { ...s.switches, [key]: !s.switches[key] } })),
}));
