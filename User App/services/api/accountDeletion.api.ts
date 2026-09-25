/**
 * Asking to delete the student's account, from inside the app.
 *
 * The signed-in half of lampose.com/delete-account — same request, same
 * `deletion` record on the account, no code needed because the session is the
 * proof. See `Backend/src/modules/accountDeletion/`.
 *
 * IMMEDIATE: `requestAccountDeletion` erases the account on the call, and the
 * same token answers 401 `ACCOUNT_GONE` on every request after it. The business
 * keeps a copy (bookings, orders, payments, account details) in a separate
 * archive for legal and accounting records.
 *
 * `status: 'requested'` can only come back on an account that asked while
 * deletion was still scheduled 30 days out. `cancelAccountDeletion` is kept for
 * that legacy case alone; a new request can no longer be cancelled.
 */
import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';

export type AccountDeletionStatus = 'none' | 'requested' | 'cancelled' | 'completed';

export type AccountDeletion = {
  status: AccountDeletionStatus;
  requestedAt: string | null;
  scheduledFor: string | null;
  graceDays: number;
  canCancel: boolean;
  supportEmail: string;
  /** Still in flight — reported, never a refusal. */
  activeOrders?: number;
  activeBookings?: number;
  alreadyRequested?: boolean;
  /** Always true now — deletion is carried out on the request. */
  immediate?: boolean;
};

/** What `POST` answers: the account is already gone when this arrives. */
export type AccountDeletionResult = {
  app: string;
  status: 'completed';
  deleted: boolean;
  deletedAt: string | null;
  immediate: boolean;
  graceDays: number;
  canCancel: false;
  /** Left exactly as it was — no longer manageable from this account. */
  openWork: { activeBookings?: number; activeOrders?: number };
  phoneMasked?: string;
  supportEmail?: string;
};

export async function fetchAccountDeletion(): Promise<AccountDeletion> {
  return unwrap(await api.get<ApiEnvelope<AccountDeletion>>(endpoints.customerAccountDeletion));
}

export async function requestAccountDeletion(reason: string): Promise<AccountDeletionResult> {
  const body = reason.trim() ? { reason: reason.trim() } : {};
  return unwrap(await api.post<ApiEnvelope<AccountDeletionResult>>(endpoints.customerAccountDeletion, body));
}

/** Legacy only — withdraws a request made while deletion was scheduled. */
export async function cancelAccountDeletion(): Promise<AccountDeletion> {
  return unwrap(await api.delete<ApiEnvelope<AccountDeletion>>(endpoints.customerAccountDeletion));
}
