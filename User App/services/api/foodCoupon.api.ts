import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type { BackendFoodCoupon } from './types';

/**
 * This customer's food-order discount, if a referral earned them one.
 *
 * `null` is a normal answer, not a missing one — most customers have never
 * entered an owner's invite code, and this is what the profile screen reads
 * to decide whether to show the reward card at all.
 */
export async function fetchMyCoupon(signal?: AbortSignal): Promise<BackendFoodCoupon> {
  const envelope = await api.get<ApiEnvelope<BackendFoodCoupon>>(endpoints.customerFoodCoupon, { signal });
  return unwrap(envelope);
}
