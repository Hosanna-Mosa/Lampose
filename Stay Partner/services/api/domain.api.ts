import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';

// ── Bookings ────────────────────────────────────────────────────────────────
export async function fetchBookings(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any[]>>(endpoints.partnerBookings, { signal });
  return unwrap(res) || [];
}

export async function fetchBookingById(id: string, signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any>>(endpoints.partnerBooking(id), { signal });
  return unwrap(res);
}

export async function checkInBookingApi(id: string) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerBookingCheckin(id));
  return unwrap(res);
}

export async function checkOutBookingApi(id: string) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerBookingCheckout(id));
  return unwrap(res);
}

export async function cancelBookingApi(id: string) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerBookingCancel(id));
  return unwrap(res);
}

// ── Earnings & Payouts ──────────────────────────────────────────────────────
export async function fetchEarningsApi(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any>>(endpoints.partnerEarnings, { signal });
  return unwrap(res);
}

export async function fetchPayoutsApi(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any[]>>(endpoints.partnerPayouts, { signal });
  return unwrap(res) || [];
}

export async function fetchPayoutByIdApi(id: string, signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any>>(endpoints.partnerPayout(id), { signal });
  return unwrap(res);
}

export async function fetchPaymentMethodsApi(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any[]>>(endpoints.partnerPaymentMethods, { signal });
  return unwrap(res) || [];
}

export async function addPaymentMethodApi(data: any) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerPaymentMethods, data);
  return unwrap(res);
}

export async function deletePaymentMethodApi(id: string) {
  const res = await api.delete<ApiEnvelope<any>>(endpoints.partnerPaymentMethod(id));
  return unwrap(res);
}

// ── Complaints ──────────────────────────────────────────────────────────────
export async function fetchComplaintsApi(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any[]>>(endpoints.partnerComplaints, { signal });
  return unwrap(res) || [];
}

export async function fetchComplaintByIdApi(id: string, signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any>>(endpoints.partnerComplaint(id), { signal });
  return unwrap(res);
}

/**
 * Close a complaint, or reopen one.
 *
 * The "Mark resolved" button was calling `resolveComplaint` from
 * `lib/complaints.ts`, which mutates a fixture array in memory — the row
 * changed on screen and came back on the next load, because nothing had been
 * written. This is the endpoint that actually persists it.
 */
export async function updateComplaintStatusApi(
  id: string,
  status: 'open' | 'in_progress' | 'resolved',
  signal?: AbortSignal,
) {
  const res = await api.patch<ApiEnvelope<any>>(
    endpoints.partnerComplaint(id),
    { status },
    { signal },
  );
  return unwrap(res);
}

export async function createComplaintApi(data: any) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerComplaints, data);
  return unwrap(res);
}

// ── Notifications ───────────────────────────────────────────────────────────
export async function fetchNotificationsApi(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any[]> & { unreadCount?: number }>(endpoints.partnerNotifications, { signal });
  return {
    items: unwrap(res) || [],
    unreadCount: res.unreadCount ?? 0,
  };
}

export async function markNotificationReadApi(id: string) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerNotificationRead(id));
  return unwrap(res);
}

// ── Staff ───────────────────────────────────────────────────────────────────
export async function fetchStaffApi(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any[]>>(endpoints.partnerStaff, { signal });
  return unwrap(res) || [];
}

export async function inviteStaffApi(data: any) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerStaffInvite, data);
  return unwrap(res);
}

export async function removeStaffApi(id: string) {
  const res = await api.delete<ApiEnvelope<any>>(endpoints.partnerStaffDelete(id));
  return unwrap(res);
}

// ── Reviews ─────────────────────────────────────────────────────────────────
export async function fetchReviewsApi(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any[]> & { averageRating?: number }>(endpoints.partnerReviews, { signal });
  return {
    reviews: unwrap(res) || [],
    averageRating: res.averageRating ?? 4.8,
  };
}

// ── Referrals ───────────────────────────────────────────────────────────────
export async function fetchReferralsApi(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any>>(endpoints.partnerReferrals, { signal });
  return unwrap(res);
}

export async function withdrawReferralApi() {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerReferralsWithdraw);
  return unwrap(res);
}

// ── Share Types ─────────────────────────────────────────────────────────────
export async function fetchShareTypesApi(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any[]>>(endpoints.partnerShareTypes, { signal });
  return unwrap(res) || [];
}

export async function toggleShareTypesAvailabilityApi(isAvailable: boolean) {
  const res = await api.patch<ApiEnvelope<any>>(endpoints.partnerShareTypesAvailability, { isAvailable });
  return unwrap(res);
}
