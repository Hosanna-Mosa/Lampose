import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Btn, Chip, DataRow, Rule, Text, TopBar } from "@/components/ui";
import { restaurantLabel, useDriverStore } from "@/store/driverStore";
import { colors, layout, radius, space, type ToneName } from "@/theme";

const STATUS_LABEL: Record<string, string> = {
  placed: "Waiting on the kitchen",
  accepted: "Kitchen accepted",
  preparing: "Cooking",
  ready: "Ready to collect",
  picked_up: "With you",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<string, ToneName> = {
  placed: "warning",
  accepted: "info",
  preparing: "info",
  ready: "brand",
  picked_up: "brand",
  delivered: "success",
  rejected: "danger",
  cancelled: "muted",
};

const when = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString([], {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

/**
 * One delivery, after the fact.
 *
 * Read out of the store's own history rather than fetched: the list screen
 * that links here has already loaded it, and a second request for a row that
 * is sitting in memory is a spinner over a screen that could have drawn
 * immediately.
 *
 * ## What this deliberately does NOT show
 *
 * A timeline of six stamped stages, and an earnings breakdown split into a
 * base, a distance component and a tip. The design had both, and the product
 * has neither: a rider is paid ONE figure for a job and the server stores
 * exactly that (`delivery.earnings`). Three numbers where there is one fact is
 * a screen a rider will try to reconcile against a bank statement, and they
 * will be right that it does not add up.
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  const history = useDriverStore((s) => s.history);
  const currentJob = useDriverStore((s) => s.currentJob);

  const job =
    (id ? history.find((entry) => entry.orderNumber === id) : history[0]) ??
    (id && currentJob?.orderNumber === id ? currentJob : null);

  if (!job) {
    return (
      <View style={styles.root}>
        <TopBar back="Orders" title="Delivery" />
        <View style={[styles.card, { margin: layout.gutter, gap: space[2] }]}>
          <Text variant="title1">We cannot find that delivery</Text>
          <Text variant="body" color="tertiary">
            It may not be one of yours, or your history has not loaded yet. Pull to refresh on
            the Orders tab.
          </Text>
        </View>
      </View>
    );
  }

  /*
    How this order was paid for, which is NOT the same question as what is
    owed at the door.

    `collectAmount` answers the second one and only the second one: the server
    computes it as "cash, and not yet paid", and marking a COD delivery
    complete is the moment it flips `paymentStatus` to `paid`. So every
    FINISHED cash job comes back with `collectAmount: 0` — and reading the
    payment method off that figure told a rider who had just taken ₹640 across
    a doorstep that the customer had paid online. The mode is its own field and
    is the one to ask.

    `collectAmount` is kept for the live case, where it is the whole point: a
    rider must not ask for money on an order that is already paid.
  */
  const cash = job.paymentMode ? job.paymentMode === "cod" : job.collectAmount > 0;
  const owed = job.collectAmount > 0;

  return (
    <View style={styles.root}>
      <TopBar
        back="Orders"
        title={restaurantLabel(job)}
        subtitle={`${job.orderNumber} · ${when(job.placedAt)}`}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Chip
          label={STATUS_LABEL[job.status] ?? job.status}
          tone={STATUS_TONE[job.status] ?? "muted"}
          glyph={job.status === "delivered" ? "check" : undefined}
        />

        {/* ── What was carried ─────────────────────────────────────── */}
        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            {job.itemCount} item{job.itemCount === 1 ? "" : "s"}
          </Text>
          <View style={{ marginTop: space[1] }}>
            {job.lines.map((line, i) => (
              <DataRow
                key={`${line.productName}-${i}`}
                label={
                  line.variantName ? `${line.productName} · ${line.variantName}` : line.productName
                }
                value={`×${line.quantity}`}
                first={i === 0}
              />
            ))}
          </View>
        </View>

        {/* ── Earnings ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            Your earnings
          </Text>
          <Rule style={{ marginTop: space[3], marginBottom: space[4] }} />
          <View style={styles.totalRow}>
            <Text variant="label" color="tertiary">
              Delivery fee for this order
            </Text>
            <Text variant="priceHero">₹{job.earnings}</Text>
          </View>
        </View>

        {/* ── The order itself ─────────────────────────────────────── */}
        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            The order
          </Text>
          <View style={{ marginTop: space[1] }}>
            <DataRow label="Payment" value={cash ? "Cash on delivery" : "Paid online"} first />
            {/* Only while there is something to hand over. The amount is not
                stated on a finished cash job because the server no longer
                returns one, and a figure invented to fill the row is exactly
                what a rider would try to reconcile against their day. */}
            {owed && <DataRow label="To collect at the door" value={`₹${job.collectAmount}`} />}
            {!!job.restaurant?.address && (
              <DataRow label="Collected from" value={job.restaurant.address} />
            )}
            <DataRow label="Delivered to" value={job.drop.address || "—"} />
            <DataRow label="Customer" value={job.customerName || "—"} />
          </View>
        </View>

        <Btn
          label="Raise an issue with this order"
          variant="ghost"
          glyph="support"
          onPress={() => router.push("/support")}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
    backgroundColor: colors.surface,
  },
  railCol: { width: 10, alignItems: "center" },
  railDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    marginTop: 5,
  },
  railLine: { flex: 1, width: 1.5, backgroundColor: colors.border, marginTop: 2 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[3] },
});
