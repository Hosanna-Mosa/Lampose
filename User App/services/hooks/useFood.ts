import { useQuery } from '@tanstack/react-query';

import type { Dish, Kitchen, MealWindowId } from '@/types/food';
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
 * A minute. A kitchen switches a dish off mid-service from the partner app,
 * and a student holding a stale menu adds it to a cart that will be refused
 * at the counter. The feed re-fetches on focus and a kitchen page re-fetches
 * when it is opened.
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

/* ------------------------------------------------------------------ *
 * Window filtering
 * ------------------------------------------------------------------ */

/**
 * The kitchens that cook in a given meal window.
 *
 * Applied on the device rather than sent to the server, because the
 * collection stores trading hours and has no column for the app's five
 * windows — the mapping between the two lives in `food.adapter.ts`. A kitchen
 * that recorded no opening hours matches no window, which is the truth rather
 * than a reason to show it everywhere.
 */
export function kitchensInWindow(kitchens: readonly Kitchen[], window: MealWindowId): Kitchen[] {
  return kitchens.filter((kitchen) => kitchen.windows.includes(window));
}

export function dishesInWindow(dishes: readonly Dish[], window: MealWindowId): Dish[] {
  return dishes.filter((dish) => dish.windows.includes(window));
}
