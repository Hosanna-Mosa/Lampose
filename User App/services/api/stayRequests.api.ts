import { api, apiRequest, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type { BackendStayRequest } from './types';

/**
 * "Ask this owner for a bed" — the one thing this app writes.
 *
 * ## What replaced the website's flow, and why
 *
 * This used to be four calls with a one-time code in the middle: create, an
 * SMS to the student, verify, then the owner on WhatsApp. That design was
 * forced by the website having no accounts — a guest's phone could only be
 * proved at the moment they asked, and an owner with no app could only be
 * reached on WhatsApp.
 *
 * Neither is true here. The student's number was proved at sign-in and the
 * owner is holding a phone with the Stay Partner app on it. So there is no
 * code, no WhatsApp, and the deadline is minutes rather than a day.
 *
 * ## Three things this deliberately does not send
 *
 *   the student's identity   the session says who they are; a name in the
 *                            body would be a name anybody could put there
 *   the owner's number       read off the property server-side, which is what
 *                            stops this being a way to ring a stranger
 *   `expiresAt`              a client-chosen deadline is a client deciding how
 *                            long it holds somebody else's bed
 *
 * Every price is likewise re-derived server-side, so the intent below carries
 * a stay and a date and no money at all.
 */

/** The stay, in the shape the server validates it in. */
export type StayIntent = {
  /** Which of the two rate tracks. Absent on bed-priced categories. */
  stayType?: 'short' | 'long';
  /** Nights on a short stay, months on a long one. */
  duration?: number;
  durationUnit?: 'days' | 'months';
  /** `YYYY-MM-DD`, and inside the window the listing reported. */
  joiningDate?: string;
  /** "A day or two either way" — it is what lets an owner say yes. */
  flexibleJoin?: boolean;
};

export type CreateStayRequestInput = {
  listingId: string;
  /** The chosen option's LABEL, exactly as the listing offered it. */
  sharing: string;
  intent?: StayIntent | null;
  /**
   * The Privacy Policy and Terms tick.
   *
   * Refused by the server without it, and rightly: it is the record that the
   * student agreed before their name and number reached a property owner.
   */
  consentedTerms: boolean;
  signal?: AbortSignal;
};

export async function createStayRequest({
  signal,
  ...input
}: CreateStayRequestInput): Promise<BackendStayRequest> {
  const envelope = await api.post<ApiEnvelope<BackendStayRequest>>(
    endpoints.stayRequests,
    {
      listingId: input.listingId,
      sharing: input.sharing,
      intent: input.intent ?? undefined,
      consentedTerms: input.consentedTerms === true,
    },
    { signal },
  );
  return unwrap(envelope);
}

/**
 * What the countdown screen polls.
 *
 * Never cached. The whole screen is a live answer to "has the owner replied
 * yet", and a stale one is the only thing it must never show.
 */
export async function fetchStayRequest(
  id: string,
  signal?: AbortSignal,
): Promise<BackendStayRequest> {
  const envelope = await api.get<ApiEnvelope<BackendStayRequest>>(
    endpoints.stayRequest(id),
    { signal },
  );
  return unwrap(envelope);
}

export type StayRequestsResult = {
  requests: BackendStayRequest[];
  /** How many are still counting down. */
  active: number;
};

export async function fetchStayRequests(signal?: AbortSignal): Promise<StayRequestsResult> {
  const envelope = await api.get<ApiEnvelope<BackendStayRequest[]> & { active?: number }>(
    endpoints.stayRequests,
    { signal },
  );
  return {
    requests: unwrap(envelope) ?? [],
    active: typeof envelope.active === 'number' ? envelope.active : 0,
  };
}

/**
 * Pull a request back before anybody has answered it.
 *
 * Terminal on success — there is no re-opening. A second attempt comes back
 * `REQUEST_CANCELLED`, and one the owner has already accepted comes back
 * `ALREADY_ACCEPTED`, which is a good outcome badly timed rather than an
 * error to apologise for.
 */
export async function withdrawStayRequest(
  id: string,
  signal?: AbortSignal,
): Promise<BackendStayRequest> {
  const envelope = await apiRequest<ApiEnvelope<BackendStayRequest>>(
    endpoints.stayRequestWithdraw(id),
    { method: 'POST', signal },
  );
  return unwrap(envelope);
}

/**
 * The student's half of moving in.
 *
 * Refused with `OWNER_HAS_NOT_CONFIRMED` until the owner has marked them in
 * from the Stay Partner app. That order is deliberate: the owner checks the
 * PIN and opens the door, so a student who could confirm beforehand would be
 * recording an arrival nobody let happen.
 *
 * Idempotent — a second tap keeps the first timestamp.
 */
export async function confirmMovedIn(
  id: string,
  signal?: AbortSignal,
): Promise<{ bookingId: string; movedIn: boolean }> {
  const envelope = await apiRequest<ApiEnvelope<{ bookingId: string; movedIn: boolean }>>(
    endpoints.stayRequestMovedIn(id),
    { method: 'POST', signal },
  );
  return unwrap(envelope);
}
