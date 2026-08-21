import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { usePressAnimation } from '@/hooks/usePressAnimation';
import { useTheme } from '@/context/ThemeContext';

/**
 * The `onImage` disc and its glyph, as literals rather than tokens.
 *
 * Everything else in this file reads its colours from the theme. These two
 * cannot: they are drawn on top of a PHOTOGRAPH, which has no mode. A token
 * pair would flip with the app's appearance setting and put a near-black disc
 * with a near-white glyph over the same night shot the white one was chosen
 * for. The photo does not get darker because the user turned dark mode on.
 *
 * SURFACE and INK from the Dock palette, held here at 17.6:1.
 */
const ON_IMAGE_DISC = '#FFFFFF';
const ON_IMAGE_INK = '#1A1917';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'lg' | 'md' | 'sm' | 'xs';

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
 * all four of these are buttons. So the radius is constant and a smaller size
 * is a height and padding change rather than a different shape.
 *
 * ## `xs` draws below 44pt, and the tap target does not follow it
 *
 * The sheet said a button "can never go below 44pt", and that held while `sm`
 * at 44 was the floor. `xs` is deliberately under it: it is for an inline
 * offer that sits in the middle of content rather than at the end of a flow —
 * "See all 4 in Bangalore" above the feed — where an `sm` button reads as the
 * thing the screen is asking you to do, and it is not.
 *
 * What must NOT shrink with the box is the thing a thumb has to hit. The
 * shortfall against `touch.min` is handed back as vertical `hitSlop` below, so
 * the button looks 30pt and is still a 44pt target. That is the same trade the
 * system already makes twice: `touch.iconButtonVisual` is 36 with hitSlop out
 * to 44, and the Filters chip is a 40pt box with the same correction.
 *
 * `borderWidth` is per size for the reason the height is — 1.5pt is
 * proportionate on a 48pt button and reads as a heavy box at 30.
 */
const SIZES = {
  lg: { height: 52, paddingHorizontal: 24, borderWidth: 1.5 },
  md: { height: 48, paddingHorizontal: 20, borderWidth: 1.5 },
  sm: { height: 44, paddingHorizontal: 16, borderWidth: 1.5 },
  xs: { height: 30, paddingHorizontal: 12, borderWidth: 1 },
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
  const { colors, radius, touch } = useTheme();
  const { animatedStyle, onPressIn, onPressOut, progress } = usePressAnimation(
    fullWidth ? 'buttonFullWidth' : 'button',
  );
  const [focused, setFocused] = useState(false);

  const inert = disabled || loading;
  const metrics = SIZES[size];

  /*
   * Whatever the drawn box gives up against the 44pt minimum, taken back as
   * touch area. Zero for every size at or above it, so this is inert unless a
   * size actually draws short — see the note on `SIZES`.
   */
  const shortfall = Math.max(0, touch.min - metrics.height) / 2;

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
      hitSlop={shortfall ? { top: shortfall, bottom: shortfall } : undefined}
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
            // The variant decides WHETHER there is an outline; the size decides
            // how heavy it is.
            borderWidth: border.width > 0 ? metrics.borderWidth : 0,
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
          // Down a rung on the grid at `xs` — a 20px glyph fills two thirds of
          // a 30pt box and turns the button into an icon with a caption.
          <Icon name={icon} size={size === 'xs' ? 16 : 20} color={labelColor} />
        ) : null}

        {/*
          The label does not change face or weight with the size, and that is
          the point of the scale. `Text` owns typography by variant — a size
          that reached in and set its own `fontSize` would be the drift the
          component exists to prevent, and setting `fontWeight` here does
          nothing anyway: React Native cannot synthesise a weight, so the
          family resolved from the variant is what actually renders.
        */}
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
  active?: boolean;
  disabled?: boolean;
  /**
   * The glyph size, from the icon grid. 24 is the default and stays right for
   * a control that is the only thing on its side of a bar — a back arrow, the
   * bookmark over a photo.
   *
   * It drops to 20 where the button sits beside other glyphs at 20 and the
   * default would make it the loudest mark in the row for no reason. The
   * PRESSABLE is unaffected either way: the 44pt target is set below and is
   * not negotiable, so this only changes what is drawn inside it.
   */
  size?: 16 | 20 | 24;
  style?: ViewStyle;
  testID?: string;
};

/**
 * A 44pt target around the glyph.
 *
 * The visual box is allowed to be smaller than the target — `onImage` draws a
 * 36pt scrim disc — but the pressable itself never is.
 */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  variant = 'default',
  active = false,
  disabled = false,
  size = 24,
  style,
  testID,
}: IconButtonProps) {
  const { colors, touch, radius, elevation } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation('iconButton');

  /*
   * `onImage` is a WHITE DISC with an ink glyph, not a dark scrim with a white
   * one — changed with the Dock repaint to match the reference's listing
   * screen, where the back arrow and the bookmark are white circles over the
   * photo.
   *
   * It is also the more robust of the two over owner-uploaded photography,
   * which is not art-directed. A 55% dark scrim carries a white glyph well over
   * a bright photo and poorly over a dark one — the disc itself disappears into
   * a night shot or a dim stairwell, taking the control's edge with it. An
   * opaque white disc has the same silhouette on every photo there is, and the
   * glyph inside it is ink on white at 17.6:1 rather than white on a
   * part-transparent grey.
   *
   * The trade is that a white disc is louder over a pale photo than a scrim
   * was. That is the right way round for these two controls: back and save are
   * the only things on the image, and both need to be found immediately.
   */
  const glyphColor = disabled
    ? colors.textTertiary
    : active
      ? colors.brandInk
      : variant === 'brand'
        // A glyph drawn in the accent on a light surface is type, not fill.
        ? colors.brandInk
        : variant === 'onImage'
          // Literal ink, for the same reason the disc is literal white: in dark
          // mode `textPrimary` is near-WHITE, and a near-white glyph on a white
          // disc is an empty circle.
          ? ON_IMAGE_INK
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
      accessibilityState={{ disabled, selected: active }}
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
            // An opaque white disc, per the note on `glyphColor`. Literal white
            // rather than `surface`, because this sits on a photograph in both
            // modes — a dark-mode surface would put a near-black disc on a
            // near-black night shot.
            backgroundColor: variant === 'onImage' ? ON_IMAGE_DISC : 'transparent',
            opacity: disabled ? 0.55 : 1,
          },
          // The disc needs to lift off the photo it is standing on. Without it
          // a white control on an overexposed sky has no edge at all.
          variant === 'onImage' ? elevation.raised : null,
        ]}
      >
        <Icon name={name} size={size} color={glyphColor} fill={active ? glyphColor : 'none'} />
      </Animated.View>
    </Pressable>
  );
}
