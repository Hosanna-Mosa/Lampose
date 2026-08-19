import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { type TypeVariant, type as typeScale } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import type { Palette } from '@/constants/colors';

type Props = RNTextProps & {
  variant?: TypeVariant;
  /** Any color token name, or a raw color string. */
  color?: keyof Palette | (string & {});
  /** Line up digits in columns — earnings, payouts, calendar cells. */
  tabular?: boolean;
  center?: boolean;
};

export function Text({
  variant = 'body',
  color = 'textPrimary',
  tabular,
  center,
  style,
  ...rest
}: Props) {
  const c = useColors();
  /*
   * `useColors()` returns the palette PLUS `radius`, which is a number — so
   * the object genuinely is not a `Record<string, string>` and the old cast
   * was a lie tsc was right to reject.
   *
   * Reading it as `unknown` and checking the result also closes the bug that
   * cast was hiding: `<Text color="radius">` resolved to the number 16 and
   * handed React Native a numeric colour. Anything that is not a string token
   * now falls through to being treated as a raw colour, which is what the
   * prop's `(string & {})` half already promised.
   */
  const token = (c as Record<string, unknown>)[color as string];
  const resolved = typeof token === 'string' ? token : (color as string);

  const base: TextStyle = {
    ...typeScale[variant],
    color: resolved,
  };
  if (center) base.textAlign = 'center';
  if (tabular) base.fontVariant = ['tabular-nums'];

  return <RNText {...rest} style={[base, style]} />;
}
