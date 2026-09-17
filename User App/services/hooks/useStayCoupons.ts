import { useQuery } from '@tanstack/react-query';

import { fetchStayCoupons } from '@/services/api/stayCoupons.api';
import { ApiError } from '@/services/api/client';
import { queryKeys } from './keys';

/**
 * The ₹100 rewards earned by moving in.
 *
 * `enabled` should be `status === 'signedIn'` at the call site, like
 * `useMyCoupon` — there is nothing to fetch for a guest and the endpoint
 * would only 401.
 *
 * `spendable` comes off each row rather than being recomputed here; see
 * `BackendStayCoupon`.
 */
export function useStayCoupons(enabled: boolean) {
  const query = useQuery({
    queryKey: queryKeys.stayCoupons,
    queryFn: ({ signal }) => fetchStayCoupons(signal),
    enabled,
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 1,
  });

  const coupons = query.data ?? [];

  return {
    ...query,
    coupons,
    spendable: coupons.filter((coupon) => coupon.spendable),
  };
}
