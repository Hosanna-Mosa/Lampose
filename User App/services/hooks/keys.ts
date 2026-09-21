import type { StayCategory } from '@/constants/tokens';

/**
 * Every cache key in one place.
 *
 * React Query decides what is the same request by comparing these arrays, so
 * a key built inline at a call site is a key that will eventually be built
 * slightly differently at the next one — and two spellings of the same query
 * means two fetches, two caches, and a screen showing a listing the feed no
 * longer has.
 *
 * The shape is hierarchical on purpose: `['listings']` invalidates every
 * variant of the feed at once, without needing to know which filters any
 * mounted screen happens to be holding.
 */
export const queryKeys = {
  health: ['health'] as const,

  /* Food. `['food']` invalidates every kitchen and dish at once — which is
     what a pull-to-refresh on the food home wants, without needing to know
     which kitchen pages happen to be mounted behind it. */
  food: ['food'] as const,
  foodKitchenList: (query: {
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number | null;
    cuisine?: string | null;
    search?: string | null;
    openNow?: boolean;
    limit?: number;
  }) =>
    [
      'food',
      'kitchens',
      query.lat ?? null,
      query.lng ?? null,
      query.radiusKm ?? null,
      query.cuisine ?? null,
      query.search?.trim() || null,
      query.openNow ?? false,
      query.limit ?? null,
    ] as const,
  foodKitchen: (restaurantId: string) => ['food', 'kitchen', restaurantId] as const,
  foodDish: (productId: string) => ['food', 'dish', productId] as const,

  /* The stay itself, as opposed to the request that asked for it. Both are
     cached separately because they change for different reasons and at
     different rates — see `useBookings`. */
  bookings: ['bookings'] as const,
  booking: (id: string) => ['bookings', id] as const,

  listings: ['listings'] as const,
  listingList: (filters: {
    category?: StayCategory | null;
    city?: string | null;
    locality?: string | null;
    maxPrice?: number | null;
    search?: string | null;
    near?: { lat: number; lng: number; radiusKm: number } | null;
  }) =>
    [
      'listings',
      'list',
      filters.category ?? null,
      filters.city ?? null,
      filters.locality ?? null,
      filters.maxPrice ?? null,
      filters.search?.trim() || null,
      /* Rounded: a GPS fix drifts by metres between two reads of "here", and
         a fresh cache key for every jitter would refetch on the same tap. */
      filters.near
        ? [
          Math.round(filters.near.lat * 1000) / 1000,
          Math.round(filters.near.lng * 1000) / 1000,
          filters.near.radiusKm,
        ]
        : null,
    ] as const,

  listing: (id: string) => ['listings', 'detail', id] as const,
  /* Under the detail key, so invalidating a listing takes its reviews too. */
  listingReviews: (id: string) => ['listings', 'detail', id, 'reviews'] as const,
  listingMeta: ['listings', 'meta'] as const,

  visitRequest: (id: string) => ['visit-requests', id] as const,
  /* The stay request the countdown screen watches. Keyed by id rather than by
     listing, because the push payload carries an id and nothing else. */
  stayRequest: (id: string) => ['stay-requests', id] as const,

  /* One key for the list and the unread badge, so the number on the bell and
     the rows on the screen are the same fetch and cannot disagree. */
  notifications: ['notifications'] as const,
  /* Which alerts THIS DEVICE has opened. Device state rather than server
     state — see the note in `useNotifications` for why a per-alert read mark
     cannot be a watermark.

     Deliberately NOT under the `['notifications']` prefix. Marking one read
     writes this key optimistically and then writes the disk in the
     background; an invalidation of the server list that also swept this key
     would re-read the disk mid-write and put the dot back. Separate prefixes
     mean the two can never race. */
  notificationsRead: ['notifications-read'] as const,

  /** The food-order discount a referral code may have unlocked. */
  myCoupon: ['myCoupon'] as const,
  stayCoupons: ['stayCoupons'] as const,

  /* The delivery address book. One key, so the profile row's count and the
     book screen itself are the same fetch. */
  addresses: ['addresses'] as const,

  /* One key behind the Saved tab and every bookmark on every card, so a
     listing saved from the feed is already saved when the tab is opened. */
  saved: ['saved'] as const,

  /* Food favourites — a different list from `saved`, which is the stay
     shortlist. Two keys because the two are invalidated by different acts:
     hearting a dish must not refetch a shortlist of rooms. */
  foodFavourites: ['food-favourites'] as const,

  /* Hierarchical, so filing a ticket or replying to one can invalidate
     `['tickets']` and refresh both the list and whichever thread is open,
     without either knowing about the other. */
  tickets: ['tickets'] as const,
  ticketList: ['tickets', 'list'] as const,
  ticket: (reference: string) => ['tickets', 'detail', reference] as const,
};

export default queryKeys;
