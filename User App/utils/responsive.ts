import { useWindowDimensions } from 'react-native';

/**
 * The text scale at which side-by-side layouts have to stack.
 *
 * The accessibility pass found three layouts that fit at 1.0× and collide at
 * 1.8×, which is the multiplier body text is allowed to reach. All three are
 * the same shape: a fixed row holding a price next to something else.
 *
 * 1.4 is where the collision starts rather than where it becomes total, so the
 * stack happens before anything overlaps rather than after.
 *
 * `allowFontScaling` stays true everywhere. The rule is that the app must still
 * *work* at the largest system font size, not merely avoid crashing — a student
 * who needs 1.8× text is exactly the student who cannot afford to misread a
 * deposit.
 */
export const STACK_ABOVE_SCALE = 1.4;

/**
 * Below this window width, side-by-side layouts stack as well.
 *
 * Text scale is not the only thing that removes room. Android's **Display
 * size** setting changes the density rather than the font, so the screen gets
 * narrower *in layout units* while `fontScale` stays at 1.0 — a 411-unit phone
 * becomes ~360 or less. A layout watching only `fontScale` sees nothing wrong
 * and runs off the right edge, which is how a primary button ends up half
 * off-screen.
 *
 * 380 comes from what has to fit rather than from a device list: the action bar
 * carries a price block beside a full-height button, and below roughly 380
 * those two stop coexisting on one row. Confirm on hardware before treating it
 * as exact.
 */
export const STACK_BELOW_WIDTH = 380;

/**
 * The device's text scale, from the OS accessibility setting.
 *
 * `useWindowDimensions` re-renders on change, so a student who adjusts the
 * setting with the app backgrounded returns to a correct layout rather than a
 * broken one that fixes itself on the next navigation.
 */
export function useFontScale(): number {
  return useWindowDimensions().fontScale;
}

/**
 * True when side-by-side content must become stacked.
 *
 * Either cause is enough — bigger text, or less room. They are two independent
 * OS settings and a user can have one without the other, so asking about only
 * one of them is the bug this function used to have.
 */
export function useShouldStack(): boolean {
  const { fontScale, width } = useWindowDimensions();
  return fontScale > STACK_ABOVE_SCALE || width < STACK_BELOW_WIDTH;
}
