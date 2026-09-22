import React from "react";
import { Text as RNText, type TextProps } from "react-native";
import { colors } from "@/theme";

export type TextVariant = "display" | "title" | "body" | "bodyStrong" | "caption" | "label";
export type TextColor = "primary" | "secondary" | "tertiary" | "brand" | "danger" | "onBrand";

const VARIANT: Record<TextVariant, { fontSize: number; fontWeight: "400" | "600" | "700" | "800" }> = {
  display: { fontSize: 28, fontWeight: "800" },
  title: { fontSize: 18, fontWeight: "700" },
  body: { fontSize: 15, fontWeight: "400" },
  bodyStrong: { fontSize: 15, fontWeight: "600" },
  caption: { fontSize: 13, fontWeight: "400" },
  label: { fontSize: 12, fontWeight: "600" },
};

const COLOR: Record<TextColor, string> = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  brand: colors.brand,
  danger: colors.danger,
  onBrand: colors.onBrand,
};

export function Text({
  variant = "body",
  color = "primary",
  style,
  ...rest
}: TextProps & { variant?: TextVariant; color?: TextColor }) {
  return <RNText style={[VARIANT[variant], { color: COLOR[color] }, style]} {...rest} />;
}
