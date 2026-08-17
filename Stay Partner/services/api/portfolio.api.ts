import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type {
  BackendListing,
  BackendPartnerRequest,
  BackendPartnerSummary,
} from './types';

/**
 * What this partner owns, and who has asked about it.
 *
 * Both read data that already existed before this app did — the onboarding
 * flow wrote the properties, the User App's "Request a visit" wrote the
 * requests. Nothing here creates anything, which is exactly why these are the
 * first screens that can be real without a new domain being invented first.
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
