import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { font, line, ms, size, ui } from "@/theme/ui";
import { Button } from "./Button";
import { fadeInUp } from "./motion";
import { Txt } from "./Txt";

interface Props {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  /** Draws the action as the primary (green) button rather than an outline. */
  primaryAction?: boolean;
  /** Tighter padding for use inside a card. */
  compact?: boolean;
}

/** Icon + title + subtitle + optional action. */
export function EmptyState({
  title,
  subtitle,
  icon = "file-tray-outline",
  actionLabel,
  onAction,
  primaryAction,
  compact,
}: Props) {
  return (
    <Animated.View entering={fadeInUp(0)} style={[styles.wrap, compact && styles.compact]}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={ms(30)} color={ui.muted} />
      </View>
      <Txt style={styles.title}>{title}</Txt>
      {subtitle ? <Txt style={styles.subtitle}>{subtitle}</Txt> : null}
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          onPress={onAction}
          variant={primaryAction ? "primary" : "secondary"}
          size="sm"
          style={styles.action}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: ms(48),
    paddingHorizontal: ms(32),
    gap: 6,
  },
  compact: { paddingVertical: ms(24), paddingHorizontal: ms(16) },
  iconCircle: {
    width: ms(68),
    height: ms(68),
    borderRadius: ms(34),
    backgroundColor: ui.sunken,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: { fontFamily: font.heading.semibold, fontSize: size.large, color: ui.text, textAlign: "center" },
  subtitle: {
    fontFamily: font.body.regular,
    fontSize: size.medium,
    lineHeight: line.medium,
    color: ui.sec,
    textAlign: "center",
  },
  action: { marginTop: 12 },
});
