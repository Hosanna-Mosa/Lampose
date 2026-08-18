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

  listings: ['listings'] as const,
  listingList: (filters: {
    category?: StayCategory | null;
    city?: string | null;
    locality?: string | null;
    maxPrice?: number | null;
    search?: string | null;
  }) =>
    [
      'listings',
      'list',
      filters.category ?? null,
      filters.city ?? null,
      filters.locality ?? null,
      filters.maxPrice ?? null,
      filters.search?.trim() || null,
    ] as const,

  listing: (id: string) => ['listings', 'detail', id] as const,
  listingMeta: ['listings', 'meta'] as const,

  visitRequest: (id: string) => ['visit-requests', id] as const,
  /* The stay request the countdown screen watches. Keyed by id rather than by
     listing, because the push payload carries an id and nothing else. */
  stayRequest: (id: string) => ['stay-requests', id] as const,

  /* One key for the list and the unread badge, so the number on the bell and
     the rows on the screen are the same fetch and cannot disagree. */
  notifications: ['notifications'] as const,

  /** The food-order discount a referral code may have unlocked. */
  myCoupon: ['myCoupon'] as const,

  /* One key behind the Saved tab and every bookmark on every card, so a
     listing saved from the feed is already saved when the tab is opened. */
  saved: ['saved'] as const,

  /* Hierarchical, so filing a ticket or replying to one can invalidate
     `['tickets']` and refresh both the list and whichever thread is open,
     without either knowing about the other. */
  tickets: ['tickets'] as const,
  ticketList: ['tickets', 'list'] as const,
  ticket: (reference: string) => ['tickets', 'detail', reference] as const,
};

export default queryKeys;
