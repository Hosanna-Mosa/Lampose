import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatCard } from "@/app/(tabs)/index";
import { Btn, Icon, Text, Toast, TopBar } from "@/components/ui";
import { useDriverStore } from "@/store/driverStore";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

/**
 * Completion states the money first, then closes the loop.
 *
 * The figures are the SERVER'S. `history[0]` is the job that was just handed
 * over — the store puts it there as the delivery lands — and `earnings` is
 * re-read from `GET /me/earnings` at the same moment. Neither is added up
 * locally: a counter in the app and a ledger on the server that disagree is
 * the worst bug this product could have, and the only way they cannot disagree
 * is for there to be one of them.
 *
 * ## What this deliberately does NOT ask
 *
 * "How was FP-9C4A21B8?", over five stars. Nothing in the platform stores a
 * rider's opinion of a restaurant: there is no field for one on
 * `food_restaurants` or on `food_orders` and no endpoint that would take it.
 * The stars set a local `useState`, thanked the rider for helping other
 * partners, and were discarded on the next navigation — so a rider who had
 * just had a bad half-hour at a counter was invited to report it into
 * nothing, and did. Whether riders should rate restaurants is a product
 * decision with a queue and a consequence behind it; a control that pretends
 * the decision has already been made is the one thing it cannot be.
 */
export default function CompleteScreen() {
  const insets = useSafeAreaInsets();
  const { toast } = useFlowStore();
  const last = useDriverStore((s) => s.history[0]);
  const earnings = useDriverStore((s) => s.earnings);

  const backHome = () => router.replace("/");

  return (
    <View style={styles.root}>
      <TopBar title="Delivery complete" subtitle={last?.orderNumber ?? ""} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.tick}>
          <Icon name="check" size={28} color={colors.onBrand} strokeWidth={2.5} />
        </View>

        <Text variant="display1" style={styles.centered}>
          Delivery completed
        </Text>
        <Text variant="caption" color="tertiary" style={styles.centered}>
          {last ? `Order ${last.orderNumber} · ${last.customerName || "Customer"}` : ""}
        </Text>

        {/* ── The money ─────────────────────────────────────────────── */}
        <View style={styles.earnBlock}>
          <Text variant="eyebrow" style={{ color: colors.brandInk }}>
            You earned
          </Text>
          <Text variant="codeHero" adjustsFontSizeToFit numberOfLines={1} style={{ marginTop: space[2] }}>
            ₹{last?.earnings ?? 0}
          </Text>
          {/* No invented breakdown. The rider is paid one figure for this job
              and the server stores exactly that (`delivery.earnings`);
              splitting it into a base and a tip that nobody computed would be
              three numbers where there is one fact. */}
          <Text variant="numMeta" color="secondary" style={{ marginTop: space[2] }}>
            Delivery fee for {last?.orderNumber ?? "this order"}
          </Text>
        </View>

        <View style={styles.statGrid}>
          <StatCard label="Items" value={String(last?.itemCount ?? 0)} />
          <StatCard label="Trips today" value={String(earnings.todayTrips)} />
          <StatCard label="Today" value={`₹${earnings.today}`} />
        </View>

        <Btn label="Back to home" glyph="home" onPress={backHome} style={{ marginTop: space[3] }} />
        <Btn
          label="View order details"
          variant="ghost"
          onPress={() =>
            router.push({ pathname: "/order-detail", params: { id: last?.orderNumber ?? "" } })
          }
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[6],
    paddingBottom: space[6],
    alignItems: "stretch",
    gap: space[3],
  },
  centered: { textAlign: "center" },

  tick: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: space[2],
  },

  earnBlock: {
    marginTop: space[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    backgroundColor: colors.brandTint,
    borderRadius: radius.card,
    paddingVertical: space[5],
    paddingHorizontal: space[4],
    alignItems: "center",
  },

  statGrid: { flexDirection: "row", gap: space[2] },
});
