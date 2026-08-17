/**
 * The module's pushed routes, as typed hrefs.
 *
 * Written as `{ pathname, params }` objects rather than interpolated strings on
 * purpose. Expo Router's generated route types emit a string pattern only for
 * single-segment dynamic routes — `/listing/${id}` is in the union, but the
 * module's two-level ones (`/food/kitchen/[id]`) are not, so every interpolated
 * push would have to be cast to silence it. The object form is in the union,
 * carries the params separately, and needs no cast at all.
 *
 * Keeping them here also means a route rename is one file rather than fourteen
 * call sites.
 */

export const foodHref = {
  kitchen: (id: string) => ({ pathname: '/food/kitchen/[id]' as const, params: { id } }),
  dish: (id: string) => ({ pathname: '/food/dish/[id]' as const, params: { id } }),
  /**
   * `placed` marks the arrival straight from payment, which is the one time the
   * screen leads with "payment successful" and Back goes home rather than to a
   * checkout the student has already completed.
   */
  order: (id: string, placed = false) => ({
    pathname: '/food/order/[id]' as const,
    params: placed ? { id, placed: '1' } : { id },
  }),
  cart: '/food/cart' as const,
  slot: '/food/slot' as const,
  coupons: '/food/coupons' as const,
  payment: '/food/payment' as const,
  preferences: '/food/preferences' as const,
  favourites: '/food/favourites' as const,
};
