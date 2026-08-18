import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Chip, Icon, Seg, Text, TopBar } from "@/components/ui";
import { ORDERS, ORDERS_TABS } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

export default function OrdersScreen() {
  const { ordersTab, setOrdersTab } = useFlowStore();
  const list = ORDERS[ordersTab];

  return (
    <View style={styles.root}>
      <TopBar title="Orders" subtitle="248 deliveries · 96% completion rate" />

      {/*
        The period switch sits between the fixed bar and the scroller, so it
        is fixed too. Scrolling to the bottom of "Completed" and then having
        to scroll back up to reach "Cancelled" is the whole reason a segmented
        control gets pinned.
      */}
      <View style={styles.segWrap}>
        <Seg options={ORDERS_TABS} value={ordersTab} onChange={setOrdersTab} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={{ gap: space[2] }}>
          {list.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => router.push("/order-detail")}
              accessibilityRole="button"
              accessibilityLabel={`${o.rest}, ${o.status}, ${o.earn}`}
              style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceSunken }]}
            >
              <View style={styles.cardHead}>
                <Text variant="title2" style={{ flex: 1 }} numberOfLines={1}>
                  {o.rest}
                </Text>
                <Text variant="priceLg">{o.earn}</Text>
              </View>

              <Text variant="numMeta" color="tertiary" numberOfLines={1}>
                {o.when} · {o.id} · {o.dist}
              </Text>

              <View style={styles.cardFoot}>
                <Chip label={o.status} tone={o.tone} />
                <Icon name="chevronRight" size={16} color={colors.textTertiary} />
              </View>
            </Pressable>
          ))}
        </View>

        {list.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyGlyph}>
              <Icon name="orders" size={22} color={colors.textTertiary} />
            </View>
            <Text variant="title1">Nothing here</Text>
            <Text variant="body" color="tertiary" style={{ textAlign: "center" }}>
              You have no {ordersTab.toLowerCase()} orders. Go online to pick up your next delivery.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  segWrap: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    paddingBottom: space[3],
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  content: { paddingHorizontal: layout.gutter, paddingTop: space[4], paddingBottom: space[6], gap: space[4] },

  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
    gap: space[1],
    backgroundColor: colors.surface,
  },
  cardHead: { flexDirection: "row", alignItems: "baseline", gap: space[3] },
  cardFoot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: space[2],
    gap: space[2],
  },

  empty: {
    marginTop: space[5],
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[8],
    paddingHorizontal: space[4],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  emptyGlyph: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[1],
  },
});
