/* Shared helpers and the stylesheet, lifted verbatim out of components/ui/primitives.tsx when it was
   split into one folder per component. Contents unchanged. */
import { pill } from "@/components/common/utils/sharedStyles";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextStyle,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { colors, elevation, radius, space, tone as resolveTone, touch, type ToneName } from "@/theme";
import { Icon, type IconName } from "@/components/common/atoms/Icon";
import { Text } from "@/components/common/atoms/Text";


// ─── Buttons ──────────────────────────────────────────────────────────────────

export type BtnVariant = "ink" | "ghost" | "accent" | "quiet" | "danger";

/**
 * `ink` keeps its name and loses its colour: the primary action is the brand
 * green with a NEAR-BLACK label, because white on this green measures 3.26:1
 * and a 13pt semibold label is not large text. That is also why the pressed
 * state goes lighter — darkening it would squeeze the label that has to stay
 * readable under a thumb.
 */


/**
 * `ink` keeps its name and loses its colour: the primary action is the brand
 * green with a NEAR-BLACK label, because white on this green measures 3.26:1
 * and a 13pt semibold label is not large text. That is also why the pressed
 * state goes lighter — darkening it would squeeze the label that has to stay
 * readable under a thumb.
 */
export const BTN: Record<BtnVariant, { bg: string; bgPressed: string; fg: string; border?: string; height: number }> = {
  ink: { bg: colors.brand, bgPressed: colors.brandPressed, fg: colors.onBrand, height: touch.primaryCta },
  ghost: {
    bg: colors.surface,
    bgPressed: colors.surfaceSunken,
    fg: colors.textPrimary,
    border: colors.border,
    height: touch.min,
  },
  accent: {
    bg: colors.brandTint,
    bgPressed: colors.brandOnDark,
    fg: colors.brandInk,
    border: colors.brandOnDark,
    height: touch.min,
  },
  quiet: {
    bg: "transparent",
    bgPressed: colors.surfaceSunken,
    fg: colors.textSecondary,
    border: colors.border,
    height: touch.min,
  },
  danger: {
    bg: colors.danger.tint,
    bgPressed: colors.danger.border,
    fg: colors.danger.ink,
    border: colors.danger.border,
    height: touch.min,
  },
};


// ─── Styles ───────────────────────────────────────────────────────────────────

export const styles = StyleSheet.create({
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: space[2] },

  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
  },
  notice: {
    flexDirection: "row",
    gap: space[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: space[3],
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    paddingVertical: space[3],
  },
  dataRowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },

  btn: {
    width: "100%",
    flexDirection: "row",
    gap: space[2],
    borderRadius: radius.button,
    paddingHorizontal: space[4],
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
  iconBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.button,
    alignItems: "center",
    justifyContent: "center",
  },

  chip: pill,
  choiceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.chip,
    paddingHorizontal: space[3],
    minHeight: 38,
    justifyContent: "center",
  },

  seg: {
    flexDirection: "row",
    gap: space[1],
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.button,
    padding: space[1],
  },
  segOpt: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    borderRadius: radius.chip,
    paddingVertical: space[2],
    paddingHorizontal: space[1],
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
  },

  track: {
    width: 48,
    height: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    padding: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  knob: { width: 20, height: 20, borderRadius: radius.pill },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderInput,
    borderRadius: radius.button,
    paddingHorizontal: space[1],
    minHeight: touch.min,
  },
  /* An invisible sibling that owns the long-press, so the tap target and the
     repeat target do not fight over the same gesture. */
  stepperHold: { position: "absolute", width: 0, height: 0 },
  stepperValue: { flex: 1, alignItems: "center" },

  avatar: {
    backgroundColor: colors.brandTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    alignItems: "center",
    justifyContent: "center",
  },
});
