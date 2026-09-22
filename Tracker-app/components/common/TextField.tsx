import React, { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { colors, radius, space } from "@/theme";
import { Text } from "./Text";

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: space[1] }}>
      <Text variant="label" color="secondary">
        {label.toUpperCase()}
      </Text>
      {children}
      {!!error && (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      )}
    </View>
  );
}

export function TextField({
  style,
  right,
  ...rest
}: TextInputProps & { style?: ViewStyle; right?: React.ReactNode }) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.wrap,
        { borderColor: focused ? colors.brand : colors.borderInput },
        style,
      ]}
    >
      <TextInput
        {...rest}
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
      />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: 1.5,
    borderRadius: radius.button,
    paddingHorizontal: space[4],
    height: 52,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontSize: 16, color: colors.textPrimary, height: "100%" },
});
