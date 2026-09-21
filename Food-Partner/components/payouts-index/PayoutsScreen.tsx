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
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  Box, Btn, Card, Chip, Icon, Note, Refresher, Scroller, Text, TopBar,
} from "@/components/common";
import { rupees } from "@/lib/money";
import { whenWords } from "@/lib/when";
import {
  listMyPayouts, requestPayout, type PayoutBalance, type PayoutRequestRow,
} from "@/services/foodPartner";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, layout, space, type ToneName } from "@/theme";

const STATUS_WORD: Record<string, { label: string; tone: ToneName }> = {
  pending: { label: "Waiting on Lampose", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  rejected: { label: "Refused", tone: "danger" },
};

export function PayoutsScreen() {
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
    <Box style={styles.root}>
      <TopBar back="Profile" title="Payouts &amp; earnings" />

      <Scroller
        contentContainerStyle={styles.body}
        refreshControl={<Refresher refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}

        <Card style={styles.balanceCard}>
          <Text variant="label" color="tertiary">
            Available to request
          </Text>
          <Text variant="display1" style={{ marginTop: space[1] }}>
            {rupees(balance?.available ?? 0)}
          </Text>
          <Text variant="caption" color="tertiary" style={{ marginTop: space[1] }}>
            {balance?.availableOrders
              ? `From ${balance.availableOrders} delivered order${balance.availableOrders === 1 ? "" : "s"}`
              : "Nothing delivered yet is unclaimed"}
          </Text>

          {!!balance?.pending && (
            <Text variant="caption" color="tertiary" style={{ marginTop: space[2] }}>
              {rupees(balance.pending)} already requested, waiting on Lampose (
              {balance.pendingRequests} request{balance.pendingRequests === 1 ? "" : "s"}).
            </Text>
          )}
          {!!balance?.inProgress && (
            <Text variant="caption" color="tertiary" style={{ marginTop: 2 }}>
              {rupees(balance.inProgress)} still cooking or on the way — not requestable yet.
            </Text>
          )}
          {!!balance?.collectedByYou && (
            <Text variant="caption" color="tertiary" style={{ marginTop: 2 }}>
              {rupees(balance.collectedByYou)} collected by you at the counter — Lampose never held it.
            </Text>
          )}

          {!!requestError && <Note tone="bad">{requestError}</Note>}
          {!!requestNote && <Note tone="ok">{requestNote}</Note>}

          <Btn
            label={requesting ? "Requesting…" : "Request payout"}
            onPress={handleRequest}
            disabled={!canRequest || requesting}
            loading={requesting}
            style={{ marginTop: space[3] }}
          />
          {!canRequest && !loading && (
            <Text variant="caption" color="tertiary" style={{ marginTop: space[2], textAlign: "center" }}>
              {balance && balance.available > 0
                ? `Payouts start at ${rupees(minimum)}.`
                : "Nothing to request yet."}
            </Text>
          )}
        </Card>

        <Text variant="title2" style={{ marginTop: space[2] }}>
          History
        </Text>

        {!loading && history.length === 0 && (
          <Card style={styles.empty}>
            <Icon name="wallet" size={26} color={colors.textTertiary} />
            <Text variant="body" color="tertiary" style={{ textAlign: "center" }}>
              No payout has been requested yet.
            </Text>
          </Card>
        )}

        {history.map((row) => {
          const status = STATUS_WORD[row.status] ?? { label: row.status, tone: "muted" as ToneName };
          return (
            <Card key={row.payoutId} style={styles.row}>
              <View style={styles.rowHead}>
                <Text variant="title2">{rupees(row.amount)}</Text>
                <Chip label={status.label} tone={status.tone} />
              </View>
              <Text variant="caption" color="tertiary">
                {row.orderCount} order{row.orderCount === 1 ? "" : "s"} · requested {whenWords(row.requestedAt)}
              </Text>
              {row.status === "paid" && !!row.reference && (
                <Text variant="caption" color="tertiary">
                  Reference {row.reference}
                </Text>
              )}
              {row.status === "rejected" && !!row.rejectionReason && (
                <Text variant="caption" style={{ color: colors.danger.ink }}>
                  {row.rejectionReason}
                </Text>
              )}
            </Card>
          );
        })}
      </Scroller>
    </Box>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: layout.gutter, gap: space[3], paddingBottom: space[6] },
  balanceCard: { padding: layout.cardPadding, gap: 2 },
  empty: { alignItems: "center", gap: space[2], paddingVertical: space[5] },
  row: { gap: space[1] },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
