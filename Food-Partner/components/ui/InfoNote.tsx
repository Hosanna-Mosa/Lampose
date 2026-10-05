import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

import { font, line, radius, size, ui } from "@/theme/ui";
import { Txt } from "./Txt";

export type NoteTone = "info" | "warning" | "danger" | "success";

const TONES: Record<NoteTone, { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  info: { fg: ui.info, bg: ui.infoSkin, icon: "information-circle" },
  warning: { fg: ui.warning, bg: ui.warningSkin, icon: "time-outline" },
  danger: { fg: ui.error, bg: ui.errorSkin, icon: "alert-circle" },
  success: { fg: ui.success, bg: ui.successSkin, icon: "checkmark-circle" },
};

interface Props {
  text: React.ReactNode;
  /** Bold words before the text. */
  lead?: string;
  tone?: NoteTone;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Makes the whole note a button (drop the pin, clear the cancellations…). */
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A tinted explanatory note with an icon — errors, confirmations and the
 * notes a kitchen taps to act on. Status is carried by the icon and the words,
 * never by the tint alone.
 */
export function InfoNote({ text, lead, tone = "info", icon, onPress, disabled, style }: Props) {
  const t = TONES[tone];
  const body = (
    <>
      <Ionicons name={icon ?? t.icon} size={18} color={t.fg} />
      <Txt style={[styles.text, tone !== "info" && { color: t.fg }]}>
        {lead ? <Txt style={[styles.lead, { color: t.fg }]}>{lead} </Txt> : null}
        {text}
      </Txt>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={t.fg} /> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.note, { backgroundColor: t.bg }, style]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.note, { backgroundColor: t.bg }, style]}>{body}</View>;
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: radius.md, padding: 14 },
  text: {
    flex: 1,
    fontFamily: font.body.medium,
    fontSize: size.small,
    lineHeight: line.small,
    color: ui.sec,
  },
  lead: { fontFamily: font.body.bold, color: ui.text },
});
