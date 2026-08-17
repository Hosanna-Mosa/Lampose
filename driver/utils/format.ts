/** Display helpers shared across screens so money and time look the same everywhere. */

export const rupees = (amount: number | string | null | undefined, decimals = 0): string => {
  const n = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `₹${safe.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

export const distanceLabel = (km: number | string | null | undefined): string => {
  const n = typeof km === "string" ? parseFloat(km) : (km ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`;
};

export const minutesLabel = (mins: number | string | null | undefined): string => {
  const n = typeof mins === "string" ? parseFloat(mins) : (mins ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
};

/** Seconds → `HH:MM:SS`, for the running task timer. */
export const clock = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

/** Seconds → `M:SS`, for short countdowns. */
export const countdown = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
};

export const timeOfDay = (date: Date = new Date()): string =>
  date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const greeting = (date: Date = new Date()): string => {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

/** Human label for an order status token. */
export const statusLabel = (status: string | null | undefined): string => {
  const map: Record<string, string> = {
    pending: "Pending",
    accepted: "Accepted",
    driver_assigned: "Assigned",
    en_route_pickup: "To pickup",
    arrived_pickup: "At pickup",
    picking_items: "Verifying",
    en_route_delivery: "To drop",
    arrived_delivery: "At drop",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  const key = String(status ?? "").toLowerCase();
  return map[key] ?? (key.replace(/_/g, " ") || "Unknown");
};
