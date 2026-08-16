import React from 'react';
import { Text as RNText, StyleSheet, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/context/ThemeContext';
import {
  maxFontSizeMultiplier,
  resolveFontFamily,
  typeScale,
  type ThemeColors,
  type TypeVariant,
} from '@/constants/tokens';

/**
 * The colour roles text is allowed to take.
 *
 * The four semantic names resolve to that role's `ink` step, which is the
 * only step in a semantic set that is guaranteed readable as text.
 */
export type TextColor =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'brand'
  | 'onGraphite'
  | 'onGraphiteMuted'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'inherit';

function resolveColor(colors: ThemeColors, color: TextColor): string | undefined {
  switch (color) {
    case 'primary':
      return colors.textPrimary;
    case 'secondary':
      return colors.textSecondary;
    case 'tertiary':
      return colors.textTertiary;
    case 'brand':
      return colors.brand;
    case 'onGraphite':
      return colors.onGraphite;
    case 'onGraphiteMuted':
      return colors.onGraphiteMuted;
    case 'success':
      return colors.success.ink;
    case 'warning':
      return colors.warning.ink;
    case 'danger':
      return colors.danger.ink;
    case 'info':
      return colors.info.ink;
    case 'inherit':
      return undefined;
  }
}

export type TextProps = Omit<RNTextProps, 'style'> & {
  /** A name from the type scale. There is no way to set a size directly. */
  variant?: TypeVariant;
  color?: TextColor;
  /** Overrides only. Font family, size, weight and spacing come from `variant`. */
  style?: TextStyle | TextStyle[];
};

/**
 * The single typography component. Every string the user reads goes through it.
 *
 * Screens do not set fontSize, fontWeight, fontFamily or letterSpacing — they
 * name a variant from the scale. That is what keeps type consistent across
 * sixty-five screens built weeks apart, and it is why this component takes no
 * size prop at all.
 *
 * It also carries two things that are easy to forget per-call and expensive to
 * miss: the per-face cap on OS font scaling, and tabular figures on every
 * numeric variant so a changing rupee amount or countdown never reflows the
 * layout around it.
 */
export function Text({ variant = 'body', color = 'primary', style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const token = typeScale[variant];

  const resolved: TextStyle = {
    fontFamily: resolveFontFamily(token.face, token.weight),
    fontSize: token.size,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    color: resolveColor(colors, color),
  };

  if ('upper' in token && token.upper) {
    resolved.textTransform = 'uppercase';
  }

  if ('tabular' in token && token.tabular) {
    resolved.fontVariant = ['tabular-nums'];
  }

  const noScale = 'noScale' in token && token.noScale;

  return (
    <RNText
      allowFontScaling={!noScale}
      maxFontSizeMultiplier={noScale ? undefined : maxFontSizeMultiplier[token.face]}
      style={StyleSheet.flatten([resolved, style])}
      {...rest}
    />
  );
}
