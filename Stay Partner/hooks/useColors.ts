import colors from '@/constants/colors';

/**
 * Returns the design tokens. Always the light palette.
 *
 * ## Why this no longer follows the device's appearance setting
 *
 * It used to call `useColorScheme()` and switch to `colors.dark` whenever
 * the PHONE was in system dark mode — with no in-app toggle to override it,
 * that made a tester's or an owner's own device setting, not anything this
 * app decides, the sole switch for its entire palette. `app.config.js`
 * already declares `userInterfaceStyle: 'light'`: this app is deliberately
 * single-theme. That native setting does not reach `useColorScheme()`
 * reliably enough to trust — this hook was proof of that — so the
 * intentional part of the config (light, always) is now asserted here too,
 * in the one place every screen reads its colors from.
 *
 * The concrete bug this caused: the root layout's status bar is hardcoded
 * to `style="dark"` (dark icons, meant for `colors.light`'s off-white
 * background). On a phone in system dark mode, this hook used to switch
 * every screen to `colors.dark` — a near-black background — while the
 * status bar kept its dark icons. Dark icons on a near-black background is
 * not a contrast problem, it is invisible, on every single screen, which is
 * exactly what it looked like.
 *
 * `colors.dark` in constants/colors.ts is left in place rather than
 * deleted — the day this app gets a real dark mode (a deliberate choice,
 * paired with a status bar that follows it), the palette is already tuned.
 */
export function useColors() {
  return { ...colors.light, radius: colors.radius };
}
