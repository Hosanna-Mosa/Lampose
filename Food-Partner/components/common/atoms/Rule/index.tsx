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


// ─── Rules & headings ─────────────────────────────────────────────────────────

export function Rule({ style, subtle }: { style?: ViewStyle; subtle?: boolean }) {
  return (
    <View
      style={[
        { height: StyleSheet.hairlineWidth, backgroundColor: subtle ? colors.borderSubtle : colors.border },
        style,
      ]}
    />
  );
}
