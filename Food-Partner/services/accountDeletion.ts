/* ══════════════════════════════════════════════════════════════════════════
   Asking to delete the kitchen's account, from inside the app.

   The signed-in half of lampose.com/delete-account — same request, same
   `deletion` record on the account, no code needed because the session is the
   proof. See `Backend/src/modules/accountDeletion/`.

   IMMEDIATE: `requestDeletion` erases the account on the call and answers
   `status: 'completed'`; the same token is refused (401 ACCOUNT_GONE) from
   then on. `status: 'requested'` only survives on an account that asked
   before deletion became immediate — `cancelDeletion` exists for that
   legacy case alone.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from "./api";

const PATH = "/api/v2/food-partners/me/account-deletion";

export type DeletionStatus = "none" | "requested" | "cancelled" | "completed";

export type DeletionState = {
  status: DeletionStatus;
  requestedAt: string | null;
  scheduledFor: string | null;
  graceDays: number;
  canCancel: boolean;
  supportEmail: string;
  /** Orders still in the kitchen — reported, never a refusal. */
  activeOrders?: number;
  alreadyRequested?: boolean;
  immediate?: boolean;
};

/** The reply to `requestDeletion` — the account no longer exists. */
export type DeletionResult = {
  app: string;
  status: "completed";
  deleted: true;
  deletedAt: string | null;
  immediate: true;
  graceDays: 0;
  canCancel: false;
  /** Work that was open at the moment of deletion — kept, not refused. */
  openWork: { activeOrders?: number };
  phoneMasked?: string;
  supportEmail: string;
};

type Envelope<T> = { success: boolean; data: T; message?: string };

export async function fetchDeletion(token: string): Promise<DeletionState> {
  const res = await api<Envelope<DeletionState>>(PATH, { token });
  return res.data;
}

export async function requestDeletion(token: string, reason: string): Promise<DeletionResult> {
  const res = await api<Envelope<DeletionResult>>(PATH, {
    method: "POST",
    token,
    body: reason.trim() ? { reason: reason.trim() } : {},
  });
  return res.data;
}

/** Legacy only: withdraws a request made before deletion became immediate. */
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
