import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { font, ms, radius, size, toneColors, ui, type UiTone } from "@/theme/ui";
import { Txt } from "./Txt";

type IconName = keyof typeof Ionicons.glyphMap;

interface BadgeProps {
  label: string;
  tone?: UiTone;
  icon?: IconName;
  /** A small dot before the label — used for live statuses. */
  dot?: boolean;
  /** Makes the badge tappable (the home screen's OPEN NOW pill). */
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** A small status pill: tinted fill, ink label, uppercase. */
export function Badge({ label, tone = "neutral", icon, dot, onPress, accessibilityLabel }: BadgeProps) {
  const colors = toneColors[tone];
  const body = (
    <>
      {dot ? <View style={[styles.dot, { backgroundColor: colors.fg }]} /> : null}
      {icon ? <Ionicons name={icon} size={ms(12)} color={colors.fg} /> : null}
      <Txt style={[styles.badgeLabel, { color: colors.fg }]} numberOfLines={1}>
        {label}
      </Txt>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        hitSlop={8}
        style={[styles.badge, { backgroundColor: colors.bg }]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.badge, { backgroundColor: colors.bg }]}>{body}</View>;
}

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  /** A count shown after the label, e.g. orders waiting. Hidden at 0. */
  count?: number;
  /** Colour of the selected state. Defaults to the brand fill. */
  accent?: { accent: string; on: string };
  disabled?: boolean;
}

/** An interactive filter / choice chip. */
export function Chip({ label, selected = false, onPress, icon, count, accent, disabled }: ChipProps) {
  const fill = accent?.accent ?? ui.brand;
  const onFill = accent?.on ?? ui.onBrand;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={count ? `${label}, ${count}` : label}
      style={[styles.chip, selected && { backgroundColor: fill, borderColor: fill }, disabled && styles.disabled]}
    >
      {icon}
      <Txt style={[styles.chipLabel, selected && { color: onFill }]}>{label}</Txt>
      {count ? (
        <View style={[styles.count, selected && { backgroundColor: onFill }]}>
          <Txt style={[styles.countText, selected && { color: fill }]}>{count > 99 ? "99+" : count}</Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: ms(8),
    paddingVertical: ms(4),
    maxWidth: "100%",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeLabel: {
    fontFamily: font.body.bold,
    fontSize: size.small,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: radius.pill,
    paddingHorizontal: ms(14),
    minHeight: ms(36),
  },
  chipLabel: { fontFamily: font.body.semibold, fontSize: size.medium, color: ui.text },
  count: {
    minWidth: ms(20),
    height: ms(20),
    borderRadius: ms(10),
    paddingHorizontal: 5,
    backgroundColor: ui.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontFamily: font.body.bold, fontSize: size.small, color: ui.onBrand },
  disabled: { opacity: 0.5 },
});
