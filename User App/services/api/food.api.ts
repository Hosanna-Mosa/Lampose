import type { Dish, Kitchen } from '@/types/food';
import {
  toDish,
  toKitchen,
  toKitchenWithMenu,
  type BackendDish,
  type BackendKitchen,
  type BackendMenuGroup,
  type KitchenWithMenu,
} from '@/services/adapters/food.adapter';
import { api } from './client';
import { endpoints } from './endpoints';

/**
 * Kitchens and dishes, as the app asks for them.
 *
 * These read the public half of the food-partner module — the same rows the
 * Food-Partner app writes and an administrator approves. Nothing here can see
 * an unapproved kitchen: the server filters on `verificationStatus` and
 * `isActive` before it projects, so this app cannot reach one even by asking
 * for it by id.
 *
 * ## The feed is filtered by the server wherever the server can
 *
 * Distance, cuisine, a text search and "open now" are all columns the
 * `food_restaurants` collection has, so they travel over the wire and a phone
 * on a bus downloads six kitchens rather than six hundred. Meal windows are
 * NOT sent: they are derived from opening hours on the device (see
 * `food.adapter.ts`), because the collection stores trading hours and has no
 * column for the app's five windows.
 */

export type KitchenQuery = {
  /** With a pin, the feed is ordered by distance and rows carry `distanceKm`. */
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
  cuisine?: string | null;
  search?: string | null;
  openNow?: boolean;
  limit?: number;
};

type KitchenListResponse = { success?: boolean; data?: BackendKitchen[] };
type KitchenDetailResponse = {
  success?: boolean;
  data?: { restaurant?: BackendKitchen; menu?: BackendMenuGroup[] };
};

/** `GET /products/:productId` answers `{ data: { product, restaurant } }`. */
type DishResponse = { success?: boolean; data?: { product?: BackendDish; restaurant?: BackendKitchen } };

const clean = (query: KitchenQuery): Record<string, string> => {
  const out: Record<string, string> = {};
  if (typeof query.lat === 'number' && typeof query.lng === 'number') {
    out.lat = String(query.lat);
    out.lng = String(query.lng);
    if (query.radiusKm) out.radiusKm = String(query.radiusKm);
  }
  if (query.cuisine?.trim()) out.cuisine = query.cuisine.trim();
  if (query.search?.trim()) out.search = query.search.trim();
  if (query.openNow) out.openNow = 'true';
  if (query.limit) out.limit = String(query.limit);
  return out;
};

/**
 * The kitchen feed.
 *
 * Sections come back empty on a list row — the list endpoint projects the
 * columns a card draws and deliberately does not carry a whole menu, so the
 * menu section names are only known once a kitchen is opened.
 */
export async function fetchKitchens(query: KitchenQuery = {}): Promise<Kitchen[]> {
  const search = new URLSearchParams(clean(query)).toString();
  const path = search ? `${endpoints.foodKitchens}?${search}` : endpoints.foodKitchens;

  const res = await api.get<KitchenListResponse>(path);
  const rows = Array.isArray(res?.data) ? res.data : [];
  return rows.filter((row) => row?.restaurantId).map((row) => toKitchen(row));
}

/** One kitchen with its whole menu, grouped the way the kitchen arranged it. */
export async function fetchKitchen(restaurantId: string): Promise<KitchenWithMenu | null> {
  const res = await api.get<KitchenDetailResponse>(endpoints.foodKitchen(restaurantId));
  return toKitchenWithMenu(res?.data ?? {});
}

/**
 * One dish.
 *
 * The detail route returns the dish plus a summary of its kitchen, which is
 * what lets the screen print a name at the top without a second request.
 */
export async function fetchDish(productId: string): Promise<{ dish: Dish; kitchen: Kitchen } | null> {
  const res = await api.get<DishResponse>(endpoints.foodDish(productId));
  const rawDish = res?.data?.product;
  const rawKitchen = res?.data?.restaurant;

  if (!rawDish?.productId || !rawKitchen?.restaurantId) return null;

  const kitchen = toKitchen(rawKitchen);
  return { dish: toDish(rawDish, kitchen.id), kitchen };
}
