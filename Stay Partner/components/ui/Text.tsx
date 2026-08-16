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
  const resolved = (c as Record<string, string>)[color as string] ?? (color as string);

  const base: TextStyle = {
    ...typeScale[variant],
    color: resolved,
  };
  if (center) base.textAlign = 'center';
  if (tabular) base.fontVariant = ['tabular-nums'];

  return <RNText {...rest} style={[base, style]} />;
}
