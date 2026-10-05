/* ══════════════════════════════════════════════════════════════════════════
   New Order Screen — focused: only the essential order details, clear type,
   and the one action. Laid out as the Adios order-detail screen, with the
   acceptance pinned in the footer bar.
   ══════════════════════════════════════════════════════════════════════════ */
import { prepChoices } from "@/components/common/utils/prepChoices";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Header,
  InfoNote,
  ScreenShell,
  SectionHeader,
  Txt,
  VegMarker,
  fadeInUp,
} from "@/components/ui";
import { addOnsLabel } from "@/lib/money";
import { usePartnerStore } from "@/store/partnerStore";
import { getMe, listMyOrders, setOrderStatus, type ServerOrder } from "@/services/foodPartner";
import { acknowledgeOrder, isAcknowledged, lastArrival, onQueueChanged, setSheetOpen } from "@/services/orderPump";
import { font, line, ms, radius, size, ui } from "@/theme/ui";

const rupees = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export function NewOrderScreen() {
  const session = usePartnerStore((s) => s.session);

  const [order, setOrder] = useState<ServerOrder | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [standingPrep, setStandingPrep] = useState<number | null>(null);
  const [prepMinutes, setPrepMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.token) return;
    let dropped = false;
    getMe(session.token)
      .then((me) => {
        if (!dropped) setStandingPrep(Number(me?.avgPreparationTime) || null);
      })
      .catch(() => {});
    return () => {
      dropped = true;
    };
  }, [session?.token]);

  const load = useCallback(async () => {
    if (!session?.token) {
      setLoading(false);
      setError("You are signed out. Sign in again to see new orders.");
      return;
    }
    setError("");
    try {
      const page = await listMyOrders(session.token, "placed");
      const rows = page.data || [];
      setWaiting(rows.length);

      const unseen = rows.filter((row) => !isAcknowledged(row.orderNumber));
      const rang = lastArrival();
      setOrder(unseen.find((row) => row.orderNumber === rang) ?? unseen[unseen.length - 1] ?? null);
    } catch (err) {
      setError((err as Error)?.message || "We could not load the order.");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, []);

  const shownRef = useRef<string | null>(null);
  useEffect(() => {
    shownRef.current = order?.orderNumber ?? null;
    setPrepMinutes(null);
    setAcceptError("");
  }, [order]);
  useEffect(() => {
    return () => acknowledgeOrder(shownRef.current);
  }, []);

  useEffect(() => onQueueChanged(() => void load()), [load]);

  const close = () => router.back();

  /* One value for what is highlighted AND what is sent. The sheet lit up
     `choices[0]` (or 25) when no standing prep time was set, while accept
     fell back to 0 and promised the diner nothing. */
  const choices = prepChoices(standingPrep);
  const selectedMinutes = prepMinutes ?? standingPrep ?? choices[0] ?? 25;

  const accept = async () => {
    if (!order || !session?.token) return;
    const minutes = selectedMinutes;
    setAccepting(true);
    setAcceptError("");
    try {
      await setOrderStatus(
        session.token,
        order.orderNumber,
        "accepted",
        minutes > 0 ? { promisedMinutes: minutes } : undefined,
      );
      router.replace("/(dash)/orders");
    } catch (err) {
      setAcceptError((err as Error)?.message || "That did not save.");
    } finally {
      setAccepting(false);
    }
  };

  const isCod = order?.paymentMode === "cod";
  const isPaid = order?.paymentStatus === "paid";

  return (
    <ScreenShell
      header={<Header title="New order" onBack={close} backIcon="close" backLabel="Close" />}
      scroll
      contentStyle={styles.content}
      footer={
        order ? (
          <>
            <Txt style={styles.prepLabel}>Ready in</Txt>
            <View style={styles.choicesRow}>
              {choices.map((minutes) => (
                <Chip
                  key={minutes}
                  label={`${minutes} min`}
                  selected={selectedMinutes === minutes}
                  onPress={() => setPrepMinutes(minutes)}
                  icon={
                    selectedMinutes === minutes ? <Ionicons name="checkmark" size={14} color={ui.onBrand} /> : undefined
                  }
                />
              ))}
            </View>

            {!!acceptError && <InfoNote tone="danger" text={acceptError} />}

            <Button
              title={accepting ? "Accepting…" : "Accept the order"}
              loading={accepting}
              onPress={accept}
              fullWidth
              icon={<Ionicons name="checkmark-circle" size={20} color={ui.onBrand} />}
            />
          </>
        ) : undefined
      }
    >
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={ui.brand} />
          <Txt style={styles.subtleText}>Loading order…</Txt>
        </View>
      ) : !order && error ? (
        /* The load FAILED — not "nothing waiting". A kitchen told there was
           no ticket while an order sat unread is a missed order. */
        <InfoNote tone="danger" text={error} />
      ) : !order ? (
        <EmptyState
          icon="checkmark-done-outline"
          title={waiting > 0 ? "Already seen" : "All caught up"}
          subtitle={waiting > 0 ? "Open Orders tab to view waiting items." : "No active ticket waiting."}
        />
      ) : (
        <>
          {!!error && <InfoNote tone="danger" text={error} />}

          {/* ── 1. Order & payout ───────────────────────────────────────── */}
          <Animated.View entering={fadeInUp(0)}>
            <Card bordered elevationLevel="none">
              <View style={styles.summaryTop}>
                <Txt style={styles.orderNumber}>#{order.orderNumber}</Txt>
                <Badge
                  label={isPaid ? "Paid online" : "Cash on delivery"}
                  tone={isPaid ? "success" : "warning"}
                  icon={isPaid ? "card-outline" : "cash-outline"}
                />
              </View>

              <View style={styles.payoutBox}>
                <Txt style={styles.payoutLabel}>You receive</Txt>
                <Txt style={styles.payoutValue}>
                  {rupees(order.settlement?.restaurantReceives ?? order.partnerPayout)}
                </Txt>
              </View>
              {/* What this kitchen sold, and what it keeps of it. It used to
                  read "diner pays ₹200" — a figure carrying GST, the platform
                  fee and the delivery fee, none of it the restaurant's, and
                  one the server no longer sends a partner session. */}
              <Txt style={styles.payoutSub}>
                {order.settlement
                  ? `Food ${rupees(order.settlement.foodOrderValue)}` +
                    (order.settlement.packagingFee ? ` + packaging ${rupees(order.settlement.packagingFee)}` : "") +
                    ` · Commission ${rupees(order.settlement.commission)} (${order.settlement.commissionRate}%)`
                  : `You keep this · ${rupees(order.itemsTotal)} of food`}
              </Txt>
              <Txt style={styles.payoutSub}>Lampose currently charges 0% commission on food orders.</Txt>
            </Card>
          </Animated.View>

          {/* ── 2. Items ────────────────────────────────────────────────── */}
          <Animated.View entering={fadeInUp(60)}>
            <Card bordered elevationLevel="none">
              <SectionHeader title={`${order.lines.length} item${order.lines.length === 1 ? "" : "s"}`} />

              {order.lines.map((line_, i) => (
                <View
                  key={`${line_.productName}-${i}`}
                  style={[styles.itemRow, i < order.lines.length - 1 && styles.itemDivider]}
                >
                  <VegMarker isVeg={line_.isVeg} />
                  <Txt style={styles.qty}>{line_.quantity}×</Txt>
                  <View style={styles.itemTexts}>
                    <Txt style={styles.itemTitle}>
                      {line_.productName}
                      {line_.variantName ? ` · ${line_.variantName}` : ""}
                    </Txt>
                    {/* What to add to it — missing, the dish is cooked wrong. */}
                    {!!addOnsLabel(line_.addOns) && <Txt style={styles.itemExtra}>{addOnsLabel(line_.addOns)}</Txt>}
                  </View>
                  <Txt style={styles.itemPrice}>{rupees(line_.lineTotal)}</Txt>
                </View>
              ))}

              {/* Special instructions */}
              {order.lines
                .filter((line_) => !!line_.note)
                .map((line_, i) => (
                  <InfoNote key={`note-${i}`} tone="warning" icon="create-outline" lead="Note:" text={line_.note} style={styles.note} />
                ))}
            </Card>
          </Animated.View>

          {/* COD notice. No figure: what the diner hands over at the door
              includes GST, the platform fee and delivery, and a kitchen that
              is told not to take the money does not need to know it. The
              instruction is the whole point of the line. */}
          {isCod && (
            <InfoNote tone="info" text="The rider collects payment at the door. Do not ask for money at the counter." />
          )}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 14 },
  centerBox: { paddingVertical: 36, alignItems: "center", gap: 12 },
  subtleText: { fontFamily: font.body.medium, fontSize: size.medium, color: ui.sec },

  summaryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  orderNumber: {
    flexShrink: 1,
    fontFamily: font.heading.bold,
    fontSize: size.extraLarge,
    lineHeight: line.extraLarge,
    color: ui.text,
  },
  payoutBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: ui.brandSkin,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    marginBottom: 10,
  },
  payoutLabel: { fontFamily: font.body.bold, fontSize: size.medium, color: ui.text },
  payoutValue: {
    fontFamily: font.heading.bold,
    fontSize: ms(28),
    lineHeight: ms(34),
    letterSpacing: -0.5,
    color: ui.brandInk,
  },
  payoutSub: { fontFamily: font.body.medium, fontSize: size.small, lineHeight: line.small, color: ui.sec },

  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  itemDivider: { borderBottomWidth: 1, borderBottomColor: ui.border },
  qty: {
    minWidth: ms(30),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: ui.brandSkin,
    textAlign: "center",
    fontFamily: font.body.bold,
    fontSize: size.small,
    color: ui.brandInk,
    overflow: "hidden",
  },
  itemTexts: { flex: 1, minWidth: 0 },
  itemTitle: { fontFamily: font.body.semibold, fontSize: size.medium, lineHeight: line.medium, color: ui.text },
  itemExtra: { fontFamily: font.body.regular, fontSize: size.small, lineHeight: line.small, color: ui.sec },
  itemPrice: { fontFamily: font.body.semibold, fontSize: size.medium, color: ui.text },
  note: { marginTop: 8 },

  prepLabel: { fontFamily: font.body.semibold, fontSize: size.small, color: ui.sec },
  choicesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
