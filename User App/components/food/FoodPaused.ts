import { createContext, useContext } from 'react';

import { useAmbientPaused } from '@/context/AmbientMotionContext';

/**
 * Whether the food module is mounted but OFF screen.
 *
 * `FoodModule` stays mounted while a stay tab is open (see the Food branch in
 * `app/home.tsx`), so opening Food shows a tree that already exists. Anything
 * in it that runs forever — the banner's autoplay, shine, steam, rider and
 * drifting shapes, the cuisine rail's rock, the rotating search placeholder —
 * reads this and stops while it is true, and starts again when it is not, so a
 * hidden module costs no frames and no battery.
 *
 * Also true while another screen covers Home (a dish, the cart, an order):
 * the module is on its tab but nobody can see it, and its loops would slow the
 * screen that is showing. See `AmbientMotionContext`.
 *
 * Defaults to `false`: the same banner rendered anywhere else (the stay side's
 * `FoodWaitPromo`) is never paused by it.
 */
export const FoodPausedContext = createContext(false);

export function useFoodPaused(): boolean {
  const hidden = useContext(FoodPausedContext);
  const covered = useAmbientPaused();
  return hidden || covered;
}
