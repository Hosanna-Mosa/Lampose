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


export function Dot({ tone = colors.textTertiary, size = 8 }: { tone?: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: tone }} />;
}

// ─── Segmented control ────────────────────────────────────────────────────────

/**
 * A sunken track with a white pill on the selection. Filling the selection
 * with ink instead would make a three-option picker look like three primary
 * buttons with two switched off.
 */
