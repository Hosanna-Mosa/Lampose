/**
 * The Food catalogue, from the database.
 *
 * This replaces `@/data/food`'s kitchen and dish fixtures. It exposes the SAME
 * five helpers those fixtures did — `findKitchen`, `findDish`, `kitchensFor`,
 * `dishesFor`, `kitchenOpen`, `menuFor` — with the same signatures and the
 * same ordering rules, so a screen switches over by changing one import line
 * rather than being rewritten around a promise.
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
 */
import { useQueries } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useMemo } from 'react';

import { fetchKitchen } from '@/services/api/food.api';
import { useKitchens } from '@/services/hooks/useFood';
import { queryKeys } from '@/services/hooks/keys';
import type { Dish, Kitchen, MealWindowId } from '@/types/food';

type FoodCatalogue = {
  kitchens: readonly Kitchen[];
  dishes: readonly Dish[];
  /** True while the kitchen feed itself is in flight — not the menus behind it. */
  loading: boolean;
  /** True while any menu is still arriving. The feed is usable before this clears. */
  loadingMenus: boolean;
  error: string | null;
  refetch: () => void;

  findKitchen: (id: string) => Kitchen | undefined;
  findDish: (id: string) => Dish | undefined;
  kitchensFor: (window: MealWindowId) => Kitchen[];
  dishesFor: (window: MealWindowId) => Dish[];
  kitchenOpen: (kitchen: Kitchen, window: MealWindowId) => boolean;
  menuFor: (kitchen: Kitchen, window: MealWindowId) => Dish[];
};

const CatalogueContext = createContext<FoodCatalogue | null>(null);

/** How many kitchens' menus are pulled for the feed. See the header. */
const MENU_FANOUT_CAP = 25;

export function FoodCatalogueProvider({ children }: { children: React.ReactNode }) {
  const feed = useKitchens({ limit: 50 });

  const feedKitchens = useMemo<readonly Kitchen[]>(() => feed.data ?? [], [feed.data]);

  /* One query per kitchen, each keyed exactly as `useKitchen` keys it, so a
     kitchen page opened later is served from this same cache entry. */
  const menuQueries = useQueries({
    queries: feedKitchens.slice(0, MENU_FANOUT_CAP).map((kitchen) => ({
      queryKey: queryKeys.foodKitchen(kitchen.id),
      queryFn: () => fetchKitchen(kitchen.id),
      staleTime: 60_000,
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

  const kitchenOpen = useCallback(
    (kitchen: Kitchen, window: MealWindowId) => kitchen.windows.includes(window),
    [],
  );

  /* Same ordering as the fixtures: open kitchens first, then by how far away
     they are. With no pin every `walkMinutes` is 0 and the sort degrades to
     the server's order, which is the newest first — honest, and stable. */
  const kitchensFor = useCallback(
    (window: MealWindowId) =>
      [...kitchens].sort((a, b) => {
        const openDelta = Number(b.windows.includes(window)) - Number(a.windows.includes(window));
        return openDelta !== 0 ? openDelta : a.walkMinutes - b.walkMinutes;
      }),
    [kitchens],
  );

  const dishesFor = useCallback(
    (window: MealWindowId) =>
      dishes.filter((dish) => dish.windows.includes(window)).sort((a, b) => a.price - b.price),
    [dishes],
  );

  /* A closed kitchen still shows a menu — the whole point of the closed state
     is that it can be read now and ordered from later — so this falls back to
     everything the kitchen cooks rather than returning nothing. */
  const menuFor = useCallback(
    (kitchen: Kitchen, window: MealWindowId) => {
      const mine = dishes.filter((dish) => dish.kitchenId === kitchen.id);
      const inWindow = mine.filter((dish) => dish.windows.includes(window));
      const list = inWindow.length ? inWindow : mine;
      return [...list].sort(
        (a, b) => kitchen.sections.indexOf(a.section) - kitchen.sections.indexOf(b.section),
      );
    },
    [dishes],
  );

  const refetch = useCallback(() => {
    void feed.refetch();
    menuQueries.forEach((query) => void query.refetch());
  }, [feed, menuQueries]);

  const value = useMemo<FoodCatalogue>(
    () => ({
      kitchens,
      dishes,
      loading: feed.isLoading,
      loadingMenus: menuQueries.some((query) => query.isLoading),
      error: feed.error ? (feed.error as Error).message : null,
      refetch,
      findKitchen,
      findDish,
      kitchensFor,
      dishesFor,
      kitchenOpen,
      menuFor,
    }),
    [
      kitchens, dishes, feed.isLoading, feed.error, menuQueries,
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
