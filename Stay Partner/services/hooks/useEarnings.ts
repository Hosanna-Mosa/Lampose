import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import { API_BASE_URL_CONFIGURED } from '@/services/api/config';
import { fetchEarningsApi, fetchPayoutsApi, requestPayoutApi } from '@/services/api/domain.api';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from './keys';

/**
 * Earnings and payouts, for real.
 *
 * `fetchEarningsApi`/`fetchPayoutsApi`/`requestPayoutApi` have existed since
 * the backend gained a real `payout.service.js` — nothing called any of them.
 * The Earnings tile on the dashboard had its `onPress` removed with a comment
 * explaining why ("the Payouts tab it used to open is gone") rather than a
 * screen behind it. This hook, and `app/earnings/index.tsx`, is that screen.
 */
function useReady() {
  const { status } = useAuth();
  return API_BASE_URL_CONFIGURED && status === 'signedIn';
}

export function useEarnings() {
  const enabled = useReady();
  const query = useQuery({
    queryKey: queryKeys.earnings,
    queryFn: async ({ signal }) => fetchEarningsApi(signal),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  return {
    ...query,
    earnings: query.data ?? null,
    error: query.error as ApiError | null,
  };
}

export function usePayouts() {
  const enabled = useReady();
  const query = useQuery({
    queryKey: queryKeys.payouts,
    queryFn: async ({ signal }) => fetchPayoutsApi(signal),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  return {
    ...query,
    payouts: query.data ?? [],
    error: query.error as ApiError | null,
  };
}

/**
 * "Request payout" — the owner's own button.
 *
 * Reserves whatever `earnings.availableBalance` says is owed into a new
 * `pending` `PartnerPayout` row against the owner's saved payment method.
 * Refused (`NO_PAYMENT_METHOD` / `NOTHING_TO_PAY_OUT`) with a message this
 * screen shows as-is — see `payout.service.js`.
 */
export function useRequestPayout() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => requestPayoutApi(),
    retry: false,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.earnings });
      queryClient.invalidateQueries({ queryKey: queryKeys.payouts });
    },
  });

  return {
    requestPayout: mutation.mutateAsync,
    isRequesting: mutation.isPending,
    error: mutation.error as ApiError | null,
  };
}
