import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type { Dish, Kitchen } from '@/types/food';
import { toDish, toKitchen } from '@/services/adapters/food.adapter';

/**
 * Food favourites — the heart on a dish and on a kitchen.
 *
 * ## Why the server sends whole dishes rather than ids
 *
 * The app held these in React state until now, so a favourite did not survive
 * backgrounding, let alone a reinstall or signing in on a second handset. The
 * obvious fix is to store the ids on the account and let the app resolve them
 * against the catalogue it has already loaded — and that version has a bug the
 * id list cannot fix.
 *
 * The loaded catalogue is ONE locality's feed, filtered to listed restaurants.
 * A favourite from a kitchen that is closed, out of area, or simply absent from
 * today's feed resolves to nothing and disappears from the screen. A favourites
 * list that hides your favourites is worse than no list at all.
 *
 * So the server reads the products and the restaurants and returns them in the
 * same shapes the discovery routes already send, and this file runs them
 * through the same two adapters every other food screen uses. There is no
 * third spelling of a dish anywhere.
 *
 * ## `unavailable` is a count, not a silence
 *
 * A favourite whose restaurant has been suspended is withheld from the
 * response and KEPT in the record — a suspension is usually temporary, and
 * deleting somebody's favourites as a side effect of a moderation action we
 * may reverse tomorrow is not a trade worth making quietly. The count lets the
 * screen say "2 are unavailable right now" instead of just being short.
 */

export type FoodFavourites = {
  dishes: readonly Dish[];
  kitchens: readonly Kitchen[];
  /** Hearted, but not showable right now — the kitchen is delisted or gone. */
  unavailable: number;
};

/**
 * What a hearted dish looks like on the wire: a menu item, plus the WHOLE
 * kitchen that owns it.
 *
 * The nested kitchen is load-bearing rather than convenient. A dish's meal
 * windows are derived from its kitchen's opening hours — nothing on a product
 * says "this is lunch" — so a row carrying only a restaurant name would
 * produce a dish with no windows, which renders as a dish nobody ever cooks.
 */
type BackendFavouriteDish = Record<string, unknown> & {
  restaurant?: Record<string, unknown>;
  restaurantId?: string;
  restaurantName?: string;
};

type FavouritesEnvelope = ApiEnvelope<unknown> & {
  dishes?: BackendFavouriteDish[];
  kitchens?: Record<string, unknown>[];
  unavailable?: number;
};

const EMPTY: FoodFavourites = { dishes: [], kitchens: [], unavailable: 0 };

/**
 * The one place a favourites response becomes app types.
 *
 * Every call below returns the WHOLE list rather than a delta, which is why
 * this is shared: the server already has to read both lists to answer, so
 * sending them back costs nothing and removes an entire class of bug — a
 * client that patches its own cache from a delta and drifts out of step with
 * what is actually stored.
 */
const readFavourites = (envelope: FavouritesEnvelope): FoodFavourites => {
  const dishes = Array.isArray(envelope?.dishes) ? envelope.dishes : [];
  const kitchens = Array.isArray(envelope?.kitchens) ? envelope.kitchens : [];

  return {
    /* Each dish is adapted THROUGH its own kitchen, exactly as
       `toKitchenWithMenu` does it — the kitchen supplies the id a dish hangs
       off. */
    dishes: dishes
      .map((row) => {
        if (!row?.restaurant) return null;
        const kitchen = toKitchen(row.restaurant as never);
        return toDish(row as never, kitchen.id);
      })
      .filter((dish): dish is Dish => Boolean(dish && dish.id && dish.kitchenId)),
    kitchens: kitchens
      .map((row) => toKitchen(row as never))
      .filter((kitchen): kitchen is Kitchen => Boolean(kitchen && kitchen.id)),
    unavailable: Number(envelope?.unavailable) || 0,
  };
};

export async function fetchFoodFavourites(signal?: AbortSignal): Promise<FoodFavourites> {
  const envelope = await api.get<FavouritesEnvelope>(
    endpoints.customerFoodFavourites,
    { signal },
  );
  /* `unwrap` would throw away the two arrays — they sit beside `data` on this
     envelope rather than inside it, the same way `unread` does on the support
     list. Read the envelope directly, but still let `unwrap` raise on a
     `success: false` so a failure is never silently an empty list. */
  unwrap({ ...envelope, data: envelope.dishes ?? [] });
  return readFavourites(envelope);
}

/**
 * Heart something.
 *
 * Idempotent server-side: hearting what is already hearted is a 200 and does
 * not duplicate the row. The caller is a button on a scrolling list, so a
 * double tap and a retry after a dropped response are both ordinary.
 */
export async function addFoodFavourite(
  kind: 'dish' | 'kitchen',
  id: string,
  signal?: AbortSignal,
): Promise<FoodFavourites> {
  const envelope = await api.post<FavouritesEnvelope>(
    endpoints.customerFoodFavourites,
    { kind, id },
    { signal },
  );
  return readFavourites(envelope);
}

/** Take the heart off. Un-hearting what was never hearted is also a 200. */
export async function removeFoodFavourite(
  kind: 'dish' | 'kitchen',
  id: string,
  signal?: AbortSignal,
): Promise<FoodFavourites> {
  const envelope = await api.delete<FavouritesEnvelope>(
    endpoints.customerFoodFavouriteOne(kind, id),
    { signal },
  );
  return readFavourites(envelope);
}

export { EMPTY as EMPTY_FAVOURITES };
