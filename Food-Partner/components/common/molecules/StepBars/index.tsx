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


/** The stepped rail the onboarding flow pins under its header. */
export function StepBars({
  total,
  current,
  height = 4,
  activeTone = colors.brand,
  style,
}: {
  total: number;
  /** Bars at index <= current are filled. */
  current: number;
  height?: number;
  activeTone?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ flexDirection: "row", gap: space[1] + 1 }, style]}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height,
            borderRadius: radius.pill,
            backgroundColor: i <= current ? activeTone : colors.surfaceSunken,
          }}
        />
      ))}
    </View>
  );
}

// ─── Numeric stepper ──────────────────────────────────────────────────────────

/**
 * A minus / value / plus row for the operations numbers — preparation time,
 * delivery radius, order minimums.
 *
 * Holding a button repeats rather than firing once: setting a 45-minute prep
 * time in five-minute steps is nine taps otherwise, on a form that already
 * has a hundred fields.
 */
