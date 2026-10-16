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
 * The kitchen feed, ten at a time (`useKitchenFeed`), the next ten when the
 * home screen nears its end — and each LOADED kitchen's menu, so the feed can
 * show dishes as well as kitchens. That is one request per kitchen on screen,
 * not per kitchen in the city. Search, Dine-in and Favourites need the whole
 * set, so they call `loadAll` and the rest of the pages come in behind them.
 * The fix when that stops scaling is a `GET /food-partners/dishes` on the
 * backend that projects across kitchens. The per-kitchen queries are
 * individually cached, so opening a kitchen page after browsing costs nothing.
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
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAppState } from '@/context/AppStateContext';
import { fetchKitchen } from '@/services/api/food.api';
import { openNowOf } from '@/services/adapters/food.adapter';
import { useKitchenFeed } from '@/services/hooks/useFood';
import { FOOD_MODE } from '@/constants/env';
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
  /** The server holds kitchens past the ones loaded. */
  hasMore: boolean;
  /** True while the next page is in flight. */
  loadingMore: boolean;
  /** Ask for the next page. A no-op while one is already coming or none is left. */
  fetchMore: () => void;
  /** Page through to the end — for screens that search or filter the whole set. */
  loadAll: () => void;

  findKitchen: (id: string) => Kitchen | undefined;
  findDish: (id: string) => Dish | undefined;
  kitchensFor: () => Kitchen[];
  dishesFor: () => Dish[];
  kitchenOpen: (kitchen: Kitchen) => boolean;
  menuFor: (kitchen: Kitchen) => Dish[];
};

const CatalogueContext = createContext<FoodCatalogue | null>(null);

/**
 * How often a loaded menu is re-read. Slower than the feed's minute on
 * purpose: whether a kitchen is OPEN comes from the feed row (see the merge
 * below), so a menu poll only refreshes dishes — and a sold-out dish is also
 * caught by the kitchen page, which re-reads its menu when opened, and by the
 * server at checkout.
 */
const MENU_REFRESH_MS = 5 * 60_000;

const EMPTY_KITCHENS: readonly Kitchen[] = [];

/** The same array back for as long as every element is the same reference —
 *  `useMemo` with element-wise equality, for a list rebuilt every render. */
function useStableList<T>(list: readonly T[]): readonly T[] {
  const ref = useRef(list);
  const previous = ref.current;
  if (previous.length !== list.length || list.some((item, index) => item !== previous[index])) {
    ref.current = list;
  }
  return ref.current;
}

export function FoodCatalogueProvider({ children }: { children: React.ReactNode }) {
  /*
   * Scoped the way the stays feed is (`app/home.tsx`): by the fix behind
   * "Use my current location" when the student gave one, and not by place at
   * all otherwise. A named locality carries no coordinates, and inventing a
   * centre for it would be a guess presented as a distance. `partnerType` is
   * always sent — without it the server lists meat shops in this feed too.
   */
  const { locality } = useAppState();
  const near = locality?.near ?? null;
  /* Only where the food module is actually shown. In a production build it is
     hidden (`FOOD_MODE`), yet this provider is mounted at the root and polled
     the kitchen feed — and up to 25 menus — every minute, on every phone,
     for a screen nobody could open. */
  const foodShown = FOOD_MODE === 'dev';
  const feed = useKitchenFeed({
    enabled: foodShown,
    partnerType: 'food',
    lat: near?.lat ?? null,
    lng: near?.lng ?? null,
    radiusKm: near?.radiusKm ?? null,
  });

  /* Every loaded page in the server's order, de-duplicated by id: a kitchen
     approved while somebody scrolls shifts every offset by one, and the row on
     the edge would otherwise arrive twice. `pageOf` remembers which page each
     came on, so sorting below never moves a card that is already on screen. */
  const pages = feed.data?.pages;
  const { feedKitchens, pageOf } = useMemo(() => {
    const order = new Map<string, number>();
    if (!pages) return { feedKitchens: EMPTY_KITCHENS, pageOf: order };
    const all: Kitchen[] = [];
    pages.forEach((page, index) => {
      for (const kitchen of page.kitchens) {
        if (order.has(kitchen.id)) continue;
        order.set(kitchen.id, index);
        all.push(kitchen);
      }
    });
    return { feedKitchens: all as readonly Kitchen[], pageOf: order };
  }, [pages]);

  /*
   * One query per LOADED kitchen, each keyed exactly as `useKitchen` keys it,
   * so a kitchen page opened later is served from this same cache entry. The
   * next page of the feed brings ten more menus with it, never fifty at once.
   */
  const menuQueries = useQueries({
    queries: feedKitchens.map((kitchen) => ({
      queryKey: queryKeys.foodKitchen(kitchen.id),
      queryFn: () => fetchKitchen(kitchen.id),
      staleTime: 60_000,
      refetchInterval: MENU_REFRESH_MS,
      enabled: foodShown,
    })),
  });

  /*
   * Keyed on the menus' DATA, not on the query results.
   *
   * `useQueries` hands back a fresh results array on every state change —
   * including the fetch flag flipping on and off for each of up to 25 menus on
   * every 60-second poll — while structural sharing keeps each `data` the same
   * object when the menu has not changed. Keyed on the results, the catalogue
   * was rebuilt (new kitchen objects included) fifty-odd times a minute and
   * every food screen re-rendered its whole feed with it; keyed on the data,
   * it changes when a menu does.
   */
  const menuData = useStableList(menuQueries.map((query) => query.data));

  /* The detail response carries the section list, which a feed row cannot —
     so the kitchen from the detail call supersedes the one from the feed
     wherever it has arrived. The feed's `distanceKm` is preserved, because
     only the feed was asked with a pin, and so is its `openNow`: the feed is
     re-read every minute and the menus only every five, so a kitchen that
     switched itself closed reads as closed within the minute. */
  const kitchens = useMemo<readonly Kitchen[]>(() => {
    const bySections = new Map<string, Kitchen>();
    for (const data of menuData) {
      const loaded = data?.kitchen;
      if (loaded) bySections.set(loaded.id, loaded);
    }
    return feedKitchens.map((row) => {
      const detailed = bySections.get(row.id);
      if (!detailed) return row;
      const openNow = openNowOf(row);
      return {
        ...detailed,
        walkMinutes: row.walkMinutes,
        deliveryMinutes: row.deliveryMinutes,
        ...(openNow === undefined ? null : { openNow }),
      };
    });
  }, [feedKitchens, menuData]);

  const dishes = useMemo<readonly Dish[]>(
    () => menuData.flatMap((data) => data?.dishes ?? []),
    [menuData],
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

  /* Open kitchens first, then by how far away they are — WITHIN each page.
     Sorting across pages would slot an open kitchen from page two above a
     closed one from page one, so every page that arrived would shuffle the
     cards the student was already reading. With no pin every `walkMinutes` is
     0 and the sort degrades to the server's order, which is the newest
     first — honest, and stable. */
  const kitchensFor = useCallback(
    () =>
      [...kitchens].sort((a, b) => {
        const pageDelta = (pageOf.get(a.id) ?? 0) - (pageOf.get(b.id) ?? 0);
        if (pageDelta !== 0) return pageDelta;
        const openDelta = Number(kitchenOpen(b)) - Number(kitchenOpen(a));
        return openDelta !== 0 ? openDelta : a.walkMinutes - b.walkMinutes;
      }),
    [kitchens, kitchenOpen, pageOf],
  );

  const dishesFor = useCallback(() => [...dishes].sort((a, b) => a.price - b.price), [dishes]);

  /* Every dish this kitchen cooks, in the order it arranged its own menu.
     Grouped and sorted once per catalogue change: the feed asks this three
     times per card per render (the highlight, pure veg, under ₹100), and a
     filter over every loaded dish each time was the feed's slowest line. */
  const menus = useMemo(() => {
    const byKitchen = new Map<string, Dish[]>();
    for (const dish of dishes) {
      const list = byKitchen.get(dish.kitchenId);
      if (list) list.push(dish);
      else byKitchen.set(dish.kitchenId, [dish]);
    }
    for (const kitchen of kitchens) {
      byKitchen.get(kitchen.id)?.sort(
        (a, b) => kitchen.sections.indexOf(a.section) - kitchen.sections.indexOf(b.section),
      );
    }
    return byKitchen;
  }, [dishes, kitchens]);
  const menuFor = useCallback(
    (kitchen: Kitchen) => [...(menus.get(kitchen.id) ?? [])],
    [menus],
  );

  /* Stable for the provider's lifetime — the queries it calls are read at the
     moment it runs, so a new results array is not a new `refetch` and does not
     hand every consumer a new catalogue. */
  const latest = useRef({ feed, menuQueries });
  useEffect(() => {
    latest.current = { feed, menuQueries };
  });
  const refetch = useCallback(() => {
    void latest.current.feed.refetch();
    latest.current.menuQueries.forEach((query) => void query.refetch());
  }, []);
  const loadingMenus = menuQueries.some((query) => query.isLoading);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  const hasMore = !!hasNextPage;
  const fetchMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  /* Once asked for, the rest of the pages are walked one after another — each
     arrival re-runs this — until the server says there are no more. */
  const [wantAll, setWantAll] = useState(false);
  const loadAll = useCallback(() => setWantAll(true), []);
  useEffect(() => {
    if (wantAll && foodShown && !feed.isLoading) fetchMore();
  }, [wantAll, foodShown, feed.isLoading, fetchMore]);

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
      loadingMenus,
      error,
      refetch,
      hasMore,
      loadingMore: isFetchingNextPage,
      fetchMore,
      loadAll,
      findKitchen,
      findDish,
      kitchensFor,
      dishesFor,
      kitchenOpen,
      menuFor,
    }),
    [
      kitchens, dishes, feed.isLoading, loadingMenus, error, refetch,
      hasMore, isFetchingNextPage, fetchMore, loadAll,
      findKitchen, findDish, kitchensFor, dishesFor, kitchenOpen, menuFor,
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
