import React from "react";
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

import { elevation, radius, ui } from "@/theme/ui";

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevationLevel?: "none" | "sm" | "md" | "lg";
  padding?: number;
  bordered?: boolean;
  /** Makes the whole card a button. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Dashed border — a dimmed state such as "out of stock". */
  dashed?: boolean;
}

/** The white surface container, with the shared radius and elevation. */
export function Card({
  children,
  style,
  elevationLevel = "sm",
  padding = 16,
  bordered = false,
  onPress,
  accessibilityLabel,
  dashed,
}: Props) {
  const frame = [
    styles.base,
    { padding },
    elevationLevel !== "none" && elevation[elevationLevel],
    (bordered || dashed) && styles.bordered,
    dashed && styles.dashed,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={frame}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={frame}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { backgroundColor: ui.surface, borderRadius: radius.lg },
  bordered: { borderWidth: 1, borderColor: ui.border },
  dashed: { borderStyle: "dashed", borderColor: ui.borderStrong },
});
