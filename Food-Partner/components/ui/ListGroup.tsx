import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

import { radius, ui } from "@/theme/ui";
import { fadeInUp } from "./motion";
import { SectionHeader } from "./SectionHeader";

interface Props {
  title?: string;
  children: React.ReactNode;
  /** Rows sit in one bordered card (settings style) instead of separate cards. */
  grouped?: boolean;
  /** Stagger delay for the entrance animation. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

/** A labelled section of ListRows — the Profile screen is built from these. */
export function ListGroup({ title, children, grouped = true, delay = 0, style }: Props) {
  return (
    <Animated.View entering={fadeInUp(delay)} style={[styles.section, style]}>
      {title ? <SectionHeader title={title} /> : null}
      <View style={grouped ? styles.group : styles.stack}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  group: {
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  stack: { gap: 10 },
});
