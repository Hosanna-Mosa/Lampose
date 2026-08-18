import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Switches on the device's own appearance setting (`useColorScheme`) —
 * there is no in-app toggle, so a user's phone-level light/dark choice is
 * the only thing that decides this. Both `colors.light` and `colors.dark`
 * in constants/colors.ts are real, independently-tuned palettes.
 */
export function useColors() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
