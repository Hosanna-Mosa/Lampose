/**
 * Asking to delete the student's account, from inside the app.
 *
 * The signed-in half of lampose.com/delete-account — same request, same
 * `deletion` record on the account, no code needed because the session is the
 * proof. See `Backend/src/modules/accountDeletion/`.
 *
 * A REQUEST, not a deletion: the account is scheduled `graceDays` out, so a
 * stay in progress or a food order on its way carries on, refunds owed are
 * still paid, and the student can change their mind with
 * `cancelAccountDeletion` until the date.
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
};

export async function fetchAccountDeletion(): Promise<AccountDeletion> {
  return unwrap(await api.get<ApiEnvelope<AccountDeletion>>(endpoints.customerAccountDeletion));
}

export async function requestAccountDeletion(reason: string): Promise<AccountDeletion> {
  const body = reason.trim() ? { reason: reason.trim() } : {};
  return unwrap(await api.post<ApiEnvelope<AccountDeletion>>(endpoints.customerAccountDeletion, body));
}

export async function cancelAccountDeletion(): Promise<AccountDeletion> {
  return unwrap(await api.delete<ApiEnvelope<AccountDeletion>>(endpoints.customerAccountDeletion));
}
