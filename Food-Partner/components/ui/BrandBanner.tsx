import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

import { elevation, font, ms, radius, size, ui } from "@/theme/ui";
import { Txt } from "./Txt";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  /** A white pill on the right ("View"); without it a chevron is shown. */
  actionLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The Adios call-to-action card (orders waiting, a new order in), on a solid
 * Lampose-green fill with the theme's near-black ink.
 */
export function BrandBanner({ icon, title, subtitle, onPress, actionLabel, style }: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.card, style]}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={ms(21)} color={ui.onBrand} />
      </View>
      <View style={styles.texts}>
        <Txt style={styles.title}>{title}</Txt>
        {subtitle ? (
          <Txt style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {actionLabel ? (
        <Txt style={styles.action}>{actionLabel}</Txt>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={ui.onBrand} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: ui.brand,
    ...elevation.md,
  },
  iconCircle: {
    width: ms(42),
    height: ms(42),
    borderRadius: ms(21),
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  texts: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.body.bold, fontSize: size.large, color: ui.onBrand },
  subtitle: { fontFamily: font.body.medium, fontSize: size.small, color: ui.onBrand, opacity: 0.85, marginTop: 2 },
  action: {
    fontFamily: font.body.bold,
    fontSize: size.small,
    color: ui.brandInk,
    backgroundColor: ui.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
});
