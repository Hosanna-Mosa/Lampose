import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

import { font, ms, radius, size, ui } from "@/theme/ui";
import { Txt } from "./Txt";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** Icon colour and its tile background. Defaults to the brand pair. */
  color?: string;
  background?: string;
  /** Red count bubble in the corner. Hidden at 0. */
  badge?: number;
  /** Dashed brand outline — an "add something" tile. */
  dashed?: boolean;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A square shortcut tile: icon on top, label below. */
export function ActionTile({ icon, label, onPress, color, background, badge, dashed, loading, disabled, style }: Props) {
  const fg = color ?? ui.brandInk;
  const bg = background ?? ui.brandSkin;

  return (
    <TouchableOpacity
      style={[styles.tile, dashed && styles.dashed, style]}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          <View style={[styles.iconTile, { backgroundColor: dashed ? "transparent" : bg }]}>
            <Ionicons name={icon} size={ms(dashed ? 24 : 19)} color={fg} />
          </View>
          <Txt style={[styles.label, dashed && { color: fg, textAlign: "center" }]} numberOfLines={2}>
            {label}
          </Txt>
        </>
      )}
      {badge ? (
        <View style={styles.badge}>
          <Txt style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Txt>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: radius.md,
    padding: 14,
    gap: 10,
    minHeight: ms(104),
  },
  dashed: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: ms(104),
    height: ms(104),
    minHeight: undefined,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: ui.brand,
    backgroundColor: ui.brandSkin,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 8,
  },
  iconTile: { width: ms(38), height: ms(38), borderRadius: 12, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: font.body.semibold, fontSize: size.medium, color: ui.text },
  badge: {
    position: "absolute",
    top: 12,
    right: 12,
    minWidth: ms(22),
    height: ms(22),
    borderRadius: ms(11),
    paddingHorizontal: 6,
    backgroundColor: ui.errorSolid,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: font.body.bold, fontSize: size.small, color: ui.white },
});
