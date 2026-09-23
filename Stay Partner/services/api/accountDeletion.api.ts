/**
 * Asking to delete the owner's account, from inside the app.
 *
 * The signed-in half of lampose.com/delete-account — same request, same
 * `deletion` record on the account, no code needed because the session is
 * the proof. See `Backend/src/modules/accountDeletion/`.
 *
 * A REQUEST, not a deletion: the account is scheduled `graceDays` out, so
 * guests already staying are not stranded, payouts owed are still paid, and
 * the owner can change their mind with `cancelAccountDeletion` until the date.
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
  /** Bookings still running at the owner's properties — reported, never a refusal. */
  activeBookings?: number;
  alreadyRequested?: boolean;
};

export async function fetchAccountDeletion(): Promise<AccountDeletion> {
  return unwrap(await api.get<ApiEnvelope<AccountDeletion>>(endpoints.partnerAccountDeletion));
}

export async function requestAccountDeletion(reason: string): Promise<AccountDeletion> {
  const body = reason.trim() ? { reason: reason.trim() } : {};
  return unwrap(await api.post<ApiEnvelope<AccountDeletion>>(endpoints.partnerAccountDeletion, body));
}

export async function cancelAccountDeletion(): Promise<AccountDeletion> {
  return unwrap(await api.delete<ApiEnvelope<AccountDeletion>>(endpoints.partnerAccountDeletion));
}
