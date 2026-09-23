/* ══════════════════════════════════════════════════════════════════════════
   Asking to delete the rider's account, from inside the app.

   The signed-in half of lampose.com/delete-account — same request, same
   `deletion` record on the account, no code needed because the session is the
   proof. See `Backend/src/modules/accountDeletion/`.

   A REQUEST, not a deletion: the account is scheduled `graceDays` out, so a
   rider carrying an order can still finish it and be paid for it, and can
   change their mind with `cancelDeletion` until the date.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from "@/utils/api";

const PATH = "/api/v2/drivers/me/account-deletion";

export type DeletionStatus = "none" | "requested" | "cancelled" | "completed";

export type DeletionState = {
  status: DeletionStatus;
  requestedAt: string | null;
  scheduledFor: string | null;
  graceDays: number;
  canCancel: boolean;
  supportEmail: string;
  /** Deliveries still in hand — reported, never a refusal. */
  activeOrders?: number;
  alreadyRequested?: boolean;
};

type Envelope<T> = { success: boolean; data: T; message?: string };

export async function fetchDeletion(token: string): Promise<DeletionState> {
  const res = await api<Envelope<DeletionState>>(PATH, { token });
  return res.data;
}

export async function requestDeletion(token: string, reason: string): Promise<DeletionState> {
  const res = await api<Envelope<DeletionState>>(PATH, {
    method: "POST",
    token,
    body: reason.trim() ? { reason: reason.trim() } : {},
  });
  return res.data;
}

export async function cancelDeletion(token: string): Promise<DeletionState> {
  const res = await api<Envelope<DeletionState>>(PATH, { method: "DELETE", token });
  return res.data;
}

/** "12 October 2026" — a date somebody can hold against a calendar. */
export function longDate(value: string | null | undefined): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}
