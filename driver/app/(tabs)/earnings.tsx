import React, { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatOnline } from "@/app/(tabs)/index";
import { Btn, Icon, Notice, Seg, Sheet, Toast, TopBar } from "@/components/ui";
import { PERIODS_LIST, type PeriodData } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useDriverStore } from "@/store/driverStore";
import { useFlowStore } from "@/store/flowStore";
import { layout, radius, space } from "@/theme";

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const { period, setPeriod, toast } = useFlowStore();
  const sheet = useSheet();

  const earnings = useDriverStore((s) => s.earnings);
  const loading = useDriverStore((s) => s.loadingEarnings);
  const loaded = useDriverStore((s) => s.earningsLoaded);
  const error = useDriverStore((s) => s.earningsError);
  const fetchEarnings = useDriverStore((s) => s.fetchEarnings);

  useEffect(() => {
    fetchEarnings().catch(() => {});
  }, [fetchEarnings]);

  const data = useMemo<PeriodData>(() => {
    const rupees = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

    const peak = Math.max(1, ...earnings.weekly.map((d) => d.amount));
    const bars = earnings.weekly.map((d, i) => {
      const label = new Date(`${d.day}T00:00:00`).toLocaleDateString([], { weekday: "short" });
      return [label, d.amount / peak, i === earnings.weekly.length - 1 ? 1 : 0] as [string, number, number];
    });

    const total = period === "Today" ? earnings.today : period === "Week" ? earnings.week : earnings.month;
    const trips =
      period === "Today" ? earnings.todayTrips
      : period === "Week" ? earnings.weekTrips
      : earnings.monthTrips;

    return {
      label:
        period === "Today"
          ? "Today"
          : period === "Week"
            ? "The last seven days"
            : "This month",
      total: rupees(total),
      delta: `${trips} ${trips === 1 ? "delivery" : "deliveries"}`,
      orders: String(trips),
      /* Minutes since the current duty session started, not a Today/Week/Month
         total — see the note on `EarningsSummary.onlineMinutes`. Labelled
         "Current session" everywhere it appears, on every tab, rather than
         "Online time"/"Online hours", which read as a period aggregate the
         server has never actually sent. */
      hours: formatOnline(earnings.onlineMinutes),
      bars,
      rows: [
        { l: "Delivery earnings", v: rupees(total) },
        { l: "Deliveries completed", v: String(trips) },
        { l: "Current online session", v: formatOnline(earnings.onlineMinutes) },
      ],
    };
  }, [earnings, period]);

  const failed = !!error && !loading;
  if (!loaded) {
    return (
      <View style={styles.root}>
        <TopBar title="Earnings" />
        <View style={styles.loadingContent}>
          {failed ? (
            <>
              <Notice
                tone="warning"
                glyph="alert"
                title="We could not load your earnings"
                body={error}
              />
              <Btn label="Try again" glyph="refresh" onPress={() => void fetchEarnings()} />
            </>
          ) : (
            <Notice
              tone="info"
              glyph="earnings"
              title="Reading your earnings"
              body="One moment — these come from your delivered orders."
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* ── Mint Top Header & Period Segment Control ──────────────────── */}
      <View style={[styles.headerWrap, { paddingTop: Math.max(insets.top + 4, 16) }]}>
        <RNText style={styles.pageTitle}>Earnings</RNText>
        <View style={styles.segWrap}>
          <Seg options={PERIODS_LIST} value={period} onChange={setPeriod} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!!error && (
          <Notice
            tone="warning"
            glyph="alert"
            title="These may be out of date"
            body={error}
          />
        )}

        {/* ── Unboxed Hero Total & Weekly Chart ────────────────────────── */}
        <View style={styles.heroSection}>
          <RNText style={styles.periodEyebrow}>{data.label}</RNText>
          <RNText style={styles.heroTotalText}>{data.total}</RNText>
          <View style={styles.deltaBadge}>
            <Icon name="trendingUp" size={14} color="#059669" />
            <RNText style={styles.deltaText}>{data.delta}</RNText>
          </View>

          {/* Bar Chart */}
          {data.bars.length > 0 && (
            <View style={styles.chartContainer}>
              {data.bars.map(([label, height, highlighted], i) => {
                const isCurrent = Boolean(highlighted);
                return (
                  <View key={`${label}-${i}`} style={styles.chartCol}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: Math.max(6, Math.round(height * 88)),
                            backgroundColor: isCurrent ? "#059669" : "#a7f3d0",
                          },
                        ]}
                      />
                    </View>
                    <RNText style={[styles.barLabel, isCurrent ? styles.barLabelActive : undefined]}>
                      {label}
                    </RNText>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Unboxed Transparent Stat Bar (No Cards) ──────────────────── */}
        <View style={styles.statBar}>
          <View style={styles.statItem}>
            <RNText style={styles.statLabel}>Deliveries</RNText>
            <RNText style={styles.statVal}>{data.orders}</RNText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <RNText style={styles.statLabel}>Current session</RNText>
            <RNText style={styles.statVal}>{data.hours}</RNText>
          </View>
        </View>

        {/* ── Unboxed Ledger Breakdown ────────────────────────────────── */}
        <View style={styles.breakdownSection}>
          <RNText style={styles.sectionHeaderTitle}>Breakdown</RNText>
          <View style={styles.ledgerList}>
            {data.rows.map((r) => (
              <View key={r.l} style={styles.ledgerRow}>
                <RNText style={styles.ledgerLabel}>{r.l}</RNText>
                <RNText style={styles.ledgerValue}>{r.v}</RNText>
              </View>
            ))}
          </View>
          <View style={styles.totalRow}>
            <RNText style={styles.totalLabel}>Total</RNText>
            <RNText style={styles.totalValue}>{data.total}</RNText>
          </View>
        </View>

        {/* ── Unboxed Getting Paid Info ────────────────────────────────── */}
        <View style={styles.infoSection}>
          <View style={styles.infoHead}>
            <View style={styles.infoIconCircle}>
              <Icon name="bank" size={18} color="#059669" />
            </View>
            <RNText style={styles.infoTitle}>Getting paid</RNText>
          </View>
          <RNText style={styles.infoBody}>
            These are what your delivered orders have paid. Lampose settles them weekly to the
            account you gave when you signed up; the app itself does not move money. If a
            settlement has not arrived, or has arrived short, raise it in Help under "Payout".
          </RNText>
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },

  loadingContent: {
    padding: layout.gutter,
    gap: space[4],
  },

  /* Header & Segment Selector — no fill of its own, matching the profile
     screen's own header: it reads as part of the same page rather than a
     separate mint panel. */
  headerWrap: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[3],
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#064e3b",
    marginBottom: space[2],
  },
  segWrap: {
    marginTop: 2,
  },

  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    paddingBottom: space[8],
    gap: space[5],
  },

  /* Unboxed Hero Section */
  heroSection: {
    paddingVertical: space[2],
  },
  periodEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroTotalText: {
    fontSize: 34,
    fontWeight: "900",
    color: "#064e3b",
    marginTop: space[1],
  },
  deltaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  deltaText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#047857",
  },

  /* Chart */
  chartContainer: {
    marginTop: space[4],
    height: 115,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space[2],
    paddingTop: space[3],
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  chartCol: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    justifyContent: "flex-end",
  },
  barTrack: {
    height: 88,
    width: 14,
    backgroundColor: "#e5e7eb",
    borderRadius: 7,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderRadius: 7,
  },
  barLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9ca3af",
  },
  barLabelActive: {
    color: "#059669",
    fontWeight: "700",
  },

  /* Unboxed Transparent Stat Bar */
  statBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 2,
  },
  statVal: {
    fontSize: 18,
    fontWeight: "800",
    color: "#064e3b",
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#e5e7eb",
  },

  /* Unboxed Breakdown Section */
  breakdownSection: {
    paddingTop: space[1],
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: space[2],
  },
  ledgerList: {
    marginTop: space[1],
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  ledgerLabel: {
    fontSize: 14.5,
    color: "#374151",
    fontWeight: "500",
  },
  ledgerValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: 1.5,
    borderTopColor: "#e5e7eb",
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  totalValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#064e3b",
  },

  /* Unboxed Info Section */
  infoSection: {
    paddingTop: space[1],
    paddingBottom: space[2],
  },
  infoHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    marginBottom: space[2],
  },
  infoIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2937",
  },
  infoBody: {
    fontSize: 12.5,
    color: "#6b7280",
    lineHeight: 19,
  },
});
