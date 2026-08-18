import { api, apiRequest, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type {
  BackendListing,
  BackendPartnerRequest,
  BackendPartnerSummary,
} from './types';

/**
 * What this partner owns, and who has asked about it.
 *
 * The two GETs below read data that already existed before this app did — the
 * onboarding flow wrote the properties, the User App's "Request a visit" wrote
 * the requests.
 *
 * `updateMyProperty` and `uploadPropertyImages` are the exception: they write.
 * See `propertyEdit.controller.js` on the backend for the shape of that
 * write — scoped to a property this partner's phone number owns, with no
 * administrator review before it lands.
 *
 * Scoping happens on the SERVER, by the phone number the partner proved. It is
 * worth saying why that matters: filtering a public feed client-side by owner
 * would put every other owner's properties, rents and phone numbers on the
 * device first and hide them second, which is not privacy — it is a longer
 * path to the same leak.
 */

export async function fetchSummary(signal?: AbortSignal): Promise<BackendPartnerSummary> {
  const envelope = await api.get<ApiEnvelope<BackendPartnerSummary>>(
    endpoints.partnerSummary,
    { signal },
  );
  return unwrap(envelope);
}

export async function fetchMyProperties(signal?: AbortSignal): Promise<BackendListing[]> {
  const envelope = await api.get<ApiEnvelope<BackendListing[]>>(
    endpoints.partnerProperties,
    { signal },
  );
  const data = unwrap(envelope);
  return Array.isArray(data) ? data : [];
}

export type PartnerRequestsResult = {
  requests: BackendPartnerRequest[];
  /** How many are still waiting on this owner and arrived since they last looked. */
  unread: number;
};

export async function fetchMyRequests(signal?: AbortSignal): Promise<PartnerRequestsResult> {
  const envelope = await api.get<ApiEnvelope<BackendPartnerRequest[]> & { unread?: number }>(
    endpoints.partnerRequests,
    { signal },
  );
  const data = unwrap(envelope);

  return {
    requests: Array.isArray(data) ? data : [],
    unread: typeof envelope.unread === 'number' ? envelope.unread : 0,
  };
}

export async function fetchMyRequest(
  id: string,
  signal?: AbortSignal,
): Promise<BackendPartnerRequest> {
  const envelope = await api.get<ApiEnvelope<BackendPartnerRequest>>(
    endpoints.partnerRequest(id),
    { signal },
  );
  return unwrap(envelope);
}

/**
 * Moves the read watermark on the requests list.
 *
 * Its own call rather than a side effect of the GET: a refetch, a retry or a
 * React Query background refresh must not be able to clear a badge nobody
 * actually looked at.
 */
export async function markRequestsRead(signal?: AbortSignal): Promise<void> {
  await api.post(endpoints.partnerRequestsRead, undefined, { signal });
}

/* ══════════════════════════════════════════════════════════════════════════
   Answering a stay request.

   Both are one call and both can legitimately fail — that is not an edge
   case, it is the normal consequence of four actors sharing one request. The
   student may have withdrawn it, the clock may have run out, or accepting
   somebody else may have taken the last bed a moment ago. The server names
   which, and the screens show that sentence rather than "something went
   wrong".

   Neither is retried automatically. A retry is a second attempt to take a bed
   and must be a person deciding to press again.
   ══════════════════════════════════════════════════════════════════════════ */

export type AcceptResult = {
  request: BackendPartnerRequest;
  /** The customer record this acceptance opened. */
  booking: { id: string; status: string } | null;
  /**
   * How many other students were turned away by this tap.
   *
   * Non-zero only when the bed just taken was the last one in that room type.
   * Surfaced because doing it silently is how an owner finds out from an
   * angry phone call instead of from their own screen.
   */
  autoDeclined: number;
};

export async function acceptRequest(id: string, signal?: AbortSignal): Promise<AcceptResult> {
  const envelope = await api.post<
    ApiEnvelope<BackendPartnerRequest> & {
      booking?: { id: string; status: string } | null;
      autoDeclined?: number;
    }
  >(endpoints.partnerRequestAccept(id), undefined, { signal });

  return {
    request: unwrap(envelope),
    booking: envelope.booking ?? null,
    autoDeclined: typeof envelope.autoDeclined === 'number' ? envelope.autoDeclined : 0,
  };
}

/**
 * Turn a request down.
 *
 * `reason` is the owner's own words from the reject sheet — kept apart from
 * the server's machine-readable `decisionReason`, which for this path is
 * always OWNER_DECLINED. Optional, because a decline without a reason is
 * still a decline and blocking on one would just teach owners to type "no".
 */
export async function declineRequest(
  id: string,
  reason?: string | null,
  signal?: AbortSignal,
): Promise<BackendPartnerRequest> {
  const envelope = await api.post<ApiEnvelope<BackendPartnerRequest>>(
    endpoints.partnerRequestDecline(id),
    { reason: reason || undefined },
    { signal },
  );
  return unwrap(envelope);
}

/* ------------------------------------------------------------------ *
 * Editing a listing
 * ------------------------------------------------------------------ */

/** One of this partner's own properties, every onboarding field included. */
export async function fetchMyProperty(id: string, signal?: AbortSignal): Promise<BackendListing> {
  const envelope = await api.get<ApiEnvelope<BackendListing>>(
    endpoints.partnerProperty(id),
    { signal },
  );
  return unwrap(envelope);
}


/**
 * What the edit screen may send. Every field is optional because a save only
 * carries what actually changed — see `propertyEdit.controller.js`'s
 * `applyEditableFields` for how each one is validated.
 *
 * `ownerMobile`, if sent, is accepted only when it equals the number this
 * session itself proved; anything else comes back as a 400 the screen shows
 * as-is, because the server's message already says why.
 */
export type UpdatePropertyInput = {
  name?: string;
  place?: string;
  ownerName?: string;
  ownerMobile?: string;
  category?: string;
  stayType?: string;
  shortStayDuration?: string;
  longStayDuration?: string;
  dailyPrice?: number;
  monthlyPrice?: number;
  rent?: number;
  deposit?: number;
  address?: string;
  description?: string;
  images?: string[];
  amenities?: string[];
  categoryDetails?: Record<string, unknown>;
};

export async function updateMyProperty(
  id: string,
  input: UpdatePropertyInput,
  signal?: AbortSignal,
): Promise<BackendListing> {
  const envelope = await api.patch<ApiEnvelope<BackendListing>>(
    endpoints.partnerProperty(id),
    input,
    { signal },
  );
  return unwrap(envelope);
}

/** What Cloudinary gave back for one property photograph. */
export type PropertyImage = { url: string; publicId: string };

/**
 * Uploads property photographs.
 *
 * `multipart/form-data`, not base64 JSON — see `uploadKycImages` in
 * `addCustomer.api.ts` for why. `apiRequest` is used directly for the same
 * reason: the client would otherwise set `Content-Type: application/json` and
 * strip the boundary `fetch` needs to write itself.
 */
export async function uploadPropertyImages(
  images: { uri: string; name?: string; mimeType?: string }[],
  signal?: AbortSignal,
): Promise<PropertyImage[]> {
  const form = new FormData();

  images.forEach((image, index) => {
    form.append('images', {
      uri: image.uri,
      name: image.name ?? `property-${index + 1}.jpg`,
      type: image.mimeType ?? 'image/jpeg',
      // React Native's FormData takes this shape; the DOM typings do not.
    } as unknown as Blob);
  });

  const envelope = await apiRequest<ApiEnvelope<PropertyImage[]>>(
    endpoints.partnerPropertyImageUpload,
    {
      method: 'POST',
      body: form,
      signal,
      /* Several photographs over a phone connection. The default 15s deadline
         fails a multi-image upload on anything short of good wifi. */
      timeoutMs: 90_000,
    },
  );

  const data = unwrap(envelope);
  return Array.isArray(data) ? data : [];
}
