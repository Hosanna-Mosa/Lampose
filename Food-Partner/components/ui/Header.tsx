import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { font, ms, size, line, ui } from "@/theme/ui";
import { Txt } from "./Txt";

interface Props {
  title?: string;
  /** Small second line under the title — a reference, a count. */
  subtitle?: string;
  /** Draws the header as a surface bar with a bottom border (chat screens). */
  bar?: boolean;
  /** Omit to hide the back button. */
  onBack?: () => void;
  /** The back chip's glyph: a chevron, or a cross for a screen that closes. */
  backIcon?: "chevron-back" | "close";
  backLabel?: string;
  backDisabled?: boolean;
  /** Trailing action(s). */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * A pushed screen's header: a round surface back chip, a left-aligned title,
 * an optional action on the right. It pads itself below the status bar.
 */
export function Header({
  title,
  subtitle,
  bar,
  onBack,
  backIcon = "chevron-back",
  backLabel = "Go back",
  backDisabled,
  right,
  style,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.row, { paddingTop: insets.top + 8 }, bar && styles.bar, style]}>
      {onBack ? (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          disabled={backDisabled}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={4}
        >
          <Ionicons name={backIcon} size={ms(20)} color={ui.text} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.titleBlock}>
        {title ? (
          <Txt style={styles.title} numberOfLines={1}>
            {title}
          </Txt>
        ) : null}
        {subtitle ? (
          <Txt style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  bar: {
    backgroundColor: ui.surface,
    borderBottomWidth: 1,
    borderBottomColor: ui.border,
    paddingBottom: 14,
  },
  backBtn: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.body.semibold, fontSize: size.large, lineHeight: line.large, color: ui.text },
  subtitle: {
    fontFamily: font.body.medium,
    fontSize: size.small,
    lineHeight: line.small,
    color: ui.sec,
    marginTop: 2,
  },
});
