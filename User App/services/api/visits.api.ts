import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type { BackendVisitRequest } from './types';

/**
 * "Request a visit" — the one thing this app writes to the database.
 *
 * ## The order is the safety property
 *
 * Four calls, and they must happen in this sequence:
 *
 *   1. `createVisitRequest`  the form goes in, an SMS code comes back to the
 *                            customer's own phone. **The owner is told
 *                            nothing at this point.**
 *   2. `verifyVisitRequest`  the code is checked, and only then is the owner
 *                            messaged on WhatsApp.
 *   3. `pollVisitRequest`    until the owner replies AVAILABLE or does not.
 *
 * Step 1 not reaching the owner is the whole design. Without it, a button on
 * a public listing page is a way to make a stranger's phone ring under an
 * invented name — and the owner's number is read from the property document
 * server-side precisely so it can never be supplied by a caller.
 *
 * ## Nothing priced is sent
 *
 * The intent below carries a stay type, a duration and a date. It carries no
 * rate and no total, and if it did the server would discard them:
 * `validateIntent` rebuilds the money from the property's own figures. The
 * sharing option is the only thing the caller names, and only as a label the
 * server looks up in the property's own list.
 */

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */

export type VisitIntent = {
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

export type CreateVisitRequestInput = {
  listingId: string;
  name: string;
  /** Ten digits or E.164. The server normalises and rejects non-mobiles. */
  phone: string;
  /** Required by the server, and validated there. Receipts go to it. */
  email: string;
  /** The chosen sharing option's LABEL, exactly as the listing offered it. */
  sharing?: string | null;
  intent?: VisitIntent | null;
  /**
   * The Privacy Policy and Terms tick.
   *
   * Required by the server on the full stay-intent path and refused without
   * it. Not a formality: it is the legal record that the student agreed
   * before their name and number were sent to a property owner.
   */
  consentedTerms?: boolean;
  /** Whether the outcome may also be sent to them on WhatsApp. */
  consentWhatsApp?: boolean;
  signal?: AbortSignal;
};

export type CreateVisitRequestResult = {
  request: BackendVisitRequest;
  /**
   * True when this phone already had a request in flight for this listing.
   *
   * The server hands back the one already waiting rather than ringing the
   * owner a second time, and it arrives already verified — so the screen
   * skips the code step instead of asking for one that was never sent.
   */
  alreadyPending: boolean;
};

export async function createVisitRequest({
  signal,
  ...input
}: CreateVisitRequestInput): Promise<CreateVisitRequestResult> {
  const envelope = await api.post<ApiEnvelope<BackendVisitRequest> & { alreadyPending?: boolean }>(
    endpoints.visitRequests,
    {
      listingId: input.listingId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      sharing: input.sharing ?? undefined,
      intent: input.intent ?? undefined,
      consentedTerms: input.consentedTerms === true,
      consentWhatsApp: input.consentWhatsApp === true,
    },
    { signal },
  );

  return {
    request: unwrap(envelope),
    alreadyPending: envelope.alreadyPending === true,
  };
}

/* ------------------------------------------------------------------ *
 * Verify, resend, poll
 * ------------------------------------------------------------------ */

/**
 * The code, and then the owner.
 *
 * Verifying an already-verified request is not an error and is the expected
 * retry when the WhatsApp message failed: the server skips the code check
 * and tries the owner again. So a screen that got `OWNER_NOTIFY_FAILED` may
 * call this a second time with no code at all.
 */
export async function verifyVisitRequest(
  id: string,
  otp: string,
  signal?: AbortSignal,
): Promise<BackendVisitRequest> {
  const envelope = await api.post<ApiEnvelope<BackendVisitRequest>>(
    endpoints.visitRequestVerify(id),
    { otp },
    { signal },
  );
  return unwrap(envelope);
}

/**
 * A fresh code.
 *
 * Rate limited server-side, and the cooldown comes back on the response
 * rather than being a number this app decides. `RESEND_TOO_SOON` carries a
 * `retryAfter` in seconds on the error payload.
 */
export async function resendVisitOtp(
  id: string,
  signal?: AbortSignal,
): Promise<BackendVisitRequest> {
  const envelope = await api.post<ApiEnvelope<BackendVisitRequest>>(
    endpoints.visitRequestResend(id),
    undefined,
    { signal },
  );
  return unwrap(envelope);
}

/** What the waiting screen polls. Never cached — the server says so too. */
export async function pollVisitRequest(
  id: string,
  signal?: AbortSignal,
): Promise<BackendVisitRequest> {
  const envelope = await api.get<ApiEnvelope<BackendVisitRequest>>(
    endpoints.visitRequest(id),
    { signal },
  );
  return unwrap(envelope);
}
