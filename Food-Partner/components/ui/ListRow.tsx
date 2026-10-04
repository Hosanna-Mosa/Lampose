import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

import { font, line, ms, radius, size, ui } from "@/theme/ui";
import { Txt } from "./Txt";

interface Props {
  label: string;
  description?: string;
  /** Ionicon shown in the leading tile. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Replaces the icon tile entirely, e.g. an avatar. */
  leading?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Icon tile colours. Default: neutral sunken tile. */
  iconColor?: string;
  iconBackground?: string;
  /** Replaces the chevron, e.g. a switch or a value. `null` hides it. */
  right?: React.ReactNode;
  /** Red label for destructive rows (Sign out). */
  destructive?: boolean;
  /** Standalone bordered card instead of a row inside a grouped card. */
  card?: boolean;
  /** The hairline under the row inside a grouped card. */
  divider?: boolean;
  /** Lets the description wrap past two lines. */
  descriptionLines?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Icon tile + label + description + chevron. Every tappable list row is this. */
export function ListRow({
  label,
  description,
  icon,
  leading,
  onPress,
  disabled,
  iconColor,
  iconBackground,
  right,
  destructive,
  card,
  divider,
  descriptionLines = 2,
  accessibilityLabel,
  style,
}: Props) {
  const fg = destructive ? ui.error : (iconColor ?? ui.sec);
  const bg = destructive ? ui.errorSkin : (iconBackground ?? ui.sunken);

  return (
    <TouchableOpacity
      style={[styles.row, card && styles.card, divider && styles.divider, style]}
      onPress={onPress}
      disabled={!onPress || disabled}
      activeOpacity={0.75}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {leading ??
        (icon ? (
          <View style={[styles.iconTile, { backgroundColor: bg }]}>
            <Ionicons name={icon} size={ms(18)} color={fg} />
          </View>
        ) : null)}
      <View style={styles.texts}>
        <Txt style={[styles.label, destructive && { color: ui.error }]} numberOfLines={2}>
          {label}
        </Txt>
        {description ? (
          <Txt style={styles.description} numberOfLines={descriptionLines}>
            {description}
          </Txt>
        ) : null}
      </View>
      {right !== undefined ? right : onPress ? <Ionicons name="chevron-forward" size={18} color={ui.muted} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: ms(62),
  },
  card: { backgroundColor: ui.surface, borderWidth: 1.5, borderColor: ui.border, borderRadius: radius.md },
  divider: { borderBottomWidth: 1, borderBottomColor: ui.border },
  iconTile: { width: ms(40), height: ms(40), borderRadius: 12, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, minWidth: 0 },
  label: { fontFamily: font.body.semibold, fontSize: size.medium, lineHeight: line.medium, color: ui.text },
  description: {
    fontFamily: font.body.medium,
    fontSize: size.small,
    lineHeight: line.small,
    color: ui.sec,
    marginTop: 2,
  },
});
