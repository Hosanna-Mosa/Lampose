import React from "react";
import { StyleSheet, View } from "react-native";
import { colors, radius, space } from "@/theme";
import { Text } from "./Text";

/** A tinted banner — a failure or a confirmation, never colour alone would
    matter here if this app ever grows past one word plus a sentence. */
export function Note({ tone, children }: { tone: "bad" | "ok"; children: React.ReactNode }) {
  const bg = tone === "bad" ? colors.dangerTint : colors.brandTint;
  const fg = tone === "bad" ? colors.danger : colors.brand;

  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderColor: fg }]}>
      <Text variant="caption" style={{ color: fg }}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: radius.button,
    padding: space[3],
  },
});
