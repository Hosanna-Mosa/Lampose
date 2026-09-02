import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import {
  addFoodFavourite,
  fetchFoodFavourites,
  removeFoodFavourite,
  EMPTY_FAVOURITES,
  type FoodFavourites,
} from '@/services/api/foodFavourites.api';
import { queryKeys } from './keys';

/**
 * The heart on a dish and on a kitchen.
 *
 * One query behind every heart in the app, so a dish hearted on the menu is
 * already hearted when the Favourites tab opens — without a refetch, and
 * without the two disagreeing.
 *
 * ## The toggle is optimistic, and it rolls back
 *
 * The same reasoning as `useSaved`: a heart that waits for a round trip before
 * filling in feels broken on a train. The tap IS the interaction, and 400ms of
 * nothing reads as a dropped press — which produces a second tap, which
 * un-hearts. So the cache is written first and the request follows; if it
 * fails the cache is put back exactly as it was and the heart visibly returns
 * to where it started, which is the honest outcome.
 *
 * ## Every mutation returns the WHOLE list
 *
 * The server already reads both lists to answer, so returning them costs
 * nothing — and it removes a class of bug outright. A client that patched its
 * own cache from a delta would drift from what is actually stored the first
 * time two handsets were used, and nothing would ever correct it. Here the
 * server's answer replaces the optimistic guess on every success.
 *
 * ## Signed out is not an error
 *
 * `enabled` gates the query rather than letting it 401 on every food screen. A
 * signed-out diner sees empty hearts and is asked to sign in when they tap one
 * — the ask belongs at the moment of intent, not as a wall in front of a menu.
 */
export function useFoodFavourites(enabled = true) {
  const client = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.foodFavourites,
    queryFn: ({ signal }) => fetchFoodFavourites(signal),
    enabled,
    staleTime: 60_000,
    /* Retry a transport failure once; never retry a real HTTP answer. A 401 is
       not going to become a 200 because we asked again. */
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 1,
  });

  const favourites = query.data ?? EMPTY_FAVOURITES;

  /* Sets, so a heart on a long menu is a lookup rather than a scan of the
     whole favourites list per row. */
  const dishIds = useMemo(
    () => new Set(favourites.dishes.map((dish) => dish.id)),
    [favourites.dishes],
  );
  const kitchenIds = useMemo(
    () => new Set(favourites.kitchens.map((kitchen) => kitchen.id)),
    [favourites.kitchens],
  );

  const mutation = useMutation({
    mutationFn: ({ kind, id, next }: { kind: 'dish' | 'kitchen'; id: string; next: boolean }) =>
      (next ? addFoodFavourite(kind, id) : removeFoodFavourite(kind, id)),

    onMutate: async ({ kind, id, next }) => {
      /* An in-flight fetch would land after the optimistic write and undo it. */
      await client.cancelQueries({ queryKey: queryKeys.foodFavourites });
      const previous = client.getQueryData<FoodFavourites>(queryKeys.foodFavourites);

      /*
       * Only the REMOVE half can be done optimistically in full.
       *
       * Un-hearting is a filter on data already held. Hearting is not: the
       * screen has the dish, but this cache stores server-shaped favourites
       * and inventing one here would mean guessing fields the server owns.
       * So an add optimistically marks nothing and relies on the response,
       * which arrives in one round trip — while the button itself is already
       * drawn as hearted by `pending` below, so the tap still feels instant.
       */
      if (!next && previous) {
        client.setQueryData<FoodFavourites>(queryKeys.foodFavourites, {
          ...previous,
          dishes: kind === 'dish'
            ? previous.dishes.filter((dish) => dish.id !== id)
            : previous.dishes,
          kitchens: kind === 'kitchen'
            ? previous.kitchens.filter((kitchen) => kitchen.id !== id)
            : previous.kitchens,
        });
      }

      return { previous };
    },

    onError: (_error, _variables, context) => {
      /* Exactly as it was. The heart returns to where it started, which tells
         the truth: the change did not happen. */
      if (context?.previous) {
        client.setQueryData(queryKeys.foodFavourites, context.previous);
      }
    },

    onSuccess: (data) => {
      /* The server's whole list, replacing the guess. */
      client.setQueryData<FoodFavourites>(queryKeys.foodFavourites, data);
    },
  });

  /**
   * What is being toggled right now, so a button can draw its destination
   * state rather than its current one. Without this an add would look like
   * nothing happened until the response landed.
   */
  const pending = mutation.isPending ? mutation.variables : null;

  const isDishFavourite = useCallback(
    (id: string) => {
      if (pending && pending.kind === 'dish' && pending.id === id) return pending.next;
      return dishIds.has(id);
    },
    [dishIds, pending],
  );

  const isKitchenFavourite = useCallback(
    (id: string) => {
      if (pending && pending.kind === 'kitchen' && pending.id === id) return pending.next;
      return kitchenIds.has(id);
    },
    [kitchenIds, pending],
  );

  /* `mutate` and not `mutation`: React Query's mutation OBJECT changes identity
     on every render (it carries `isPending`, `error` and friends), so depending
     on it would make these callbacks unstable and, through them, the whole
     context value — the same trap the memo below exists to avoid. `mutate`
     itself is referentially stable. */
  const { mutate } = mutation;

  const toggleDish = useCallback(
    (id: string) => {
      if (!id) return;
      mutate({ kind: 'dish', id, next: !dishIds.has(id) });
    },
    [dishIds, mutate],
  );

  const toggleKitchen = useCallback(
    (id: string) => {
      if (!id) return;
      mutate({ kind: 'kitchen', id, next: !kitchenIds.has(id) });
    },
    [kitchenIds, mutate],
  );

  /*
   * Memoised, and that is load-bearing rather than tidy.
   *
   * `FoodContext` puts this object straight into the dependency list of the
   * `useMemo` that builds the whole context value. A fresh object literal here
   * would change identity on every render of `FoodProvider` — which happens on
   * every cart change, every order poll, every window switch — so the context
   * value would be rebuilt each time and EVERY consumer of `useFood()` would
   * re-render with it. That is the exact cost the long, careful dependency
   * list in that file exists to avoid, and one unstable member defeats all of
   * it.
   *
   * Everything below is already stable: the four functions are `useCallback`
   * bound, and `dishes` / `kitchens` come from React Query's cache, which keeps
   * identity until the data actually changes.
   */
  return useMemo(
    () => ({
      dishes: favourites.dishes,
      kitchens: favourites.kitchens,
      /* Hearted but not showable — the kitchen is delisted right now. The
         screen says so rather than being quietly short. */
      unavailable: favourites.unavailable,

      isDishFavourite,
      isKitchenFavourite,
      toggleDish,
      toggleKitchen,

      loading: query.isLoading,
      refreshing: query.isFetching && !query.isLoading,
      error: query.error instanceof Error ? query.error : null,
      refetch: query.refetch,
      /* Surfaced so a screen can show the SERVER's sentence when a heart fails
         — "You can keep up to 200 dishes" is worth reading. */
      saveError: mutation.error instanceof Error ? mutation.error : null,
    }),
    [
      favourites.dishes,
      favourites.kitchens,
      favourites.unavailable,
      isDishFavourite,
      isKitchenFavourite,
      toggleDish,
      toggleKitchen,
      query.isLoading,
      query.isFetching,
      query.error,
      query.refetch,
      mutation.error,
    ],
  );
}
