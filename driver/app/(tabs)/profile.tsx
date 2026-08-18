import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatCard } from "@/app/(tabs)/index";
import { Avatar, Btn, Chip, Icon, Sheet, Text, Toast, TopBar } from "@/components/ui";
import { DRIVER, PROFILE_ROWS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { toast, setOverlay } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <TopBar title="Profile" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Avatar name={DRIVER.name} size={64} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text variant="display2" numberOfLines={1}>
              {DRIVER.name}
            </Text>
            <Text variant="numMeta" color="tertiary" numberOfLines={1}>
              {DRIVER.partnerId} · since Mar 2024
            </Text>
            <Chip label="Verified partner" tone="success" glyph="shield" style={{ marginTop: space[1] }} />
          </View>
        </View>

        <View style={styles.statGrid}>
          <StatCard label="Rating" value="4.8 ★" />
          <StatCard label="Deliveries" value="248" />
          <StatCard label="Accept rate" value="94%" />
        </View>

        {/* The account list — one card, hairlines between rows. */}
        <View style={styles.list}>
          {PROFILE_ROWS.map((row, i) => {
            const ink = row.tone ? resolveTone(row.tone) : null;
            return (
              <Pressable
                key={row.t}
                onPress={() => router.push(row.route as never)}
                accessibilityRole="button"
                accessibilityLabel={row.meta ? `${row.t}, ${row.meta}` : row.t}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowDivided,
                  pressed && { backgroundColor: colors.surfaceSunken },
                ]}
              >
                <View
                  style={[
                    styles.rowGlyph,
                    { backgroundColor: ink ? ink.tint : colors.surfaceSunken },
                  ]}
                >
                  <Icon name={row.icon} size={17} color={ink ? ink.ink : colors.textSecondary} />
                </View>

                <Text
                  variant="bodyLg"
                  style={[{ flex: 1 }, ink ? { color: ink.ink } : null]}
                  numberOfLines={1}
                >
                  {row.t}
                </Text>

                {!!row.meta && (
                  <Text
                    variant="numMeta"
                    color={ink ? "inherit" : "tertiary"}
                    style={[{ flexShrink: 1, maxWidth: "42%" }, ink ? { color: ink.ink } : null]}
                    numberOfLines={1}
                  >
                    {row.meta}
                  </Text>
                )}
                <Icon name="chevronRight" size={15} color={colors.textTertiary} />
              </Pressable>
            );
          })}
        </View>

        <Btn label="Log out" variant="danger" glyph="logout" onPress={() => setOverlay("logout")} />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingTop: space[4], paddingBottom: space[6], gap: space[4] },

  head: { flexDirection: "row", gap: space[3], alignItems: "center" },
  statGrid: { flexDirection: "row", gap: space[2] },

  list: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[3],
  },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  rowGlyph: {
    width: 32,
    height: 32,
    borderRadius: radius.chip,
    alignItems: "center",
    justifyContent: "center",
  },
});
