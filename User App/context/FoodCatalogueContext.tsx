/**
 * The Food catalogue, from the database.
 *
 * Six helpers cover everything a screen needs: `findKitchen`, `findDish`,
 * `kitchensFor`, `dishesFor`, `kitchenOpen`, `menuFor`. None of them take a
 * meal window any more — the catalogue used to be indexed by one, and a
 * kitchen or a dish is now just shown or not shown, open or closed, with
 * nothing about the time of day filtering it out first.
 *
 * ## Why a context and not a hook per screen
 *
 * The helpers are synchronous by necessity: they are called inside `useMemo`
 * and in the middle of a render, and half of them are lookups by id from a
 * list a completely different screen fetched. Something has to hold the loaded
 * rows for all of them, and that something is this.
 *
 * ## What is loaded, and when
 *
 * The kitchen feed, once, on mount — and then each listed kitchen's menu, so
 * the home feed can show dishes as well as kitchens. That is one request per
 * kitchen, which is right for the handful of approved restaurants this
 * currently serves and will not be at a hundred. The fix when that day comes
 * is a `GET /food-partners/dishes` on the backend that projects across
 * kitchens; it is deliberately not built yet, because a feed endpoint designed
 * against no real traffic is a guess. The per-kitchen queries are individually
 * cached, so opening a kitchen page after browsing the feed costs nothing.
 *
 * ## Nothing is invented
 *
 * A kitchen with no ratings has no rating. A feed asked for without a pin has
 * no walking times. An empty catalogue is an empty catalogue — the screens
 * have real empty states and they are the honest answer while no restaurant
 * has been approved yet.
 *
 * An empty catalogue is also not the only kind of quiet screen, which is why
 * `loading`, `loadingMenus` and `error` are on the value beside the rows. A
 * feed still in flight, a feed that failed and a feed that is genuinely empty
 * look identical to a component that only counts rows, and they need three
 * different sentences and only one of them needs a retry button.
 */
import { useQueries } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useMemo } from 'react';

import { fetchKitchen } from '@/services/api/food.api';
import { openNowOf } from '@/services/adapters/food.adapter';
import { useKitchens } from '@/services/hooks/useFood';
import { queryKeys } from '@/services/hooks/keys';
import type { Dish, Kitchen } from '@/types/food';

type FoodCatalogue = {
  kitchens: readonly Kitchen[];
  dishes: readonly Dish[];
  /** True while the kitchen feed itself is in flight — not the menus behind it. */
  loading: boolean;
  /** True while any menu is still arriving. The feed is usable before this clears. */
  loadingMenus: boolean;
  /**
   * Why there is nothing to show, in the words the failure came in.
   *
   * The feed's own failure, or — when the feed itself is fine — the failure of
   * every menu behind it. Null while a single menu is missing out of twenty,
   * because that is not a screen worth interrupting.
   */
  error: string | null;
  refetch: () => void;

  findKitchen: (id: string) => Kitchen | undefined;
  findDish: (id: string) => Dish | undefined;
  kitchensFor: () => Kitchen[];
  dishesFor: () => Dish[];
  kitchenOpen: (kitchen: Kitchen) => boolean;
  menuFor: (kitchen: Kitchen) => Dish[];
};

const CatalogueContext = createContext<FoodCatalogue | null>(null);

/** How many kitchens' menus are pulled for the feed. See the header. */
const MENU_FANOUT_CAP = 25;

export function FoodCatalogueProvider({ children }: { children: React.ReactNode }) {
  const feed = useKitchens({ limit: 50 });

  const feedKitchens = useMemo<readonly Kitchen[]>(() => feed.data ?? [], [feed.data]);

  /*
   * One query per kitchen, each keyed exactly as `useKitchen` keys it, so a
   * kitchen page opened later is served from this same cache entry.
   *
   * Polled on the same interval as the feed, for the reason `useFood.ts`
   * gives: `kitchenOpen` below prefers THIS response over the feed's own row
   * once it has arrived (see the merge just under this), so a kitchen that
   * switched itself closed would otherwise keep reading as open from this
   * query's first, unrefreshed answer for as long as the app stays open.
   */
  const menuQueries = useQueries({
    queries: feedKitchens.slice(0, MENU_FANOUT_CAP).map((kitchen) => ({
      queryKey: queryKeys.foodKitchen(kitchen.id),
      queryFn: () => fetchKitchen(kitchen.id),
      staleTime: 60_000,
      refetchInterval: 60_000,
    })),
  });

  /* The detail response carries the section list, which a feed row cannot —
     so the kitchen from the detail call supersedes the one from the feed
     wherever it has arrived. The feed's `distanceKm` is preserved, because
     only the feed was asked with a pin. */
  const kitchens = useMemo<readonly Kitchen[]>(() => {
    const bySections = new Map<string, Kitchen>();
    for (const query of menuQueries) {
      const loaded = query.data?.kitchen;
      if (loaded) bySections.set(loaded.id, loaded);
    }
    return feedKitchens.map((row) => {
      const detailed = bySections.get(row.id);
      return detailed ? { ...detailed, walkMinutes: row.walkMinutes, deliveryMinutes: row.deliveryMinutes } : row;
    });
  }, [feedKitchens, menuQueries]);

  const dishes = useMemo<readonly Dish[]>(
    () => menuQueries.flatMap((query) => query.data?.dishes ?? []),
    [menuQueries],
  );

  const findKitchen = useCallback(
    (id: string) => kitchens.find((kitchen) => kitchen.id === id),
    [kitchens],
  );

  const findDish = useCallback((id: string) => dishes.find((dish) => dish.id === id), [dishes]);

  /*
   * Is this kitchen taking orders right now?
   *
   * The server's own answer, and only the server's — it is the one party that
   * knows about the partner's `openState` switch and about which weekday it
   * actually is. This used to also weigh the app's own fixed meal windows,
   * which meant a kitchen with broad real hours could still read as closed in
   * the gap between two of them. There is no second opinion any more: no
   * `openNow` at all (a row from before the field existed) reads as closed
   * rather than guessed open.
   */
  const kitchenOpen = useCallback((kitchen: Kitchen) => openNowOf(kitchen) ?? false, []);

  /* Open kitchens first, then by how far away they are. With no pin every
     `walkMinutes` is 0 and the sort degrades to the server's order, which is
     the newest first — honest, and stable. */
  const kitchensFor = useCallback(
    () =>
      [...kitchens].sort((a, b) => {
        const openDelta = Number(kitchenOpen(b)) - Number(kitchenOpen(a));
        return openDelta !== 0 ? openDelta : a.walkMinutes - b.walkMinutes;
      }),
    [kitchens, kitchenOpen],
  );

  const dishesFor = useCallback(() => [...dishes].sort((a, b) => a.price - b.price), [dishes]);

  /* Every dish this kitchen cooks, in the order it arranged its own menu. */
  const menuFor = useCallback(
    (kitchen: Kitchen) => {
      const mine = dishes.filter((dish) => dish.kitchenId === kitchen.id);
      return [...mine].sort(
        (a, b) => kitchen.sections.indexOf(a.section) - kitchen.sections.indexOf(b.section),
      );
    },
    [dishes],
  );

  const refetch = useCallback(() => {
    void feed.refetch();
    menuQueries.forEach((query) => void query.refetch());
  }, [feed, menuQueries]);

  /* The feed's own failure first, because without it there is no catalogue at
     all. A failing MENU is reported only when not one of them arrived: a feed
     of nineteen menus and one refusal is still a feed worth showing, and a
     banner over it would be noise on a screen that has plenty to say. */
  const error = useMemo(() => {
    if (feed.error) return (feed.error as Error).message;
    const failed = menuQueries.filter((query) => query.isError);
    if (!failed.length || failed.length < menuQueries.length) return null;
    return (failed[0].error as Error | null)?.message ?? 'The menus could not be loaded.';
  }, [feed.error, menuQueries]);

  const value = useMemo<FoodCatalogue>(
    () => ({
      kitchens,
      dishes,
      loading: feed.isLoading,
      loadingMenus: menuQueries.some((query) => query.isLoading),
      error,
      refetch,
      findKitchen,
      findDish,
      kitchensFor,
      dishesFor,
      kitchenOpen,
      menuFor,
    }),
    [
      kitchens, dishes, feed.isLoading, error, menuQueries,
      refetch, findKitchen, findDish, kitchensFor, dishesFor, kitchenOpen, menuFor,
    ],
  );

  return <CatalogueContext.Provider value={value}>{children}</CatalogueContext.Provider>;
}

/**
 * The catalogue.
 *
 * Throws when used outside the provider rather than returning an empty
 * catalogue: an empty one is indistinguishable from "no restaurant has been
 * approved yet", and a screen silently rendering that because somebody forgot
 * a provider is a bug that takes an afternoon to find.
 */
export function useFoodCatalogue(): FoodCatalogue {
  const context = useContext(CatalogueContext);
  if (!context) {
    throw new Error('useFoodCatalogue must be used inside a FoodCatalogueProvider.');
  }
  return context;
}
