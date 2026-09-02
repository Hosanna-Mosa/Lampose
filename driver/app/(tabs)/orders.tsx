import { router } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Chip, Icon, Seg, Text, TopBar } from "@/components/ui";
import { ORDERS_TABS } from "@/constants/lampose";
import { restaurantLabel, useDriverStore, type OrderStatus } from "@/store/driverStore";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space, type ToneName } from "@/theme";

/** The words a rider reads, from the status the order actually carries. */
const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  placed: "Waiting on the kitchen",
  accepted: "Kitchen accepted",
  preparing: "Cooking",
  ready: "Ready to collect",
  picked_up: "With you",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const STATUS_TONE: Partial<Record<OrderStatus, ToneName>> = {
  placed: "warning",
  accepted: "info",
  preparing: "info",
  ready: "brand",
  picked_up: "brand",
  delivered: "success",
  rejected: "danger",
  cancelled: "muted",
};

/** "Today, 7:42 pm" — a date only once it is no longer today. */
function when(iso?: string): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const sameDay =
    at.getDate() === today.getDate() &&
    at.getMonth() === today.getMonth() &&
    at.getFullYear() === today.getFullYear();
  return sameDay ? `Today, ${time}` : `${at.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

/**
 * What this rider has carried.
 *
 * Real rows from `GET /api/v2/drivers/me/orders`, filtered into the three tabs
 * the design already had. There is no fixture behind an empty tab: a rider who
 * has not delivered anything sees the empty state, which is the truth, rather
 * than somebody else's history teaching them to trust a figure that is not
 * theirs.
 */
export default function OrdersScreen() {
  const { ordersTab, setOrdersTab } = useFlowStore();

  const history = useDriverStore((s) => s.history);
  const currentJob = useDriverStore((s) => s.currentJob);
  const loading = useDriverStore((s) => s.loadingHistory);
  const fetchHistory = useDriverStore((s) => s.fetchHistory);

  useEffect(() => {
    fetchHistory().catch(() => {});
  }, [fetchHistory]);

  /* The job in hand is not in `history` yet — it is not finished — so it is
     prepended for the Active tab. Without this the one order a rider most
     wants to find here is the one order missing from it. */
  const rows = useMemo(() => {
    const all = currentJob
      ? [currentJob, ...history.filter((j) => j.orderNumber !== currentJob.orderNumber)]
      : history;

    if (ordersTab === "Completed") return all.filter((j) => j.status === "delivered");
    if (ordersTab === "Cancelled") {
      return all.filter((j) => j.status === "cancelled" || j.status === "rejected");
    }
    return all.filter((j) => !["delivered", "cancelled", "rejected"].includes(j.status));
  }, [history, currentJob, ordersTab]);

  return (
    <View style={styles.root}>
      {/* No subtitle. It read "248 deliveries · 96% completion rate" — two
          figures nothing computes, sitting above a list that on most days is
          five rows long, and a completion rate is the kind of number a rider
          changes their behaviour over. Nothing on the account or in
          `/me/orders` answers either one, so the bar says what the screen is
          and stops there. */}
      <TopBar title="Orders" />

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
          {rows.map((job) => (
            <Pressable
              key={job.orderNumber}
              onPress={() =>
                job.orderNumber === currentJob?.orderNumber
                  ? router.push("/active")
                  : router.push({ pathname: "/order-detail", params: { id: job.orderNumber } })
              }
              accessibilityRole="button"
              accessibilityLabel={`${restaurantLabel(job)}, ${STATUS_LABEL[job.status] ?? job.status}, ₹${job.earnings}`}
              style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceSunken }]}
            >
              <View style={styles.cardHead}>
                {/* The place, not its id. Every row here was titled
                    `FP-9C4A21B8` — a history in which no two deliveries can be
                    told apart, and in which the rider cannot find the one they
                    are looking for by remembering where they went. */}
                <Text variant="title2" style={{ flex: 1 }} numberOfLines={1}>
                  {restaurantLabel(job)}
                </Text>
                <Text variant="priceLg">₹{job.earnings}</Text>
              </View>

              <Text variant="numMeta" color="tertiary" numberOfLines={1}>
                {when(job.placedAt)} · {job.orderNumber} · {job.itemCount} item
                {job.itemCount === 1 ? "" : "s"}
              </Text>

              <View style={styles.cardFoot}>
                <Chip
                  label={STATUS_LABEL[job.status] ?? job.status}
                  tone={STATUS_TONE[job.status] ?? "muted"}
                />
                <Icon name="chevronRight" size={16} color={colors.textTertiary} />
              </View>
            </Pressable>
          ))}
        </View>

        {rows.length === 0 && !loading && (
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
