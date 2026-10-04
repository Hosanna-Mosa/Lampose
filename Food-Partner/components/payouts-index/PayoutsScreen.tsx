/* ══════════════════════════════════════════════════════════════════════════
   What this kitchen is owed, and the "Request payout" button.

   Reads `GET /me/payouts` — a balance and a history, both computed by
   `Backend/src/modules/foodpartners/foodPayout.service.js`, the same service
   the staff queue and the web owner console read. Requesting pays into
   `restaurant.payout`, the bank account saved during onboarding — this app
   has no screen to change it, so there is nothing here to pick between.

   Nothing here moves money. A request reserves the balance and puts a row in
   front of a person at Lampose, who makes the transfer by hand and records
   its reference — which is why a `pending` row can sit for a while and a
   `paid` one always carries a reference to check.
   ══════════════════════════════════════════════════════════════════════════ */
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Header,
  InfoNote,
  ScreenShell,
  SectionHeader,
  Txt,
  fadeInDown,
  staggerListItem,
} from "@/components/ui";
import { rupees } from "@/lib/money";
import { whenWords } from "@/lib/when";
import {
  listMyPayouts, requestPayout, type PayoutBalance, type PayoutRequestRow,
} from "@/services/foodPartner";
import { usePartnerStore } from "@/store/partnerStore";
import { font, line, radius, size, ui, type UiTone } from "@/theme/ui";

const STATUS_WORD: Record<string, { label: string; tone: UiTone; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { label: "Waiting on Lampose", tone: "warning", icon: "hourglass-outline" },
  paid: { label: "Paid", tone: "success", icon: "checkmark-circle-outline" },
  rejected: { label: "Refused", tone: "error", icon: "close-circle-outline" },
};

export function PayoutsScreen() {
  const insets = useSafeAreaInsets();
  const session = usePartnerStore((s) => s.session);

  const [balance, setBalance] = useState<PayoutBalance | null>(null);
  const [minimum, setMinimum] = useState(100);
  const [history, setHistory] = useState<PayoutRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestNote, setRequestNote] = useState("");

  const load = useCallback(async () => {
    if (!session?.token) {
      setLoading(false);
      setError("You are signed out. Sign in again to continue.");
      return;
    }
    setError("");
    try {
      const page = await listMyPayouts(session.token);
      setBalance(page.balance);
      setMinimum(page.minimum);
      setHistory(page.history);
    } catch (err) {
      setError((err as Error)?.message || "We could not load your payouts.");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleRequest = async () => {
    if (!session?.token || requesting) return;
    setRequesting(true);
    setRequestError("");
    setRequestNote("");
    try {
      await requestPayout(session.token);
      setRequestNote("Requested. Lampose will settle it and the transfer reference will show up here.");
      await load();
    } catch (err) {
      setRequestError((err as Error)?.message || "That did not go through.");
    } finally {
      setRequesting(false);
    }
  };

  const canRequest = !!balance && balance.available >= minimum;

  return (
    <ScreenShell
      header={<Header title="Payouts & earnings" onBack={() => router.back()} backLabel="Back to Profile" />}
      scroll
      refreshing={loading}
      onRefresh={load}
      contentStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
    >
      {!!error && <InfoNote tone="danger" text={error} />}

      {/* ── What can be requested ──────────────────────────────────────── */}
      <Animated.View entering={fadeInDown(0)}>
        <Card bordered elevationLevel="none" style={styles.balanceCard}>
          <Txt style={styles.balanceLabel}>Available to request</Txt>
          <Txt style={styles.balanceValue} accessibilityRole="header">
            {rupees(balance?.available ?? 0)}
          </Txt>
          <Txt style={styles.caption}>
            {balance?.availableOrders
              ? `From ${balance.availableOrders} delivered order${balance.availableOrders === 1 ? "" : "s"}`
              : "Nothing delivered yet is unclaimed"}
          </Txt>

          {(!!balance?.pending || !!balance?.inProgress || !!balance?.collectedByYou) && (
            <View style={styles.breakdown}>
              {!!balance?.pending && (
                <BreakdownLine
                  icon="time-outline"
                  text={`${rupees(balance.pending)} already requested, waiting on Lampose (${balance.pendingRequests} request${balance.pendingRequests === 1 ? "" : "s"}).`}
                />
              )}
              {!!balance?.inProgress && (
                <BreakdownLine
                  icon="flame-outline"
                  text={`${rupees(balance.inProgress)} still cooking or on the way — not requestable yet.`}
                />
              )}
              {!!balance?.collectedByYou && (
                <BreakdownLine
                  icon="cash-outline"
                  text={`${rupees(balance.collectedByYou)} collected by you at the counter — Lampose never held it.`}
                />
              )}
            </View>
          )}

          {!!requestError && <InfoNote tone="danger" text={requestError} />}
          {!!requestNote && <InfoNote tone="success" text={requestNote} />}

          <Button
            title={requesting ? "Requesting…" : "Request payout"}
            onPress={handleRequest}
            disabled={!canRequest || requesting}
            loading={requesting}
            fullWidth
            style={styles.requestButton}
          />
          {!canRequest && !loading && (
            <Txt style={styles.blocker}>
              {balance && balance.available > 0
                ? `Payouts start at ${rupees(minimum)}.`
                : "Nothing to request yet."}
            </Txt>
          )}
        </Card>
      </Animated.View>

      {/* ── History ────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <SectionHeader title="History" />

        {!loading && history.length === 0 && (
          <Card bordered elevationLevel="none" padding={0}>
            <EmptyState compact icon="wallet-outline" title="No payouts yet" subtitle="No payout has been requested yet." />
          </Card>
        )}

        <View style={styles.list}>
          {history.map((row, index) => {
            const status = STATUS_WORD[row.status] ?? { label: row.status, tone: "neutral" as UiTone, icon: "ellipse-outline" as const };
            return (
              <Animated.View key={row.payoutId} entering={staggerListItem(index)}>
                <Card bordered elevationLevel="none" style={styles.payoutCard}>
                  <View style={styles.payoutTop}>
                    <Txt style={styles.payoutAmount}>{rupees(row.amount)}</Txt>
                    <Badge label={status.label} tone={status.tone} icon={status.icon} />
                  </View>
                  <Txt style={styles.payoutMeta}>
                    {row.orderCount} order{row.orderCount === 1 ? "" : "s"} · requested {whenWords(row.requestedAt)}
                  </Txt>
                  {row.status === "paid" && !!row.reference && (
                    <Txt style={styles.payoutReference} selectable>
                      Reference {row.reference}
                    </Txt>
                  )}
                  {row.status === "rejected" && !!row.rejectionReason && (
                    <Txt style={styles.payoutFailed}>{row.rejectionReason}</Txt>
                  )}
                </Card>
              </Animated.View>
            );
          })}
        </View>
      </View>
    </ScreenShell>
  );
}

function BreakdownLine({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.breakdownLine}>
      <Ionicons name={icon} size={15} color={ui.muted} style={{ marginTop: 1 }} />
      <Txt style={styles.breakdownText}>{text}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 0 },
  section: { marginTop: 24 },

  balanceCard: { gap: 6 },
  balanceLabel: { fontFamily: font.body.medium, fontSize: size.medium, color: ui.sec },
  balanceValue: {
    fontFamily: font.heading.bold,
    fontSize: size.extraLarge,
    lineHeight: line.extraLarge,
    letterSpacing: -0.4,
    color: ui.text,
  },
  caption: { fontFamily: font.body.medium, fontSize: size.small, lineHeight: line.small, color: ui.muted },
  breakdown: {
    gap: 8,
    backgroundColor: ui.sunken,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 6,
  },
  breakdownLine: { flexDirection: "row", gap: 8 },
  breakdownText: { flex: 1, fontFamily: font.body.medium, fontSize: size.small, lineHeight: line.small, color: ui.sec },
  requestButton: { marginTop: 10 },
  blocker: {
    fontFamily: font.body.regular,
    fontSize: size.small,
    lineHeight: line.small,
    color: ui.muted,
    textAlign: "center",
    marginTop: 6,
  },

  list: { gap: 12 },
  payoutCard: { gap: 8 },
  payoutTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  payoutAmount: { fontFamily: font.heading.bold, fontSize: size.large, color: ui.text },
  payoutMeta: { fontFamily: font.body.medium, fontSize: size.small, lineHeight: line.small, color: ui.sec },
  payoutReference: { fontFamily: font.body.semibold, fontSize: size.small, color: ui.muted, letterSpacing: 0.4 },
  payoutFailed: {
    fontFamily: font.body.medium,
    fontSize: size.small,
    lineHeight: line.small,
    color: ui.error,
    backgroundColor: ui.errorSkin,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: "hidden",
  },
});
