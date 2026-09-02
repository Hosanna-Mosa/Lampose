/**
 * The crosshair that fills an address from where you are standing.
 *
 * One component, used by both screens that collect an address — the sign-up
 * form and the profile — so the gesture, the wording and the failure copy are
 * the same in both. Two copies of this is two places the permission message
 * drifts.
 *
 * Placed ABOVE a group of fields rather than beside one of them, because it
 * fills several: attaching it to "Where you live" would say it fills only
 * that.
 *
 * A word beside the glyph, always. This app's rule is that nothing is labelled
 * by icon alone — a crosshair on its own is a control somebody has to press to
 * find out what it does.
 */
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { colors, radius, space } from "@/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";

export function LocateButton({
  busy,
  onPress,
  label = "Use my current location",
  busyLabel = "Finding you…",
}: {
  busy?: boolean;
  onPress: () => void;
  label?: string;
  busyLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        pressed && !busy ? { opacity: 0.85 } : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.brandInk} />
      ) : (
        <Icon name="navigate" size={18} color={colors.brandInk} />
      )}
      <Text variant="bodyStrong" color="brand">
        {busy ? busyLabel : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.brandTint,
    borderRadius: radius.button,
    height: 52,
    paddingHorizontal: space[4],
  },
});
