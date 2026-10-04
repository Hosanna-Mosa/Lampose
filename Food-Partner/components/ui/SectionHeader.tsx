import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

import { font, size, ui } from "@/theme/ui";
import { Txt } from "./Txt";

interface Props {
  title: string;
  /** Muted text on the right, e.g. "4 items". */
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** The small uppercase section label, with an optional link or count. */
export function SectionHeader({ title, meta, actionLabel, onAction, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <Txt style={styles.title} accessibilityRole="header">
        {title}
      </Txt>
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.action} onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Txt style={styles.actionText}>{actionLabel}</Txt>
          <Ionicons name="chevron-forward" size={14} color={ui.brandInk} />
        </TouchableOpacity>
      ) : meta ? (
        <Txt style={styles.meta}>{meta}</Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  title: {
    flexShrink: 1,
    fontFamily: font.body.bold,
    fontSize: size.small,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: ui.muted,
  },
  meta: { fontFamily: font.body.semibold, fontSize: size.small, color: ui.muted },
  action: { flexDirection: "row", alignItems: "center", gap: 2 },
  actionText: { fontFamily: font.body.semibold, fontSize: size.medium, color: ui.brandInk },
});
