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


// ─── Surfaces ─────────────────────────────────────────────────────────────────

/**
 * A white card on the grey ground — this system's one container.
 *
 * Hairline border rather than a heavy shadow: on a grey ground a 1px edge
 * separates the card without making every list look like it is floating.
 */
export function Card({
  children,
  style,
  tone,
  raised,
  ...rest
}: Omit<ViewProps, "style"> & {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Overrides the hairline with a status colour (an expired licence, an error). */
  tone?: string;
  raised?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: raised ? colors.surfaceRaised : colors.surface },
        tone ? { borderColor: tone } : null,
        style as ViewStyle,
      ]}
      /* Passed through so a purely decorative card can hide itself from screen
         readers — the pitch screen's order ticket is one. */
      {...rest}
    >
      {children}
    </View>
  );
}

/** The same frame, sunk into the ground rather than lifted off it. */
