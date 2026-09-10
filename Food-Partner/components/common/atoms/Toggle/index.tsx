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
import { styles } from "@/components/common/utils/primitiveStyles";


// ─── Toggle ───────────────────────────────────────────────────────────────────

export function Toggle({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={() => onChange(!value)}
      style={[
        styles.track,
        {
          backgroundColor: value ? colors.brand : colors.surfaceSunken,
          borderColor: value ? colors.brand : colors.border,
          justifyContent: value ? "flex-end" : "flex-start",
        },
      ]}
    >
      <View style={[styles.knob, { backgroundColor: value ? colors.onBrand : colors.surface }]} />
    </Pressable>
  );
}
