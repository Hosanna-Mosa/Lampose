import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

import { elevation, font, line, ms, radius, size, toneColors, ui, type UiTone } from "@/theme/ui";
import { Txt } from "./Txt";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  /** Small line under the label. */
  hint?: string;
  tone?: UiTone;
  /** Colours the value itself in the tone, for a figure that needs attention. */
  toneValue?: boolean;
  /** Makes the card open somewhere; a chevron shows it. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** One figure on a dashboard: tinted icon tile, big value, label. */
export function StatCard({ icon, label, value, hint, tone = "brand", toneValue, onPress, style }: Props) {
  const colors = toneColors[tone];
  const body = (
    <>
      <View style={styles.topRow}>
        <View style={[styles.iconTile, { backgroundColor: colors.bg }]}>
          <Ionicons name={icon} size={ms(19)} color={colors.fg} />
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={16} color={ui.muted} /> : null}
      </View>
      <Txt style={[styles.value, toneValue && { color: colors.fg }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
      <Txt style={styles.label} numberOfLines={1}>
        {label}
      </Txt>
      {hint ? (
        <Txt style={styles.hint} numberOfLines={1}>
          {hint}
        </Txt>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.card, style]} accessible accessibilityLabel={`${label}: ${value}`}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: ui.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: ui.border,
    padding: ms(14),
    gap: 2,
    ...elevation.sm,
  },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 },
  iconTile: {
    width: ms(38),
    height: ms(38),
    borderRadius: radius.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontFamily: font.heading.bold,
    fontSize: size.extraLarge,
    lineHeight: line.extraLarge,
    color: ui.text,
  },
  label: { fontFamily: font.body.medium, fontSize: size.small, lineHeight: line.small, color: ui.sec },
  hint: { fontFamily: font.body.semibold, fontSize: size.small, lineHeight: line.small, color: ui.muted, marginTop: 2 },
});
