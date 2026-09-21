import { useQuery } from '@tanstack/react-query';

import { fetchDish, fetchKitchen, fetchKitchens, type KitchenQuery } from '@/services/api/food.api';
import { ApiError } from '@/services/api/client';
import { queryKeys } from './keys';

/**
 * The kitchen feed, one kitchen, and one dish.
 *
 * ## Why these are queries rather than state in a screen
 *
 * The same feed is read by the food home, the search screen and the
 * favourites list. Held in each screen's state that is three fetches of the
 * same rows and three chances for them to disagree about a price. Keyed
 * through React Query the later ones are answered from the cache and every
 * screen holds the same objects.
 *
 * ## Staleness is short, for the same reason listings' is
 *
 * A minute. A kitchen switches a dish off — or switches itself CLOSED —
 * mid-service from the partner app, and a student holding a stale menu adds
 * it to a cart that will be refused at the counter, or keeps browsing a
 * kitchen that stopped taking orders five minutes ago.
 *
 * `refetchInterval` rather than "re-fetches on focus", because
 * `FoodCatalogueProvider` mounts once at the app's root and never remounts
 * for the life of the session — a customer who never backgrounds the app
 * (the common case: they are actively browsing) would otherwise hold the
 * feed's first answer indefinitely. The interval matches `STALE_MS` so a
 * closed kitchen clears within the same window the staleness promise
 * already describes, and it costs one request per kitchen the feed loaded,
 * not per screen visited.
 */

const STALE_MS = 60_000;

/**
 * A refused request is not retried; an unreachable one already was.
 *
 * `apiRequest` retries network failures itself. Anything arriving here as an
 * `ApiError` with a real status is the server's considered answer — a 404 for
 * a kitchen that was un-listed, a 503 from a dropped database — and asking
 * three more times only lengthens the spinner.
 */
const retry = (count: number, error: unknown) => {
  if (error instanceof ApiError && error.status > 0) return false;
  return count < 1;
};

export type UseKitchensOptions = KitchenQuery & { enabled?: boolean };

/** Every listed kitchen the query matches, nearest first when given a pin. */
export function useKitchens({ enabled = true, ...query }: UseKitchensOptions = {}) {
  return useQuery({
    queryKey: queryKeys.foodKitchenList(query),
    queryFn: () => fetchKitchens(query),
    staleTime: STALE_MS,
    refetchInterval: STALE_MS,
    enabled,
    retry,
  });
}

/** One kitchen and its whole menu. */
export function useKitchen(restaurantId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.foodKitchen(restaurantId ?? ''),
    queryFn: () => fetchKitchen(String(restaurantId)),
    staleTime: STALE_MS,
    enabled: !!restaurantId,
    retry,
  });
}

/** One dish, with enough of its kitchen to title the screen. */
export function useDish(productId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.foodDish(productId ?? ''),
    queryFn: () => fetchDish(String(productId)),
    staleTime: STALE_MS,
    enabled: !!productId,
    retry,
  });
}

