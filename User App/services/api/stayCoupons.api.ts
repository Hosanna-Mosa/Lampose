import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type { BackendStayCoupon } from './types';

/**
 * Every ₹100 move-in reward this customer holds, newest first.
 *
 * An empty array is the ordinary answer — most customers have not moved in
 * through the app yet — so nothing here treats "none" as a failure.
 */
export async function fetchStayCoupons(signal?: AbortSignal): Promise<readonly BackendStayCoupon[]> {
  const envelope = await api.get<ApiEnvelope<BackendStayCoupon[]>>(
    endpoints.customerStayCoupons,
    { signal },
  );
  return unwrap(envelope) ?? [];
}
