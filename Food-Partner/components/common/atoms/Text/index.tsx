import React from "react";
import { Text as RNText, StyleSheet, type TextProps as RNTextProps, type TextStyle } from "react-native";

import { MAX_FONT_SCALE, colors, resolveFontFamily, type TypeVariant, type } from "@/theme";

/**
 * The one typography component. Every string a partner reads goes through it.
 *
 * Ported unchanged from the rider app, because the two apps share a type scale
 * and a scale only holds if there is exactly one component allowed to read it.
 * Screens name a variant; there is no size, weight, family or letter-spacing
 * prop, and that absence is the point — it is what stops twenty-odd screens of
 * a long onboarding form drifting into twenty-odd sizes of "small grey label".
 *
 * It also carries the two things that are easiest to forget per-call and most
 * expensive to miss: the single cap on OS font scaling (one cap for all three
 * faces, so the scale survives an accessibility setting rather than inverting
 * at the top of it), and tabular figures on every numeric variant, so an
 * edited price never shifts the menu row around it.
 */

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

  /* Fixed-width codes — the application id, an OTP — opt out of scaling
     entirely rather than reflowing; everything else is capped, not frozen. */
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
