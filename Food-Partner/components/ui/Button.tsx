import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

import { font, ms, radius, size, ui } from "@/theme/ui";
import { usePressScale } from "./motion";
import { Txt } from "./Txt";

/** "link" is the same button drawn as brand-coloured text, for inline actions. */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: "md" | "sm";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Primary / secondary / ghost / danger / link, with a press-scale. Primary is
 * the Lampose green with near-black ink — the theme's measured pairing.
 */
export function Button({
  title,
  onPress,
  variant = "primary",
  size: sizeName = "md",
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  style,
  accessibilityLabel,
}: Props) {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale(0.97);
  const inert = disabled || loading;
  const small = sizeName === "sm";
  const ink =
    variant === "primary"
      ? ui.onBrand
      : variant === "danger"
        ? ui.white
        : variant === "link"
          ? ui.brandInk
          : ui.text;

  return (
    <AnimatedPressable
      onPress={inert ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      onPressIn={inert ? undefined : onPressIn}
      onPressOut={onPressOut}
      disabled={inert}
      style={[
        animatedStyle,
        styles.base,
        { height: small ? ms(40) : ms(52) },
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        variant === "danger" && styles.danger,
        variant === "link" && styles.link,
        fullWidth && styles.fullWidth,
        inert && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={variant === "primary" || variant === "danger" ? ink : ui.brandInk} />
        ) : (
          <>
            {icon}
            <Txt
              style={[
                styles.label,
                { fontSize: small ? size.medium : size.large, color: ink },
                variant === "link" && styles.labelLink,
              ]}
              numberOfLines={1}
            >
              {title}
            </Txt>
          </>
        )}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    backgroundColor: ui.brand,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: ms(20),
  },
  secondary: { backgroundColor: ui.surface, borderWidth: 1.5, borderColor: ui.border },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: ui.errorSolid },
  link: { backgroundColor: "transparent", height: undefined, paddingHorizontal: 0, paddingVertical: 4, alignSelf: "flex-start" },
  fullWidth: { width: "100%" },
  disabled: { opacity: 0.5 },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  label: { fontFamily: font.body.bold },
  labelLink: { fontFamily: font.body.semibold, fontSize: size.medium },
});
