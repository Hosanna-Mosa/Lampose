/* ══════════════════════════════════════════════════════════════════════════
   Asking to delete the rider's account, from inside the app.

   The signed-in half of lampose.com/delete-account — same handlers, no code
   needed because the session is the proof. See
   `Backend/src/modules/accountDeletion/`.

   IMMEDIATE: `requestDeletion` erases the account on the tap and answers
   `status: 'completed'`. The same token is refused ACCOUNT_GONE from then on,
   so the caller signs out straight after. A delivery in hand does not stop it
   — the order is kept, the rider just can no longer manage it.

   `cancelDeletion` survives for one case only: an account that asked BEFORE
   deletion became immediate still carries a `requested` row with a date on it.
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
  /** Always true now; kept so a stale server is visible rather than guessed. */
  immediate?: boolean;
};

/** What `POST` answers: the account is already gone when this arrives. */
export type DeletionResult = {
  app: string;
  status: "completed";
  deleted: boolean;
  deletedAt: string | null;
  immediate: boolean;
  graceDays: number;
  canCancel: boolean;
  /** Work that was in hand at the moment of deletion — kept, not refused. */
  openWork?: { activeOrders?: number };
  phoneMasked?: string;
  supportEmail?: string;
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

/** Legacy only — withdraws a request made before deletion became immediate. */
export async function cancelDeletion(token: string): Promise<DeletionState> {
  const res = await api<Envelope<DeletionState>>(PATH, { method: "DELETE", token });
  return res.data;
}
