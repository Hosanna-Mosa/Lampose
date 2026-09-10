/**
 * The search-box filter that eleven pages had written out one at a time.
 *
 * Only the part that was genuinely identical lives here: trim the term, fold it
 * to lower case, return everything if it is empty, otherwise keep the rows the
 * caller's predicate accepts. **The predicate stays with the page**, verbatim,
 * and that is deliberate — the eleven copies were near-identical, not
 * identical, and the differences look like decisions rather than accidents:
 *
 *   · `PermissionsPage` and `PropertiesPage` test an array of fields with
 *     `.filter(Boolean).some(...)`; `ProductsPage` joins them into a template
 *     string, which matches across the gap between two fields where the array
 *     form does not.
 *   · `RefundsPage` folds five of its six fields and deliberately does NOT fold
 *     `bank.accountNumber` — an account number has no case to fold.
 *
 * (The wording above avoids the bare word for case-folding on purpose:
 * Tailwind scans these files for class-like tokens, and that word is a real
 * utility. Writing it in a comment adds a rule to the generated stylesheet,
 * which is a change to the rendered output — the comparison caught exactly
 * that and this is the fix.)
 *   · `OnboardingTeamPage` searches one field, not a joined set.
 *
 * Folding those into one "smarter" matcher would change what four screens find,
 * silently, and no screenshot would show it.
 *
 * This is a plain function rather than a hook on purpose. A hook would have to
 * own the `useMemo`, and every caller derives its list inside that memo
 * (`data ?? []`, `data?.items ?? []`, a status filter first). Moving the memo
 * would make it recompute on every render instead of when its data changed —
 * the same output, arrived at more often. The callers keep their memo and its
 * dependency list exactly as they were.
 */
export const filterBySearch = <T>(
  list: T[],
  search: string,
  matches: (item: T, q: string) => boolean
): T[] => {
  const q = search.trim().toLowerCase();
  if (!q) return list;
  return list.filter((item) => matches(item, q));
};
