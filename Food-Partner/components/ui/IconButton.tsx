import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

import { ms, ui } from "@/theme/ui";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  /** Diameter before scaling. */
  size?: number;
  color?: string;
  background?: string;
  /** A small dot, e.g. an unread indicator. */
  dot?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A round icon-only button — the header back chip's shape, for any action. */
export function IconButton({ icon, onPress, accessibilityLabel, size = 40, color, background, dot, disabled, style }: Props) {
  const d = ms(size);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={Math.max(0, (44 - d) / 2)}
      style={[
        styles.base,
        {
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: background ?? ui.surface,
          borderColor: ui.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={d * 0.5} color={color ?? ui.text} />
      {dot ? <View style={styles.dot} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    backgroundColor: ui.errorSolid,
    borderColor: ui.surface,
  },
});
