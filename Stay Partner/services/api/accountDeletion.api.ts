/**
 * Deleting the owner's account, from inside the app.
 *
 * The signed-in half of lampose.com/delete-account — same record on the
 * account, no code needed because the session is the proof. See
 * `Backend/src/modules/accountDeletion/`.
 *
 * IMMEDIATE, not a request: `requestAccountDeletion` erases the account on the
 * call, and the same token answers 401 `ACCOUNT_GONE` from then on — so the
 * caller signs out on success rather than reading anything else. The business
 * keeps a copy in a separate archive for legal and accounting records.
 *
 * `status: 'requested'` survives only on an account that asked before the
 * change (the old 30-day window). `cancelAccountDeletion` is kept for that one
 * case; a POST on such an account deletes it straight away.
 */
import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';

export type AccountDeletionStatus = 'none' | 'requested' | 'cancelled' | 'completed';

/** What GET (and the legacy DELETE) answer. */
export type AccountDeletion = {
  status: AccountDeletionStatus;
  immediate?: boolean;
  requestedAt: string | null;
  /** Only meaningful on a legacy `requested` row. */
  scheduledFor: string | null;
  graceDays: number;
  canCancel: boolean;
  supportEmail: string;
  /** Bookings still running at the owner's properties — reported, never a refusal. */
  activeBookings?: number;
};

/** What POST answers: the account is already gone when this arrives. */
export type AccountDeletionResult = {
  app: string;
  status: 'completed';
  deleted: true;
  deletedAt: string;
  immediate: true;
  graceDays: 0;
  canCancel: false;
  /** Work still open at the time — kept, but no longer managed from this account. */
  openWork?: { activeBookings?: number; activeOrders?: number };
  phoneMasked?: string;
  supportEmail?: string;
};

export async function fetchAccountDeletion(): Promise<AccountDeletion> {
  return unwrap(await api.get<ApiEnvelope<AccountDeletion>>(endpoints.partnerAccountDeletion));
}

export async function requestAccountDeletion(reason: string): Promise<AccountDeletionResult> {
  const body = reason.trim() ? { reason: reason.trim() } : {};
  return unwrap(await api.post<ApiEnvelope<AccountDeletionResult>>(endpoints.partnerAccountDeletion, body));
}

/** Legacy: withdraws a request made under the old 30-day window. */
export async function cancelAccountDeletion(): Promise<AccountDeletion> {
  return unwrap(await api.delete<ApiEnvelope<AccountDeletion>>(endpoints.partnerAccountDeletion));
}
