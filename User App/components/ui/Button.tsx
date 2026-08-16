import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { usePressAnimation } from '@/hooks/usePressAnimation';
import { useTheme } from '@/context/ThemeContext';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'lg' | 'md' | 'sm';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Leading only. A trailing icon implies navigation; these buttons commit. */
  icon?: IconName;
  loading?: boolean;
  /** Shown in place of `label` while loading — say what is happening. */
  loadingLabel?: string;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
  testID?: string;
};

/**
 * Heights, not radii, carry the size difference.
 *
 * Batch 1 originally paired each size with its own radius (14 / 12 / 10). The
 * Batch 12 audit deleted those: a radius is chosen by what an element is, and
 * all three of these are buttons. So the radius is constant and `sm` is a
 * padding change rather than a different shape — which is also how the sheet
 * described `sm` in the first place, since it can never go below 44pt.
 */
const SIZES = {
  lg: { height: 52, paddingHorizontal: 24 },
  md: { height: 48, paddingHorizontal: 20 },
  sm: { height: 44, paddingHorizontal: 16 },
} as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  loading = false,
  loadingLabel,
  disabled = false,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors, radius } = useTheme();
  const { animatedStyle, onPressIn, onPressOut, progress } = usePressAnimation(
    fullWidth ? 'buttonFullWidth' : 'button',
  );
  const [focused, setFocused] = useState(false);

  const inert = disabled || loading;
  const metrics = SIZES[size];

  // Resting and pressed backgrounds per variant. Only `primary` is ever
  // filled — a destructive action is an outline, so it can never be the
  // heaviest thing on screen.
  const fills: Record<ButtonVariant, { rest: string; pressed: string }> = {
    primary: { rest: colors.brand, pressed: colors.brandPressed },
    secondary: { rest: 'transparent', pressed: colors.surfaceSunken },
    ghost: { rest: 'transparent', pressed: colors.surfaceSunken },
    destructive: { rest: 'transparent', pressed: colors.danger.tint },
  };

  const borders: Record<ButtonVariant, { color: string; width: number }> = {
    primary: { color: 'transparent', width: 0 },
    secondary: { color: colors.textPrimary, width: 1.5 },
    ghost: { color: 'transparent', width: 0 },
    destructive: { color: colors.danger.base, width: 1.5 },
  };

  const labelColors: Record<ButtonVariant, string> = {
    primary: colors.onBrand,
    secondary: colors.textPrimary,
    ghost: colors.brandInk,
    destructive: colors.danger.ink,
  };

  const border = borders[variant];
  const labelColor = inert ? colors.textTertiary : labelColors[variant];

  /*
   * Disabled is a flat grey, not the live button at 55% opacity.
   *
   * The old treatment dimmed the whole component, which composites the fill AND
   * the label toward the page at once — a disabled primary rendered its label
   * at **1.73:1** against its own fill, which is not readable by anybody.
   *
   * That mattered more than a normal disabled state should, because the listing
   * screen keeps its primary action disabled for the entire first pass through
   * the form: "Send confirmation" is the instruction telling somebody what all
   * those dropdowns are for, and it was the least legible thing on the screen.
   *
   * A sunken fill with tertiary ink reads as unmistakably off — flat, no
   * colour, no press response — and lands at 4.9:1 in light and 6.0:1 in dark.
   * Opacity now only carries the loading state, where the label is still live
   * text and the dimming is the point.
   */
  const fill = inert
    ? { rest: colors.surfaceSunken, pressed: colors.surfaceSunken }
    : fills[variant];

  const animatedFill = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(progress.value, [0, 1], [fill.rest, fill.pressed]),
    }),
    [fill.rest, fill.pressed],
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      accessibilityLabel={loading ? (loadingLabel ?? label) : label}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={[fullWidth ? styles.fullWidth : styles.hug, style]}
    >
      <Animated.View
        style={[
          styles.body,
          animatedStyle,
          animatedFill,
          {
            height: metrics.height,
            paddingHorizontal: metrics.paddingHorizontal,
            borderRadius: radius.button,
            borderWidth: border.width,
            borderColor: inert ? colors.borderInput : border.color,
            // Loading only. Disabled is carried by the fill, not by fading.
            opacity: loading && !disabled ? 0.7 : 1,
          },
          // The focus ring is offset rather than inset so it never eats into
          // the 44pt target. It does not animate — a moving focus indicator is
          // harder to track, not easier.
          focused && {
            borderWidth: 3,
            borderColor: colors.info.border,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={labelColor} />
        ) : icon ? (
          <Icon name={icon} size={20} color={labelColor} />
        ) : null}

        <Text variant="bodyStrong" style={{ color: labelColor }} numberOfLines={1}>
          {loading ? (loadingLabel ?? label) : label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch' },
  hug: { alignSelf: 'flex-start' },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // space.2 + 1 — the measured gap between a 20px glyph and its label.
    gap: 9,
  },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  iconButtonBody: { alignItems: 'center', justifyContent: 'center' },
});

export type IconButtonProps = {
  name: IconName;
  onPress?: () => void;
  /** Required. An icon-only control is unusable without it. */
  accessibilityLabel: string;
  variant?: 'default' | 'brand' | 'onImage';
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/**
 * A 44pt target around a 24px glyph.
 *
 * The visual box is allowed to be smaller than the target — `onImage` draws a
 * 36pt scrim disc — but the pressable itself never is.
 */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  variant = 'default',
  disabled = false,
  style,
  testID,
}: IconButtonProps) {
  const { colors, touch, radius } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation('iconButton');

  const glyphColor = disabled
    ? colors.textTertiary
    : variant === 'brand'
      // A glyph drawn in green on a light surface is type, not fill.
      ? colors.brandInk
      : variant === 'onImage'
        ? '#FFFFFF'
        : colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={touch.iconButtonHitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      testID={testID}
      style={[{ width: touch.min, height: touch.min }, styles.iconButton, style]}
    >
      <Animated.View
        style={[
          styles.iconButtonBody,
          animatedStyle,
          {
            width: touch.iconButtonVisual,
            height: touch.iconButtonVisual,
            borderRadius: radius.pill,
            // A 55% scrim is what keeps a white glyph legible over an unknown
            // photograph — owner uploads are not art-directed.
            backgroundColor: variant === 'onImage' ? 'rgba(16,21,28,0.55)' : 'transparent',
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <Icon name={name} size={24} color={glyphColor} />
      </Animated.View>
    </Pressable>
  );
}
