import React from "react";
import { Text as RNText, StyleSheet, type TextProps as RNTextProps, type TextStyle } from "react-native";

import { MAX_FONT_SCALE, colors, resolveFontFamily, type TypeVariant, type } from "@/theme";

/**
 * The colour roles text is allowed to take.
 *
 * The four semantic names resolve to that role's `ink` step, which is the only
 * step in a semantic set guaranteed to be readable as text — `base` is a fill.
 */
export type TextColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "brand"
  | "onBrand"
  | "onGraphite"
  | "onGraphiteMuted"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "inherit";

function resolveColor(color: TextColor): string | undefined {
  switch (color) {
    case "primary":
      return colors.textPrimary;
    case "secondary":
      return colors.textSecondary;
    case "tertiary":
      return colors.textTertiary;
    case "brand":
      return colors.brandInk;
    case "onBrand":
      return colors.onBrand;
    case "onGraphite":
      return colors.onGraphite;
    case "onGraphiteMuted":
      return colors.onGraphiteMuted;
    case "success":
      return colors.success.ink;
    case "warning":
      return colors.warning.ink;
    case "danger":
      return colors.danger.ink;
    case "info":
      return colors.info.ink;
    case "inherit":
      return undefined;
  }
}

export type TextProps = Omit<RNTextProps, "style"> & {
  /** A name from the type scale. There is no way to set a size directly. */
  variant?: TypeVariant;
  color?: TextColor;
  /** Overrides only. Family, size, weight and spacing come from `variant`. */
  style?: TextStyle | TextStyle[] | (TextStyle | false | null | undefined)[];
};

/**
 * The single typography component. Every string a rider reads goes through it.
 *
 * Screens do not set fontSize, fontWeight, fontFamily or letterSpacing — they
 * name a variant from the scale. That is what keeps type consistent across
 * twenty-three screens, and it is why this component takes no size prop.
 *
 * It also carries the two things easiest to forget per-call and most expensive
 * to miss: the cap on OS font scaling, and tabular figures on every numeric
 * variant, so a counting-down ETA never reflows the row around it.
 */
export function Text({ variant = "body", color = "primary", style, ...rest }: TextProps) {
  const token = type[variant];

  const resolved: TextStyle = {
    fontFamily: resolveFontFamily(token.face, token.weight),
    fontSize: token.size,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    color: resolveColor(color),
  };

  if ("upper" in token && token.upper) resolved.textTransform = "uppercase";
  if ("tabular" in token && token.tabular) resolved.fontVariant = ["tabular-nums"];

  const noScale = "noScale" in token && token.noScale;

  return (
    <RNText
      allowFontScaling={!noScale}
      maxFontSizeMultiplier={noScale ? undefined : MAX_FONT_SCALE}
      style={StyleSheet.flatten([resolved, style as TextStyle])}
      {...rest}
    />
  );
}
