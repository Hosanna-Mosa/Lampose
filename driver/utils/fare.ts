import type { Order } from "@/store/driverStore";

export type FareLine = { label: string; amount: number };

export type FareBreakdown = {
  lines: FareLine[];
  total: number;
  /** True when the server didn't send a breakdown and we derived one locally. */
  estimated: boolean;
};

/** Local fallback rates, used only when the server sends no breakdown. */
const BASE_FARE = 40;
const PER_KM = 6;

/**
 * Build the payout breakdown shown when a job completes.
 *
 * Prefers whatever the server sent (`fareBreakdown` / `payout`). If neither is
 * present — offline completion, or a backend that doesn't itemise yet — it
 * derives a base + distance estimate and flags it as such rather than inventing
 * bonuses that were never earned.
 */
export function buildFareBreakdown(
  order: Order | null,
  { waitingCompensation = 0 }: { waitingCompensation?: number } = {},
): FareBreakdown {
  const serverLines = (order as any)?.fareBreakdown;

  if (Array.isArray(serverLines) && serverLines.length > 0) {
    const lines: FareLine[] = serverLines
      .map((l: any) => ({
        label: String(l?.label ?? "Adjustment"),
        amount: Number(l?.amount ?? 0),
      }))
      .filter((l) => Number.isFinite(l.amount));

    if (waitingCompensation > 0) {
      lines.push({ label: "Waiting compensation", amount: waitingCompensation });
    }

    const declared = Number(order?.payout ?? order?.totalPrice ?? NaN);
    const summed = lines.reduce((sum, l) => sum + l.amount, 0);

    return {
      lines,
      total: Number.isFinite(declared) ? declared : summed,
      estimated: false,
    };
  }

  const distance = parseFloat(String(order?.distance ?? "0")) || 0;
  const distanceFare = Math.round(distance * PER_KM);

  const lines: FareLine[] = [
    { label: "Base fare", amount: BASE_FARE },
    { label: `Distance (${distance.toFixed(1)} km)`, amount: distanceFare },
  ];
  if (waitingCompensation > 0) {
    lines.push({ label: "Waiting compensation", amount: waitingCompensation });
  }

  const derived = lines.reduce((sum, l) => sum + l.amount, 0);
  const declared = Number(order?.payout ?? order?.totalPrice ?? NaN);

  // If the server declared a payout, trust it and reconcile the difference.
  if (Number.isFinite(declared) && Math.abs(declared - derived) > 0.5) {
    lines.push({ label: "Incentives & tips", amount: Math.round((declared - derived) * 100) / 100 });
    return { lines, total: declared, estimated: false };
  }

  return { lines, total: Number.isFinite(declared) ? declared : derived, estimated: true };
}

/** ₹0.50 per minute of waiting once the driver is at the pickup point. */
export const waitingFeeFor = (seconds: number): number =>
  Math.round((seconds / 60) * 0.5 * 100) / 100;
