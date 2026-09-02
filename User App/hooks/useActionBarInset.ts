/* ══════════════════════════════════════════════════════════════════════════
   How much room a bottom action needs under it.

   Every screen with a primary action puts it in a sticky bar at the bottom —
   thumb territory, which is deliberate (`layout.reachZone`). The bar's padding
   has been a flat `space[6]` on each of them, on top of a screen root that
   applies `insets.bottom`, and on real hardware that was not enough: the
   button sat under the Android navigation bar.

   ## Why the inset alone is not a floor

   `insets.bottom` is what the platform reports, and on Android it is
   frequently 0 — a build that is not edge-to-edge, a gesture-navigation
   device that reports the bar as consumed, an OEM shell that under-reports.
   When it is 0 the only clearance left is the bar's own 24pt, and a gesture
   handle drawn over it is exactly the bug that was reported.

   `app/(entry)/auth.tsx` predicted this. Its comment says a floor "belongs on
   the root, and in one shared place rather than on this screen alone" — this
   is that place.

   ## And why the floor is not simply added

   The same comment records what went wrong the first time somebody tried:
   `Math.max(insets.bottom, 36) + space[8]` was applied on a screen whose root
   ALREADY carried the inset, so a device reporting a normal inset got roughly
   76pt of dead space under the card. A floor that is added rather than
   reconciled just moves the bug to the other kind of handset.

   So this returns the SHORTFALL — what is still missing after the root's
   inset — and nothing when there is none. On a phone that reports 34pt the
   answer is 0 and every screen looks exactly as it did; on one that reports 0
   the answer is the full floor.
   ══════════════════════════════════════════════════════════════════════════ */
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The least space that may sit between a bottom action and the screen edge,
 * counting the system bar.
 *
 * 24pt is a little over Android's 48dp gesture handle at typical densities
 * once the bar's own `space[6]` is counted alongside it, which is what makes
 * the button reachable rather than merely visible.
 */
export const ACTION_BAR_FLOOR = 24;

/**
 * Extra padding a sticky bottom bar needs, given the screen root has already
 * applied `insets.bottom`.
 *
 * Add it to whatever the bar was already using:
 *
 *   paddingBottom: space[6] + useActionBarInset()
 *
 * Zero on any device that reports a real inset, so this is a fix for the
 * handsets that were broken and a no-op for the ones that were not.
 */
export function useActionBarInset(): number {
  const insets = useSafeAreaInsets();
  return Math.max(0, ACTION_BAR_FLOOR - insets.bottom);
}

/**
 * The WHOLE clearance a bar needs when it owns the bottom edge itself.
 *
 * The distinction from `useActionBarInset` is which component already paid the
 * inset, and getting it wrong is visible in opposite directions:
 *
 *   root applies `insets.bottom`   the bar adds only the SHORTFALL
 *                                  -> useActionBarInset()
 *   root applies nothing           the bar pays the whole thing
 *                                  -> useBottomEdgeInset()
 *
 * The second case is not rare. Any screen whose root is a
 * `KeyboardAvoidingView` is in it — that component sets its own height and
 * carries no safe-area padding, so a composer pinned inside it sits directly
 * on the system bar. Using the shortfall there would add nothing at all on a
 * phone reporting a normal inset, which is precisely the handset where the
 * composer looks worst.
 */
export function useBottomEdgeInset(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, ACTION_BAR_FLOOR);
}
