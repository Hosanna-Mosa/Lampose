/* ══════════════════════════════════════════════════════════════════════════
   New Order Screen — Ultra-clean, focused, zero fluff text.
   Only essential order details, clear typography, and instant action.
   ══════════════════════════════════════════════════════════════════════════ */
import { prepChoices } from "@/components/common/utils/prepChoices";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Icon, Note, Scroller, Text, TopBar } from "@/components/common";
import { usePartnerStore } from "@/store/partnerStore";
import { getMe, listMyOrders, setOrderStatus, type ServerOrder } from "@/services/foodPartner";
import { acknowledgeOrder, isAcknowledged, lastArrival, onQueueChanged, setSheetOpen } from "@/services/orderPump";

const rupees = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export function NewOrderScreen() {
  const insets = useSafeAreaInsets();
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

  const accept = async () => {
    if (!order || !session?.token) return;
    const minutes = prepMinutes ?? standingPrep ?? 0;
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

  const choices = prepChoices(standingPrep);
  const selectedMinutes = prepMinutes ?? standingPrep ?? choices[0] ?? 25;
  const isCod = order?.paymentMode === "cod";
  const isPaid = order?.paymentStatus === "paid";

  return (
    <Box style={styles.root}>
      <TopBar
        back="Close"
        onBack={close}
        title="New order"
      />

      <Scroller
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 175 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerBox}>
            <Text style={styles.subtleText}>Loading order…</Text>
          </View>
        ) : !order ? (
          <View style={styles.centerBox}>
            <Note tone="info" glyph="check">
              {waiting > 0
                ? "Open Orders tab to view waiting items."
                : "No active ticket waiting."}
            </Note>
          </View>
        ) : (
          <>
            {!!error && <Note tone="bad">{error}</Note>}

            {/* ── 1. ORDER & PAYOUT CARD ─────────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                <View
                  style={[
                    styles.badge,
                    isPaid ? styles.badgePaid : styles.badgeCod,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      isPaid ? styles.badgeTextPaid : styles.badgeTextCod,
                    ]}
                  >
                    {isPaid ? "PAID ONLINE" : "CASH ON DELIVERY"}
                  </Text>
                </View>
              </View>

              <Text style={styles.payoutValue}>{rupees(order.partnerPayout)}</Text>
              <Text style={styles.payoutSub}>
                You keep this · diner pays {rupees(order.grandTotal)}
              </Text>
            </View>

            {/* ── 2. ITEMS CARD ──────────────────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.sectionHeader}>
                {order.lines.length} ITEM{order.lines.length === 1 ? "" : "S"}
              </Text>

              <View style={styles.itemsList}>
                {order.lines.map((line, i) => {
                  const isVeg = line.isVeg === "veg" || line.isVeg === undefined;
                  return (
                    <View key={`${line.productName}-${i}`} style={styles.itemRow}>
                      <View style={styles.itemLeft}>
                        {/* Veg / Non-Veg Indicator */}
                        <View style={[styles.dietDotBorder, isVeg ? styles.vegBorder : styles.nonVegBorder]}>
                          <View style={[styles.dietDot, isVeg ? styles.vegDot : styles.nonVegDot]} />
                        </View>
                        <Text style={styles.itemTitle}>
                          {line.quantity}× {line.productName}
                          {line.variantName ? ` · ${line.variantName}` : ""}
                        </Text>
                      </View>
                      <Text style={styles.itemPrice}>{rupees(line.lineTotal)}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Special Instructions Note */}
              {order.lines
                .filter((line) => !!line.note)
                .map((line, i) => (
                  <View key={`note-${i}`} style={styles.noteBox}>
                    <Text style={styles.noteText}>
                      <Text style={{ fontWeight: "700" }}>Note: </Text>
                      {line.note}
                    </Text>
                  </View>
                ))}
            </View>

            {/* COD Simple Notice (if COD) */}
            {isCod && (
              <View style={styles.codNotice}>
                <Icon name="info" size={16} color="#4B5563" />
                <Text style={styles.codNoticeText}>
                  Rider collects {rupees(order.grandTotal)} at door. Do not ask for money at counter.
                </Text>
              </View>
            )}
          </>
        )}
      </Scroller>

      {/* ── 3. FIXED BOTTOM PREPARATION & ACCEPT BAR ──────────────────────────── */}
      {!!order && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={styles.prepLabel}>Ready in</Text>

          <View style={styles.choicesRow}>
            {choices.map((minutes) => {
              const selected = selectedMinutes === minutes;
              return (
                <Pressable
                  key={minutes}
                  style={[styles.prepPill, selected && styles.prepPillSelected]}
                  onPress={() => setPrepMinutes(minutes)}
                >
                  {selected && <Icon name="check" size={14} color="#059669" strokeWidth={2.5} />}
                  <Text style={[styles.prepPillText, selected && styles.prepPillTextSelected]}>
                    {minutes} min
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {!!acceptError && <Note tone="bad">{acceptError}</Note>}

          <Pressable
            style={[styles.acceptButton, accepting && styles.acceptButtonDisabled]}
            disabled={accepting}
            onPress={accept}
          >
            <Text style={styles.acceptButtonText}>
              {accepting ? "Accepting…" : "Accept the order"}
            </Text>
          </Pressable>
        </View>
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  centerBox: {
    paddingVertical: 36,
    alignItems: "center",
  },
  subtleText: {
    fontSize: 14,
    color: "#6B7280",
  },

  /* ── CLEAN CARDS ─────────────────────────────────────────────────────────── */
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  orderNumber: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: "#111827",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeCod: {
    backgroundColor: "#FEF3C7",
  },
  badgePaid: {
    backgroundColor: "#D1FAE5",
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  badgeTextCod: {
    color: "#B45309",
  },
  badgeTextPaid: {
    color: "#047857",
  },

  payoutValue: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  payoutSub: {
    fontSize: 13,
    lineHeight: 18,
    color: "#6B7280",
    fontWeight: "500",
  },

  /* ── ITEMS ──────────────────────────────────────────────────────────────── */
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 0.5,
  },
  itemsList: {
    gap: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  dietDotBorder: {
    width: 15,
    height: 15,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  vegBorder: {
    borderColor: "#16A34A",
  },
  nonVegBorder: {
    borderColor: "#DC2626",
  },
  dietDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  vegDot: {
    backgroundColor: "#16A34A",
  },
  nonVegDot: {
    backgroundColor: "#DC2626",
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
    flex: 1,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4B5563",
  },

  noteBox: {
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  noteText: {
    fontSize: 13,
    color: "#B45309",
  },

  codNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 12,
  },
  codNoticeText: {
    fontSize: 13,
    color: "#374151",
    flex: 1,
  },

  /* ── BOTTOM BAR ─────────────────────────────────────────────────────────── */
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 6,
  },
  prepLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  choicesRow: {
    flexDirection: "row",
    gap: 8,
  },
  prepPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  prepPillSelected: {
    backgroundColor: "#ECFDF5",
    borderColor: "#059669",
  },
  prepPillText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  prepPillTextSelected: {
    fontWeight: "700",
    color: "#047857",
  },

  acceptButton: {
    height: 50,
    backgroundColor: "#059669",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonDisabled: {
    opacity: 0.6,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
