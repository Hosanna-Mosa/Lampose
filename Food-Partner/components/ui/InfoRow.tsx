import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { font, line, size, ui } from "@/theme/ui";
import { Txt } from "./Txt";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  /** Bold primary line instead of secondary text. */
  strong?: boolean;
  /** Makes the row tappable and tints it. */
  onPress?: () => void;
  numberOfLines?: number;
}

/** One "icon + line of text" detail, as in an order's delivery block. */
export function InfoRow({ icon, text, strong, onPress, numberOfLines }: Props) {
  const content = (
    <>
      <Ionicons name={icon} size={16} color={onPress ? ui.brandInk : ui.muted} style={styles.icon} />
      <Txt style={[styles.text, strong && styles.strong, onPress && { color: ui.brandInk }]} numberOfLines={numberOfLines}>
        {text}
      </Txt>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button">
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  icon: { marginTop: 2 },
  text: { flex: 1, fontFamily: font.body.medium, fontSize: size.medium, lineHeight: line.medium, color: ui.sec },
  strong: { fontFamily: font.body.semibold, color: ui.text },
});
