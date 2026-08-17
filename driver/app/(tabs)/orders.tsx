import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, Seg } from "@/components/ui";
import { ORDERS, ORDERS_TABS } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, space } from "@/theme";

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { ordersTab, setOrdersTab } = useFlowStore();
  const list = ORDERS[ordersTab];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + ms(8) }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Orders</Text>
      <Text style={styles.sub}>248 deliveries · 96% completion rate</Text>

      <Seg
        options={ORDERS_TABS}
        value={ordersTab}
        onChange={setOrdersTab}
        style={{ marginTop: ms(16) }}
      />

      <View style={{ marginTop: ms(14), gap: ms(10) }}>
        {list.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => router.push("/order-detail")}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.cardHead}>
              <Text style={styles.rest}>{o.rest}</Text>
              <Text style={styles.earn}>{o.earn}</Text>
            </View>
            <View style={styles.cardMeta}>
              <Text style={styles.metaText} numberOfLines={1}>
                {o.when} · {o.id} · {o.dist}
              </Text>
              <Chip label={o.status} tone={o.tone} />
            </View>
          </Pressable>
        ))}
      </View>

      {list.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing here</Text>
          <Text style={styles.emptyBody}>
            You have no {ordersTab.toLowerCase()} orders. Go online to pick up your next delivery.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: ms(26) },
  title: { ...font.headingBold, fontSize: ms(30), lineHeight: ms(33), color: colors.text },
  sub: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.neutral700,
    marginTop: ms(4),
  },
  card: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    padding: ms(14),
    backgroundColor: colors.neutral100,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: ms(10),
  },
  rest: { ...font.heading, fontSize: ms(17), lineHeight: ms(20), color: colors.text, flex: 1 },
  earn: {
    ...font.heading,
    fontSize: ms(17),
    lineHeight: ms(19),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  cardMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: ms(8),
    gap: ms(8),
  },
  metaText: {
    ...font.body,
    fontSize: ms(12),
    lineHeight: ms(16),
    color: colors.neutral700,
    fontVariant: ["tabular-nums"],
    flex: 1,
  },
  empty: {
    marginTop: ms(34),
    alignItems: "center",
    paddingVertical: ms(30),
    paddingHorizontal: ms(10),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.neutral400,
    borderRadius: radius.lg,
  },
  emptyTitle: { ...font.heading, fontSize: ms(20), lineHeight: ms(24), color: colors.text },
  emptyBody: {
    ...font.body,
    fontSize: ms(13),
    lineHeight: ms(19),
    color: colors.neutral700,
    marginTop: ms(6),
    textAlign: "center",
  },
});
