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


// ─── Segmented control ────────────────────────────────────────────────────────

/**
 * A sunken track with a white pill on the selection. Filling the selection
 * with ink instead would make a three-option picker look like three primary
 * buttons with two switched off.
 */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  labels,
  style,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  /** Display text per option, when the stored value is not what to show. */
  labels?: Partial<Record<T, string>>;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.seg, style]}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt)}
            style={[
              styles.segOpt,
              active && { backgroundColor: colors.surface, borderColor: colors.border, ...elevation.raised },
            ]}
          >
            <Text variant="title3" color={active ? "primary" : "tertiary"} numberOfLines={1}>
              {labels?.[opt] ?? opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
