import React, { createContext, useContext } from 'react';

import { staysTypeScale } from '@/constants/tokens';

/**
 * Which module's typography a subtree is in.
 *
 * ## ONE scale now
 *
 * Food used to keep its own denser scale (`typeScale` — 11.5pt body, 12pt
 * card titles). It now draws in the stay side's four sizes too, so the two
 * modules read as one app: same family, same sizes. The scope is kept so the
 * places that mark a food subtree still say so, and so a food-only scale can
 * come back in one line if it is ever wanted — but today both answer the
 * same. The history below is why the scope exists at all.
 *
 * ## Why this exists at all
 *
 * Both sides draw in one family (Manrope), but the stay side moved to four
 * sizes and the food side kept its own denser scale. They share
 * `components/ui/Text`, so the two scales cannot both be "the" scale —
 * something has to say which subtree is which.
 *
 * ## Why STAYS is the default
 *
 * Because it is almost everything. Ninety-nine files render stay screens
 * against thirty food ones, and food is the part with a hard boundary —
 * `app/food/*` and one `<FoodModule />` inside the home screen. Defaulting to
 * stays means a new stay screen inherits the new type without being told,
 * while food has to opt out in exactly the two places it is mounted.
 *
 * The inverse — default food, wrap stays — would need a provider around
 * ninety-nine screens and would silently give the wrong type to the hundredth.
 *
 * ## Why it is not route-based
 *
 * Food is not purely a route. `app/home.tsx` renders `<FoodModule />` inline
 * as a TAB, so a provider keyed on the pathname would put the food module in
 * stay typography whenever it was reached that way. A React subtree is what
 * actually matches where the components are, so a React subtree is what scopes
 * them.
 */
export type TypographyModule = 'stays' | 'food';

type Scale = typeof staysTypeScale;

const TypographyContext = createContext<Scale>(staysTypeScale);

export function TypographyScope({
  children,
}: {
  /** Which module this subtree is. Both answer the stay scale today. */
  module: TypographyModule;
  children: React.ReactNode;
}) {
  return <TypographyContext.Provider value={staysTypeScale}>{children}</TypographyContext.Provider>;
}

/** The scale in force here. Read by `Text`, and by nothing else. */
export function useTypeScale(): Scale {
  return useContext(TypographyContext);
}
