import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatCard } from "@/app/(tabs)/index";
import { Avatar, Btn, Chip, Sheet, Toast } from "@/components/ui";
import { DRIVER, PROFILE_ROWS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, space } from "@/theme";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { toast, setOverlay } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + ms(8) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Avatar name={DRIVER.name} size={ms(66)} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{DRIVER.name}</Text>
            <Text style={styles.meta}>Partner ID {DRIVER.partnerId} · since Mar 2024</Text>
            <Chip label="Verified partner" tone={colors.ok} style={{ marginTop: ms(7) }} />
          </View>
        </View>

        <View style={styles.statGrid}>
          <StatCard label="Rating" value="4.8 ★" />
          <StatCard label="Deliveries" value="248" />
          <StatCard label="Accept rate" value="94%" />
        </View>

        <View style={{ marginTop: ms(20) }}>
          {PROFILE_ROWS.map((row) => (
            <Pressable
              key={row.t}
              onPress={() => router.push(row.route as never)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.rowLabel, row.tone ? { color: row.tone } : null]}>{row.t}</Text>
              <View style={styles.rowRight}>
                {!!row.meta && (
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {row.meta}
                  </Text>
                )}
                <Text style={styles.chevron}>›</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Btn
          label="Log out"
          variant="danger"
          onPress={() => setOverlay("logout")}
          style={{ marginTop: ms(20) }}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + ms(8)} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: ms(26) },
  head: { flexDirection: "row", gap: ms(14), alignItems: "center" },
  name: { ...font.headingBold, fontSize: ms(25), lineHeight: ms(28), color: colors.text },
  meta: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.neutral700,
    marginTop: ms(3),
    fontVariant: ["tabular-nums"],
  },
  statGrid: { flexDirection: "row", gap: ms(9), marginTop: ms(18) },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: ms(12),
    paddingVertical: ms(15),
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLabel: { ...font.body, fontSize: ms(14.5), color: colors.text, flex: 1 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: ms(9), maxWidth: "55%" },
  rowMeta: {
    ...font.body,
    fontSize: ms(12),
    color: colors.neutral600,
    flexShrink: 1,
  },
  chevron: { color: colors.accent, ...font.body, fontSize: ms(15) },
});
