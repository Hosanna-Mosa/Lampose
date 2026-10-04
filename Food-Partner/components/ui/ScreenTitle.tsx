import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

import { font, line, size, ui } from "@/theme/ui";
import { fadeInDown } from "./motion";
import { Txt } from "./Txt";

interface Props {
  title: string;
  subtitle?: string;
  /** Trailing action, e.g. an "Add dish" button. */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** The large page heading at the top of a tab screen (Orders, Menu, Profile…). */
export function ScreenTitle({ title, subtitle, right, style }: Props) {
  return (
    <Animated.View entering={fadeInDown(0)} style={[styles.row, style]}>
      <View style={styles.texts}>
        <Txt style={styles.title} accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? <Txt style={styles.subtitle}>{subtitle}</Txt> : null}
      </View>
      {right}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  texts: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: font.heading.bold,
    fontSize: size.extraLarge,
    lineHeight: line.extraLarge,
    letterSpacing: -0.4,
    color: ui.text,
  },
  subtitle: {
    fontFamily: font.body.medium,
    fontSize: size.medium,
    lineHeight: line.medium,
    color: ui.sec,
    marginTop: 4,
  },
});
