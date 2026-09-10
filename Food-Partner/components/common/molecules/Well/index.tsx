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


/** The same frame, sunk into the ground rather than lifted off it. */
export function Well({
  children,
  style,
  tone,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  tone?: string;
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surfaceSunken, borderColor: colors.borderSubtle },
        tone ? { borderColor: tone } : null,
        style as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A tinted notice — the one way of saying something that is not a row of
 * content. Always a glyph and a word, never colour alone.
 */
