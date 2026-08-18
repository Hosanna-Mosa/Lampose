import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, layout, space, touch } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

/** The bar's content row, above the safe-area inset. */
export const HEADER_HEIGHT = 56;

/**
 * The sticky screen header.
 *
 * Two things make it sticky rather than merely first: it owns the top
 * safe-area inset itself, and it is always mounted as a SIBLING of the
 * screen's scroller rather than inside it. A screen that puts this in its
 * `ScrollView` gets a header that scrolls away, which is the bug this
 * component exists to make impossible — nothing here reads a scroll offset,
 * so there is no way to "sticky" it after the fact.
 *
 * It paints `surface` and carries a hairline underneath, because a header the
 * same colour as the ground behind it does not read as fixed — content just
 * appears to vanish at an arbitrary line.
 *
 * The title is LEFT-aligned, never centred. A centred title has to share the
 * row with a back control and an action, so it truncates at about half the
 * width — and this app's titles are restaurant names and order ids, which are
 * exactly the strings that cannot lose their ends.
 */
export function TopBar({
  back = null,
  onBack,
  title,
  subtitle,
  action,
  onAction,
  actionGlyph,
  left,
  right,
  style,
}: {
  /**
   * Where back goes, as a destination name. Shown only to screen readers —
   * the control itself is a chevron, so the row keeps its width for the title.
   * `null` hides the control.
   */
  back?: string | null;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  /** A text action. Mutually exclusive with `actionGlyph` — the right side gets one job. */
  action?: string;
  onAction?: () => void;
  actionGlyph?: IconName;
  /** Replaces the back control and title, for headers that carry an identity. */
  left?: React.ReactNode;
  /** Replaces the action, for anything that is not one button. */
  right?: React.ReactNode;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));
  const showBack = back !== null;

  return (
    <View style={[styles.bar, { paddingTop: insets.top }, style]}>
      <View style={[styles.content, { paddingLeft: showBack ? space[1] : layout.gutter }]}>
        {showBack && (
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={back ? `Back to ${back}` : "Back"}
            hitSlop={touch.iconButtonHitSlop}
            style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.surfaceSunken }]}
          >
            <Icon name="chevronLeft" size={20} color={colors.textPrimary} />
          </Pressable>
        )}

        {left ?? (
          <View style={[styles.titleBlock, { paddingHorizontal: showBack ? space[1] : 0 }]}>
            {!!title && (
              <Text variant="title2" numberOfLines={1}>
                {title}
              </Text>
            )}
            {!!subtitle && (
              <Text variant="numMeta" color="tertiary" numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        )}

        {right ??
          (action && onAction ? (
            <Pressable
              onPress={onAction}
              accessibilityRole="button"
              accessibilityLabel={action}
              hitSlop={4}
              style={styles.textAction}
            >
              <Text variant="bodyStrong" color="brand">
                {action}
              </Text>
            </Pressable>
          ) : actionGlyph && onAction ? (
            <Pressable
              onPress={onAction}
              accessibilityRole="button"
              hitSlop={touch.iconButtonHitSlop}
              style={({ pressed }) => [styles.glyphAction, pressed && { backgroundColor: colors.surfaceSunken }]}
            >
              <Icon name={actionGlyph} size={20} color={colors.textPrimary} />
            </Pressable>
          ) : null)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  content: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: space[2],
  },
  backBtn: {
    width: touch.min,
    height: touch.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  titleBlock: { flex: 1, minWidth: 0, gap: 1 },
  textAction: { minHeight: touch.min, justifyContent: "center", paddingHorizontal: space[2] },
  glyphAction: {
    width: touch.min,
    height: touch.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
});
