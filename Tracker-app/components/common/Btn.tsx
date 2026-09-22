import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from "react-native";
import { colors, radius, space, touch } from "@/theme";
import { Text } from "./Text";

export function Btn({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && { backgroundColor: colors.brand },
        variant === "danger" && { backgroundColor: colors.danger },
        variant === "ghost" && { backgroundColor: colors.surfaceSunken },
        isDisabled && { opacity: 0.5 },
        pressed && !isDisabled && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "ghost" ? colors.textPrimary : colors.onBrand} />
      ) : (
        <Text
          variant="bodyStrong"
          color={variant === "ghost" ? "primary" : "onBrand"}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.min,
    borderRadius: radius.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[5],
  },
});
