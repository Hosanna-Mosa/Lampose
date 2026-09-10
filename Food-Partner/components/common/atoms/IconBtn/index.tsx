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


/**
 * A square icon button: 36pt visually, 44pt to a thumb. The visual size is a
 * layout decision and the touch target is not negotiable, so `hitSlop` makes
 * up the difference rather than the box growing.
 */
export function IconBtn({
  children,
  glyph,
  onPress,
  size = touch.iconButtonVisual,
  tone = colors.border,
  fg = colors.textPrimary,
  bg = colors.surface,
  accessibilityLabel,
  style,
}: {
  children?: React.ReactNode;
  glyph?: IconName;
  onPress?: () => void;
  size?: number;
  tone?: string;
  fg?: string;
  bg?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={touch.iconButtonHitSlop}
      style={({ pressed }) => [
        styles.iconBtn,
        { width: size, height: size, borderColor: tone, backgroundColor: pressed ? colors.surfaceSunken : bg },
        style,
      ]}
    >
      {glyph ? <Icon name={glyph} size={Math.round(size * 0.52)} color={fg} /> : children}
    </Pressable>
  );
}

// ─── Chips ────────────────────────────────────────────────────────────────────

/** A STATUS chip: tint fill, ink label, hairline in the same family. Not tappable. */
