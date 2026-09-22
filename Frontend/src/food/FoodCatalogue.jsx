/* ══════════════════════════════════════════════════════════════════════════
   The catalogue, from the server, for the whole food surface.

   This replaces the arrays `data/food.js` used to export. It exists as a
   PROVIDER rather than a hook-per-page for one reason: several screens need a
   lookup to be synchronous.

   `useAddDish` opens a sheet for a dish and wants the kitchen's name for the
   header. `FoodTrack` prints the kitchen behind an order. `CartProvider`
   re-prices a cart when a dish changes. None of those can await — they are
   called during render, from a click handler, or inside a `useMemo`. So the
   kitchens are fetched once, held here, and `kitchenById` answers from memory
   exactly the way the fixture's did.

   ## What is loaded when

     kitchens    once, on mount. Seventeen rows; a page that needs one
                 kitchen should not pay for a round trip to name it.
     catalogue   with the kitchens — the cuisine chips and the delivery
                 verdict for wherever the visitor is.
     menus       LAZILY, per kitchen, and cached. A menu is only needed when
                 somebody opens a kitchen, and loading all seventeen up front
                 would be seventeen requests for a page that shows cards.
     popular     once, beside the kitchens; it is one small request and the
                 feed shows it above the fold.

   ## Three states, and they are not the same

   A component here can be in one of three situations, and the whole reason
   this file distinguishes them is that a fixture never had to:

     loading   we have not heard back yet          -> skeletons
     error     the request failed                  -> "we could not load this"
     empty     it succeeded and there is nothing   -> "no kitchens near you"

   The last two look identical if you only track a list's length, and they
   mean opposite things: one is our fault and retrying may fix it, the other
   is an answer. `error` is carried separately for exactly that reason.
   ══════════════════════════════════════════════════════════════════════════ */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  fetchCatalogue, fetchKitchens, fetchKitchenDishes, fetchPopularDishes,
} from '../api/foodApi';

const FoodCatalogueContext = createContext(null);

/* The shape the feed's chrome falls back to before the first reply lands, and
   after one that failed. Empty rather than invented: a delivery verdict
   nobody confirmed is the one thing this file must not make up, because "we
   deliver to you" is a promise. */
const NO_CATALOGUE = {
  cuisines: [],
  dietLabels: { veg: 'Veg', egg: 'Contains egg', nonveg: 'Non-veg' },
  located: false,
  kitchensReaching: 0,
  serviceable: false,
};

export function FoodCatalogueProvider({ children }) {
  const [catalogue, setCatalogue] = useState(NO_CATALOGUE);
  const [kitchens, setKitchens] = useState([]);
  const [popular, setPopular] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* Where the visitor is, when they have told us. Held here rather than in
     the cart because it changes what the SERVER returns — the kitchens come
     back nearest-first and carry `walkMinutes` only with a point. */
  const [point, setPoint] = useState(null);

  /*
   * Menus, keyed by kitchen id.
   *
   * A ref beside the state, not instead of it: the ref is what `dishById` and
   * `dishesOf` read during render without waiting for a re-render, and the
   * state is what makes a component re-render when a menu finally arrives.
   * One without the other is either a stale lookup or a silent screen.
   */
  const menusRef = useRef(new Map());
  const [menuVersion, setMenuVersion] = useState(0);
  /* The PROMISE of each menu currently being fetched, so two callers asking at
     once share one request and BOTH get the dishes back.

     It was a Set of ids at first, and a second caller was answered with an
     empty list while the first was still in flight. Harmless for a component
     that re-renders when the menu lands — and wrong for `reorder`, which
     awaits the result and would have found no dishes to rebuild a cart from. */
  const inFlight = useRef(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = point ? { lat: point.lat, lng: point.lng } : {};
      /* In parallel: they are independent, and the feed cannot draw until it
         has the first two anyway. `popular` is allowed to fail on its own —
         see below. */
      const [cat, feed] = await Promise.all([
        fetchCatalogue(query),
        fetchKitchens({ ...query, limit: 60 }),
      ]);
      setCatalogue({ ...NO_CATALOGUE, ...cat });
      setKitchens(feed.kitchens || []);
    } catch (err) {
      setError(err);
      setKitchens([]);
      setCatalogue(NO_CATALOGUE);
    } finally {
      setLoading(false);
    }

    /* Separately, and deliberately not inside the try above: the popular
       strip is a garnish. If it fails, the feed is still a feed, and taking
       the whole page down over it would be the tail wagging the dog. */
    try {
      setPopular(await fetchPopularDishes({ limit: 4 }));
    } catch {
      setPopular([]);
    }
  }, [point]);

  useEffect(() => { load(); }, [load]);

  /**
   * Fetch one kitchen's menu, once.
   *
   * Safe to call from an effect on every render of a kitchen page: a menu
   * already held, or already being fetched, returns immediately.
   */
  const loadMenu = useCallback((kitchenId) => {
    if (!kitchenId) return Promise.resolve([]);
    if (menusRef.current.has(kitchenId)) return Promise.resolve(menusRef.current.get(kitchenId).dishes);
    /* Same promise for every caller — see `inFlight` above. */
    if (inFlight.current.has(kitchenId)) return inFlight.current.get(kitchenId);

    const request = fetchKitchenDishes(kitchenId)
      .then((data) => {
        menusRef.current.set(kitchenId, {
          dishes: data.dishes || [],
          sections: data.sections || [],
        });
        /* Bumped rather than set to a new Map: the ref IS the store, and this
           number exists only to tell React something in it changed. */
        setMenuVersion((v) => v + 1);
        return data.dishes || [];
      })
      .catch((err) => {
        /* Cached as EMPTY so a kitchen with a broken menu does not retry on
           every render. The page shows its own empty state. */
        menusRef.current.set(kitchenId, { dishes: [], sections: [], error: err });
        setMenuVersion((v) => v + 1);
        return [];
      })
      .finally(() => { inFlight.current.delete(kitchenId); });

    inFlight.current.set(kitchenId, request);
    return request;
  }, []);

  /* ── The lookups, with the fixture's exact names and signatures ───────── */

  const kitchenById = useCallback(
    (id) => kitchens.find((k) => k.id === id) || null,
    [kitchens],
  );

  const dishesOf = useCallback(
    (kitchenId) => (menusRef.current.get(kitchenId) || { dishes: [] }).dishes,
    /* `menuVersion` is not read in the body and is still a real dependency:
       it is what gives callers a NEW function identity once a menu lands, so
       a `useMemo` keyed on `dishesOf` recomputes instead of holding the empty
       list it got first. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuVersion],
  );

  /* Has this kitchen's menu ARRIVED - as opposed to being empty? `dishesOf`
     returns [] for both, and a page has to say different things: "loading"
     for one, "this kitchen has no menu yet" for the other. */
  const menuLoaded = useCallback(
    (kitchenId) => menusRef.current.has(kitchenId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuVersion],
  );

  const sectionsOf = useCallback(
    (kitchenId) => (menusRef.current.get(kitchenId) || { sections: [] }).sections,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuVersion],
  );

  /** Searches every menu held, plus the popular strip. */
  const dishById = useCallback(
    (id) => {
      for (const menu of menusRef.current.values()) {
        const hit = menu.dishes.find((d) => d.id === id);
        if (hit) return hit;
      }
      return popular.find((d) => d.id === id) || null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuVersion, popular],
  );

  const value = useMemo(() => ({
    ...catalogue,
    kitchens,
    popular,
    loading,
    error,
    point,
    setPoint,
    refresh: load,
    loadMenu,
    kitchenById,
    dishById,
    dishesOf,
    sectionsOf,
    menuLoaded,
    /* The fixture's name for the popular strip, kept so the feed reads the
       same. It is a value here rather than a function because the server has
       already done the ranking. */
    popularInBlock: () => popular,
  }), [
    catalogue, kitchens, popular, loading, error, point,
    load, loadMenu, kitchenById, dishById, dishesOf, sectionsOf, menuLoaded,
  ]);

  return (
    <FoodCatalogueContext.Provider value={value}>
      {children}
    </FoodCatalogueContext.Provider>
  );
}

/**
 * The catalogue.
 *
 * Throws when used outside the provider rather than returning null — a
 * component reading `kitchens` off `undefined` fails three lines later with a
 * message about a property, and this one says what is actually wrong.
 */
export function useFoodCatalogue() {
  const value = useContext(FoodCatalogueContext);
  if (!value) {
    throw new Error('useFoodCatalogue must be used inside <FoodCatalogueProvider>.');
  }
  return value;
}

/**
 * One kitchen and its menu, loaded on demand.
 *
 * The shape a kitchen page wants: the row from the feed, its dishes, its
 * sections, and whether either is still coming.
 */
export function useKitchen(kitchenId) {
  const { kitchenById, dishesOf, sectionsOf, loadMenu, loading } = useFoodCatalogue();

  useEffect(() => { loadMenu(kitchenId); }, [kitchenId, loadMenu]);

  const dishes = dishesOf(kitchenId);
  const sections = sectionsOf(kitchenId);

  return {
    kitchen: kitchenById(kitchenId),
    dishes,
    sections,
    /* Still loading while the kitchens themselves are in flight, or while
       this menu has not arrived. `dishes.length` alone cannot tell "not
       fetched yet" from "a kitchen with no dishes". */
    loading: loading || !sections.length,
  };
}
