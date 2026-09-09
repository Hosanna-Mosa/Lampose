import React, { createContext, useContext, useMemo } from 'react';

import { staysTypeScale, typeScale } from '@/constants/tokens';

/**
 * Which module's typography a subtree is in.
 *
 * ## Why this exists at all
 *
 * The stay side moved to one family and four sizes; the food side did not.
 * They share `components/ui/Text`, so the two scales cannot both be "the"
 * scale — something has to say which subtree is which.
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

type Scale = typeof typeScale | typeof staysTypeScale;

const TypographyContext = createContext<Scale>(staysTypeScale);

export function TypographyScope({
  module,
  children,
}: {
  module: TypographyModule;
  children: React.ReactNode;
}) {
  /* Both scales are frozen module constants, so the only thing that can change
     is which one — no need to rebuild anything below on every render. */
  const value = useMemo(() => (module === 'food' ? typeScale : staysTypeScale), [module]);

  return <TypographyContext.Provider value={value}>{children}</TypographyContext.Provider>;
}

/** The scale in force here. Read by `Text`, and by nothing else. */
export function useTypeScale(): Scale {
  return useContext(TypographyContext);
}
