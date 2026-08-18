import { useQuery } from '@tanstack/react-query';

import { fetchMyCoupon } from '@/services/api/foodCoupon.api';
import { ApiError } from '@/services/api/client';
import { queryKeys } from './keys';

/**
 * The food-order discount a referral code may have unlocked.
 *
 * `enabled` should be `status === 'signedIn'` at the call site — there is
 * nothing to fetch for a guest, and calling this endpoint without a session
 * is just a 401 the screen would otherwise have to swallow.
 */
export function useMyCoupon(enabled: boolean) {
  const query = useQuery({
    queryKey: queryKeys.myCoupon,
    queryFn: ({ signal }) => fetchMyCoupon(signal),
    enabled,
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 1,
  });

  return {
    ...query,
    coupon: query.data ?? null,
  };
}
