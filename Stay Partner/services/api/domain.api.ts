import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';

// ── Bookings ────────────────────────────────────────────────────────────────
/**
 * `category` asks the SERVER to filter, rather than fetching everything and
 * narrowing it on the phone — the same real category enum the backend
 * already validates requests against (`PG_HOSTEL` / `BACHELOR` / `HOTEL` /
 * `COLIVE`), so a bad value here is simply ignored server-side rather than
 * silently returning nothing.
 */
export async function fetchBookings(category?: string, signal?: AbortSignal) {
  const path = category
    ? `${endpoints.partnerBookings}?category=${encodeURIComponent(category)}`
    : endpoints.partnerBookings;
  const res = await api.get<ApiEnvelope<any[]>>(path, { signal });
  return unwrap(res) || [];
}

export async function fetchBookingById(id: string, signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any>>(endpoints.partnerBooking(id), { signal });
  return unwrap(res);
}

/**
 * Mark a guest in.
 *
 * `code` is what the guest showed at the door. The SERVER compares it to the
 * booking's entry PIN and refuses a mismatch (`BAD_PIN`) — the app no longer
 * has the PIN to compare against, which is the point. A walk-in has no PIN
 * and needs no code.
 */
export async function checkInBookingApi(id: string, code?: string) {
  const res = await api.post<ApiEnvelope<any>>(
    endpoints.partnerBookingCheckin(id),
    code ? { code } : {},
  );
  return unwrap(res);
}

/**
 * DEVELOPMENT ONLY — force both halves of a move-in without a real code or
 * the check-in date having arrived.
 *
 * 404s unless the server has `DEV_ALLOW_FORCE_CHECKIN` on, which is refused
 * outright under NODE_ENV=production — see `devForceCheckInOwner` on the
 * backend. Drawn only behind `PREVIEW_CONTROLS` on this side.
 */
export async function devForceCheckInOwnerApi(id: string) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerBookingDevForceCheckin(id));
  return unwrap(res);
}

export async function checkOutBookingApi(id: string) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerBookingCheckout(id));
  return unwrap(res);
}

/**
 * Cancel a booking, with the reason the owner picked.
 *
 * The reason was collected by `booking/cancel.tsx` and then thrown away — the
 * chips were required before the button enabled, and nothing was ever sent.
 * It is stored against the booking now, so a support call about "why was I
 * cancelled" has an answer.
 */
export async function cancelBookingApi(
  id: string,
  body?: { reason?: string; note?: string },
) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerBookingCancel(id), body);
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

/**
 * "Request payout" — reserves whatever `earnings.availableBalance` says is
 * owed (every `completed` booking not already claimed by an earlier payout)
 * into a new `pending` `PartnerPayout` row against the owner's saved payment
 * method. Refused with a clear message if there is no payment method saved
 * yet, or nothing to pay out.
 *
 * Dispatching the money itself — over RazorpayX — is a separate, later step
 * an administrator takes; see `Backend/src/modules/partners/payout.service.js`.
 * This call only ever creates a `pending` row.
 */
export async function requestPayoutApi() {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerPayoutRequest);
  return unwrap(res);
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

/**
 * Make one saved account the one payouts go to.
 *
 * Sends only the id. The server demotes the others in the same request, so
 * two screens can never disagree about which account is primary.
 */
export async function setPrimaryPaymentMethodApi(id: string) {
  const res = await api.patch<ApiEnvelope<any>>(endpoints.partnerPaymentMethodPrimary(id));
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
/**
 * Answer a review.
 *
 * Saved on the review itself and returned to every student who opens the
 * listing — see `GET /listings/:id/reviews`. Replaces an earlier reply.
 */
export async function replyToReviewApi(id: string, text: string) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerReviewReply(id), { text });
  return unwrap(res);
}

export async function fetchReviewsApi(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any[]> & { averageRating?: number }>(endpoints.partnerReviews, { signal });
  return {
    reviews: unwrap(res) || [],
    /* Null, not 4.8. No reviews means no average; the screen says so. */
    averageRating: typeof res.averageRating === 'number' ? res.averageRating : null,
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

// ── Customer invites (refer a customer, not another owner) ──────────────────
export type CreateInviteInput = {
  propertyId?: string;
  guestPhone?: string;
  guestName?: string;
  /** Reuse an existing customer's already-proven phone instead of a fresh OTP. */
  bookingId?: string;
};

export async function createInviteApi(data: CreateInviteInput) {
  const res = await api.post<ApiEnvelope<any>>(endpoints.partnerInvites, data);
  return unwrap(res);
}

export async function fetchInvitesApi(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<any[]>>(endpoints.partnerInvites, { signal });
  return unwrap(res) || [];
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

/**
 * Take ONE room type off, or put it back on.
 *
 * Unlike `toggleShareTypesAvailabilityApi`, which is the partner-wide switch
 * and moves every room type this owner has, this is what the per-row
 * switches on the Share Types screen should be calling — see the note there.
 */
export async function setShareTypeAvailability(shareTypeId: string, isAvailable: boolean) {
  const res = await api.patch<ApiEnvelope<{ shareTypeId: string; isAvailable: boolean }>>(
    endpoints.partnerShareTypeAvailability(shareTypeId),
    { isAvailable },
  );
  return unwrap(res);
}
