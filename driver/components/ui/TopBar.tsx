import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, font, ms, space, typography as t } from "@/theme";
import { Icon } from "./Icon";

/**
 * In-screen top bar: a back affordance on the left, a tracked kicker in the
 * middle, and an optional text action on the right. Matches the pattern used
 * by every section and the active-order screen.
 */
export function TopBar({
  back = "Back",
  onBack,
  center,
  action,
  onAction,
  style,
}: {
  /** Label beside the chevron. Pass null to hide the back control. */
  back?: string | null;
  onBack?: () => void;
  center?: string;
  action?: string;
  onAction?: () => void;
  style?: ViewStyle;
}) {
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));

  return (
    <View style={[styles.bar, style]}>
      <View style={styles.side}>
        {back !== null && (
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={back || "Back"}
            hitSlop={8}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          >
            <Icon name="chevronLeft" size={ms(17)} color={colors.neutral700} strokeWidth={1.6} />
            {!!back && <Text style={styles.backLabel}>{back}</Text>}
          </Pressable>
        )}
      </View>

      {!!center && (
        <Text style={[t.kicker, styles.center]} numberOfLines={1}>
          {center}
        </Text>
      )}

      <View style={[styles.side, styles.sideRight]}>
        {!!action && (
          <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
            <Text style={styles.action}>{action}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Big screen title with an optional supporting line. */
export function ScreenTitle({
  title,
  sub,
  style,
}: {
  title: string;
  sub?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ gap: ms(5) }, style]}>
      <Text style={styles.screenTitle}>{title}</Text>
      {!!sub && <Text style={styles.screenSub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[2],
    paddingHorizontal: space[4],
    paddingTop: ms(4),
    paddingBottom: space[3],
  },
  side: { minWidth: ms(64), flexShrink: 0 },
  sideRight: { alignItems: "flex-end" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: ms(6) },
  backLabel: {
    ...font.body,
    fontSize: ms(13),
    color: colors.neutral700,
  },
  center: {
    flex: 1,
    textAlign: "center",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  action: {
    ...font.body,
    fontSize: ms(13),
    color: colors.accent700,
  },
  screenTitle: {
    ...font.headingBold,
    fontSize: ms(27),
    lineHeight: ms(31),
    letterSpacing: -0.3,
    color: colors.text,
  },
  screenSub: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.neutral700,
  },
});
