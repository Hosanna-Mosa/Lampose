/**
 * Every cache key in one place.
 *
 * React Query decides what is the same request by comparing these arrays, so a
 * key built inline at a call site is a key that will eventually be built
 * slightly differently at the next one — and two spellings of the same query
 * means two fetches, two caches, and two screens disagreeing about the same
 * booking.
 *
 * The shape is hierarchical on purpose: `['listings']` invalidates every
 * variant at once, without needing to know which filters any mounted screen
 * happens to be holding.
 */
export const queryKeys = {
  health: ['health'] as const,

  /* The signed-in partner's own data. Hierarchical so a sign-out can drop
     `['partner']` wholesale — a cache holding the previous owner's properties
     and their customers' phone numbers must not survive one. */
  partner: ['partner'] as const,
  summary: ['partner', 'summary'] as const,
  myProperties: ['partner', 'properties'] as const,
  requests: ['partner', 'requests'] as const,
  request: (id: string) => ['partner', 'requests', id] as const,

  listings: ['listings'] as const,
  listingList: (filters: {
    category?: string | null;
    city?: string | null;
    search?: string | null;
    maxPrice?: number | null;
  }) =>
    [
      'listings',
      'list',
      filters.category ?? null,
      filters.city ?? null,
      filters.search?.trim() || null,
      filters.maxPrice ?? null,
    ] as const,

  listing: (id: string) => ['listings', 'detail', id] as const,
};

export default queryKeys;
