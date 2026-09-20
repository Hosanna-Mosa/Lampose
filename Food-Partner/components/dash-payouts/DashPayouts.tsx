/* ══════════════════════════════════════════════════════════════════════════
   Payouts — what this kitchen is owed, and the request button.

   Reads/writes `GET /me/payouts` and `POST /me/payouts/request`, the same two
   handlers the web restaurant console calls — see the long comment above
   `listPayouts` in `Backend/src/modules/foodpartners/restaurantAdmin.controller.js`.
   Nothing here moves money: a request reserves the balance and puts a row in
   front of a Lampose staff member, who makes the transfer and records its
   reference. There is no way to mark a payout paid from this screen, on
   purpose — that verdict belongs to the person who actually sent the money.

   ## Why the excluded figures are shown, not just the number you can request

   `available` and `collectedByYou`/`inProgress` can disagree, and a partner
   whose Earnings tab says one number and whose payout button says a smaller
   one is owed the difference explained rather than left to wonder if the app
   is broken. See `foodPayout.service.js`'s own header for why each exclusion
   exists.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";

import {
  Box,
  Btn,
  Card,
  Chip,
  Icon,
  Note,
  Refresher,
  Scroller,
  Text,
  TopBar,
} from "@/components/common";
import { rupees } from "@/lib/money";
import { whenWords } from "@/lib/when";
import {
  getMyPayouts,
  requestMyPayout,
  type FoodPayoutRow,
  type FoodPayoutStatus,
  type PayoutOverview,
} from "@/services/foodPartner";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, space } from "@/theme";

const STATUS_TONE: Record<FoodPayoutStatus, "success" | "warning" | "danger"> = {
  pending: "warning",
  paid: "success",
  rejected: "danger",
};

const STATUS_LABEL: Record<FoodPayoutStatus, string> = {
  pending: "Waiting to be settled",
  paid: "Paid",
  rejected: "Refused",
};

export function DashPayouts() {
  const session = usePartnerStore((s) => s.session);

  const [overview, setOverview] = useState<PayoutOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestedNote, setRequestedNote] = useState("");

  const load = useCallback(async () => {
    if (!session?.token) {
      setLoading(false);
      setError("You are signed out. Sign in again to see your payouts.");
      return;
    }
    setError("");
    try {
      const data = await getMyPayouts(session.token);
      setOverview(data);
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

  const requestPayout = async () => {
    if (!session?.token || requesting) return;
    setRequesting(true);
    setRequestError("");
    setRequestedNote("");
    try {
      const payout = await requestMyPayout(session.token);
      setRequestedNote(`Requested ${rupees(payout.amount)} — Lampose will settle it and you will see the reference here.`);
      await load();
    } catch (err) {
      /* The server's own sentence — "add a bank account first", "you already
         have one waiting", "there is nothing to pay out yet", "payouts start
         at ₹100" — never a generic failure. See `foodPayout.service.js`. */
      setRequestError((err as Error)?.message || "We could not send that request.");
    } finally {
      setRequesting(false);
    }
  };

  const balance = overview?.balance;
  const minimum = overview?.minimum ?? 0;
  const history = overview?.history ?? [];
  const canRequest = !!balance && balance.available >= minimum && balance.pendingRequests === 0;

  return (
    <Box style={{ flex: 1, backgroundColor: "#F4F6F8" }}>
      <TopBar back="Profile" title="Payouts" subtitle={history.length ? `${history.length} on record` : undefined} />

      <Scroller
        contentContainerStyle={styles.scrollContent}
        refreshControl={<Refresher refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}

        {/* ── The balance and the button ─────────────────────────────── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Available to request</Text>
          <Text style={styles.heroAmount}>{rupees(balance?.available ?? 0)}</Text>
          <Text style={styles.heroSub}>
            {balance?.availableOrders
              ? `across ${balance.availableOrders} delivered order${balance.availableOrders === 1 ? "" : "s"}`
              : "nothing delivered and unpaid out yet"}
          </Text>

          <Btn
            label={requesting ? "Sending request…" : "Request payout"}
            onPress={requestPayout}
            loading={requesting}
            disabled={!canRequest || requesting}
            large
            style={{ marginTop: space[4], width: "100%" }}
          />

          {!!balance && balance.pendingRequests > 0 && (
            <Text style={styles.heroHint}>
              You already have {rupees(balance.pending)} waiting to be settled. Lampose will pay it before you can request again.
            </Text>
          )}
          {!!balance && balance.pendingRequests === 0 && balance.available < minimum && (
            <Text style={styles.heroHint}>
              Payouts start at {rupees(minimum)}. Keep taking orders — it adds up.
            </Text>
          )}
        </View>

        {!!requestError && <Note tone="bad">{requestError}</Note>}
        {!!requestedNote && <Note tone="ok">{requestedNote}</Note>}

        {/* ── The rest of the day's trade, so the number above is not a mystery ── */}
        {!!balance && (balance.collectedByYouOrders > 0 || balance.inProgressOrders > 0) && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="info" size={18} color="#059669" />
              <Text style={styles.cardTitle}>Not in that number</Text>
            </View>
            {balance.collectedByYouOrders > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  Cash you collected at the counter ({balance.collectedByYouOrders} order
                  {balance.collectedByYouOrders === 1 ? "" : "s"})
                </Text>
                <Text style={styles.infoValue}>{rupees(balance.collectedByYou)}</Text>
              </View>
            )}
            {balance.inProgressOrders > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  Still cooking or on the way ({balance.inProgressOrders} order
                  {balance.inProgressOrders === 1 ? "" : "s"})
                </Text>
                <Text style={styles.infoValue}>{rupees(balance.inProgress)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── History ─────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="clock" size={18} color="#059669" />
            <Text style={styles.cardTitle}>Payout history</Text>
          </View>

          {history.length === 0 ? (
            <Text style={styles.emptyText}>Nothing requested yet.</Text>
          ) : (
            history.map((row) => <PayoutRow key={row.payoutId} row={row} />)
          )}
        </View>
      </Scroller>
    </Box>
  );
}

function PayoutRow({ row }: { row: FoodPayoutRow }) {
  return (
    <Card style={styles.historyRow}>
      <View style={styles.historyTop}>
        <Text style={styles.historyAmount}>{rupees(row.amount)}</Text>
        <Chip label={STATUS_LABEL[row.status]} tone={STATUS_TONE[row.status]} />
      </View>
      <Text style={styles.historyMeta}>
        {row.orderCount} order{row.orderCount === 1 ? "" : "s"} · requested {whenWords(row.requestedAt)}
      </Text>
      {row.status === "paid" && (
        <Text style={styles.historyMeta}>
          Paid {whenWords(row.paidAt)}{row.reference ? ` · ref ${row.reference}` : ""}
        </Text>
      )}
      {row.status === "rejected" && !!row.rejectionReason && (
        <Text style={[styles.historyMeta, { color: "#DC2626" }]}>{row.rejectionReason}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: "#034527",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 4,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
  },
  heroHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: space[3],
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  emptyText: {
    fontSize: 14,
    color: colors.textTertiary ?? "#9CA3AF",
  },
  historyRow: {
    gap: 4,
  },
  historyTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  historyMeta: {
    fontSize: 12,
    color: "#6B7280",
  },
});
