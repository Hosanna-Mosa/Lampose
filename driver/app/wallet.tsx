import React, { useState } from "react";
import { FlatList, StyleSheet, Text as RNText, View } from "react-native";
import { Btn, Notice, TopBar } from "@/components/ui";
import { useWallet } from "@/hooks/useWallet";
import { describeEntry, fetchWallet, paiseToRupees, type LedgerEntry } from "@/services/wallet";
import { useDriverStore } from "@/store/driverStore";
import { layout, space } from "@/theme";

/**
 * Every movement of the rider's money, newest first — the server's ledger
 * row by row, so the two balances on the Earnings tab can always be
 * explained to the paisa. Each row shows what it did to the wallet and to
 * what the rider owes, and the balances after it.
 */
export default function WalletHistoryScreen() {
  const token = useDriverStore((s) => s.token);
  const { wallet } = useWallet();
  const [older, setOlder] = useState<LedgerEntry[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);

  const first = wallet?.entries ?? [];
  /* A fresh read (focus, or a push) replaces the newest page; the older pages
     stay as they were — rows are never edited, only added. */
  const seen = new Set(first.map((e) => e.id));
  const entries = [...first, ...older.filter((e) => !seen.has(e.id))];

  const loadMore = async () => {
    const last = entries[entries.length - 1];
    if (!token || !last || loadingMore || end) return;
    setLoadingMore(true);
    try {
      const page = await fetchWallet(token, last.seq);
      if (!page.entries.length) setEnd(true);
      setOlder((prev) => [...prev, ...page.entries]);
    } catch {
      /* Left as is — the button stays for another try. */
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <View style={styles.root}>
      <TopBar back="Earnings" title="Wallet history" />
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          wallet ? (
            <View style={styles.summary}>
              <View style={styles.summaryCol}>
                <RNText style={styles.summaryLabel}>Wallet</RNText>
                <RNText style={styles.summaryValue}>{paiseToRupees(wallet.walletPaise)}</RNText>
              </View>
              <View style={styles.summaryCol}>
                <RNText style={styles.summaryLabel}>Outstanding</RNText>
                <RNText style={[styles.summaryValue, wallet.outstandingPaise > 0 && styles.owed]}>
                  {paiseToRupees(wallet.outstandingPaise)}
                </RNText>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          wallet ? (
            <Notice tone="info" glyph="info" title="Nothing yet" body="Your deliveries will show here as you complete them." />
          ) : null
        }
        renderItem={({ item }) => <Row entry={item} />}
        ListFooterComponent={
          entries.length >= 30 && !end ? (
            <Btn label="Show older" variant="ghost" loading={loadingMore} onPress={loadMore} style={{ marginTop: space[3] }} />
          ) : null
        }
      />
    </View>
  );
}

function Row({ entry }: { entry: LedgerEntry }) {
  const { title, detail } = describeEntry(entry);
  const changes: { text: string; tone: "plus" | "minus" | "owe" | "paid" }[] = [];
  if (entry.walletPaise) {
    changes.push({
      text: `${entry.walletPaise > 0 ? "+" : "−"}${paiseToRupees(Math.abs(entry.walletPaise))} wallet`,
      tone: entry.walletPaise > 0 ? "plus" : "minus",
    });
  }
  if (entry.outstandingPaise) {
    changes.push({
      text: `${entry.outstandingPaise > 0 ? "+" : "−"}${paiseToRupees(Math.abs(entry.outstandingPaise))} owed`,
      tone: entry.outstandingPaise > 0 ? "owe" : "paid",
    });
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <RNText style={styles.rowTitle}>{title}</RNText>
        {!!detail && <RNText style={styles.rowDetail}>{detail}</RNText>}
        <RNText style={styles.rowWhen}>
          {new Date(entry.at).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
        </RNText>
      </View>
      <View style={styles.rowSide}>
        {changes.map((c) => (
          <RNText key={c.text} style={[styles.change, styles[c.tone]]}>
            {c.text}
          </RNText>
        ))}
        {entry.kind === "cash_order" && !entry.walletPaise && (
          <RNText style={styles.rowWhen}>{paiseToRupees(entry.earningPaise)} earned in cash</RNText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { paddingHorizontal: layout.gutter, paddingTop: space[3], paddingBottom: space[8] },

  summary: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: space[3],
  },
  summaryCol: { flex: 1, alignItems: "center" },
  summaryLabel: { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  summaryValue: { fontSize: 20, fontWeight: "900", color: "#064e3b", marginTop: 2 },
  owed: { color: "#b45309" },

  row: {
    flexDirection: "row",
    gap: space[3],
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 14.5, fontWeight: "700", color: "#111827" },
  rowDetail: { fontSize: 12.5, color: "#4b5563", marginTop: 2 },
  rowWhen: { fontSize: 11.5, color: "#9ca3af", marginTop: 3 },
  rowSide: { alignItems: "flex-end" },
  change: { fontSize: 13.5, fontWeight: "800" },
  plus: { color: "#047857" },
  minus: { color: "#374151" },
  owe: { color: "#b45309" },
  paid: { color: "#047857" },
});
