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
import { BTN, BtnVariant, styles } from "@/components/common/utils/primitiveStyles";


export function Btn({
  label,
  onPress,
  variant = "ink",
  large,
  disabled,
  loading,
  glyph,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  large?: boolean;
  disabled?: boolean;
  loading?: boolean;
  glyph?: IconName;
  style?: ViewStyle | ViewStyle[];
}) {
  const v = BTN[variant];
  const inert = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      onPress={inert ? undefined : onPress}
      disabled={inert}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: pressed && !inert ? v.bgPressed : v.bg,
          borderColor: v.border ?? "transparent",
          borderWidth: v.border ? StyleSheet.hairlineWidth : 0,
          minHeight: large ? 60 : v.height,
        },
        inert && styles.disabled,
        style as ViewStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <>
          {glyph ? <Icon name={glyph} size={18} color={v.fg} /> : null}
          <Text variant={large ? "display2" : "title2"} style={{ color: v.fg }} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * A square icon button: 36pt visually, 44pt to a thumb. The visual size is a
 * layout decision and the touch target is not negotiable, so `hitSlop` makes
 * up the difference rather than the box growing.
 */
