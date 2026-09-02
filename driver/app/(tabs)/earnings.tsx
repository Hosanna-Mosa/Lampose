import React, { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatOnline, StatCard } from "@/app/(tabs)/index";
import { Btn, Notice, Seg, Sheet, Text, Toast, TopBar } from "@/components/ui";
import { PERIODS_LIST, type PeriodData } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useDriverStore } from "@/store/driverStore";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

/**
 * Earnings read as a ledger: totals as large figures, breakdown on hairlines.
 *
 * Every figure is the SERVER'S — `GET /api/v2/drivers/me/earnings`, which
 * derives them from delivered orders rather than from a counter. See the note
 * on `driver.model.js`: a counter and a ledger that disagree is the worst bug
 * this product could have, and the only way they cannot disagree is for there
 * to be one of them.
 *
 * That endpoint answers seven things — today, the week, the month, the trip
 * counts for the first two, minutes online, and seven days of bars — and this
 * screen renders those seven and stops. It used to end in a "Balances" card
 * and a button: "Available for payout ₹3,240", "Pending earnings ₹928",
 * "Lifetime earnings ₹2,84,610", "Withdraw ₹3,240". Four literals in a file
 * whose own header said every figure on it was the server's. Pressing the
 * button opened a sheet naming a bank account nobody had entered, closed it,
 * and said "₹3,240 sent" — with no request made anywhere, because there is no
 * payout endpoint, no ledger and no transfer in this product to make one to.
 * A rider who is told money has moved and then finds it has not is a rider who
 * rings support about a theft. All four are gone, and so is the button.
 *
 * ## What is deliberately absent
 *
 * Tips, incentives and adjustments. The design has rows for all three and the
 * product has none of them yet — a "Tips ₹48" line under a real total is a
 * number a rider will try to reconcile against a bank statement, and it would
 * not be there. The breakdown says what it can actually account for.
 *
 * ## Three states, not one — and the third is not the absence of the second
 *
 * Nothing answered yet, the read failed, and a real answer. Zeroes are a real
 * answer — a rider who has delivered nothing has earned nothing and should be
 * shown that plainly — which is exactly why they must not also be what a
 * failed request looks like. `earningsLoaded` is what separates them.
 *
 * "Nothing answered yet" then splits again, and this screen used to get it
 * wrong: it asked `loadingEarnings` and treated a no as a failure. But on the
 * very first render nothing has been asked for at all — the fetch is queued in
 * an effect below and has not run — so `loading` is false, `loaded` is false,
 * and the screen accused the connection of dropping a request it had not yet
 * made. Not asked and asked-and-failed are different states and only one of
 * them is anybody's fault, so the failure is now read from `earningsError`,
 * which nothing but a real refusal can set.
 */
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

    /* Seven bars, oldest first, scaled against the busiest day so a quiet
       week still draws a readable chart rather than seven flat lines. The
       server sends the same seven days for every period; only the total and
       the tally change, which is honest — it does not hold an hourly
       breakdown and inventing one would be drawing a shape from nothing. */
    const peak = Math.max(1, ...earnings.weekly.map((d) => d.amount));
    const bars = earnings.weekly.map((d, i) => {
      const label = new Date(`${d.day}T00:00:00`).toLocaleDateString([], { weekday: "short" });
      return [label, d.amount / peak, i === earnings.weekly.length - 1 ? 1 : 0] as [string, number, number];
    });

    const total = period === "Today" ? earnings.today : period === "Week" ? earnings.week : earnings.month;
    const trips = period === "Today" ? earnings.todayTrips : earnings.weekTrips;

    return {
      label:
        period === "Today"
          ? "Today"
          : period === "Week"
            ? "The last seven days"
            : "This month",
      total: rupees(total),
      /* No comparison line. There is nothing to compare against until the
         server keeps a history of averages, and "₹118 more than your average"
         under a figure nobody computed is the kind of number that gets
         believed. */
      delta: `${trips} ${trips === 1 ? "delivery" : "deliveries"}`,
      orders: String(trips),
      hours: formatOnline(earnings.onlineMinutes),
      bars,
      rows: [
        { l: "Delivery earnings", v: rupees(total) },
        { l: "Deliveries completed", v: String(trips) },
        { l: "Online time", v: formatOnline(earnings.onlineMinutes) },
      ],
    };
  }, [earnings, period]);

  /*
    Nothing has ever been read for this rider, so there are no figures to show
    — and zeroes here would be a claim about their week rather than a screen
    that has not loaded.

    A read that HAS failed is the only thing allowed to say so, and it says so
    through `earningsError`. Everything else on the way to an answer — the
    first frame before the effect has run, the request in flight, a retry — is
    one state as far as a rider is concerned: it is coming. `loading` is not
    consulted for the verdict at all, only the error is; while a retry is in
    flight the previous error is still set and the screen would otherwise flip
    back to an accusation it is in the middle of disproving.
  */
  const failed = !!error && !loading;
  if (!loaded) {
    return (
      <View style={styles.root}>
        <TopBar title="Earnings" />
        <View style={styles.content}>
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
      <TopBar title="Earnings" />

      {/* Pinned with the bar: every figure below is scoped by this control, so
          losing it off the top means reading numbers with no idea what period
          they cover. */}
      <View style={styles.segWrap}>
        <Seg options={PERIODS_LIST} value={period} onChange={setPeriod} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Figures did load once, and the most recent attempt to refresh them
            did not. Said out loud, because the alternative is a rider reading
            this morning's total as though it were this afternoon's. */}
        {!!error && (
          <Notice
            tone="warning"
            glyph="alert"
            title="These may be out of date"
            body={error}
          />
        )}

        {/* ── Total ────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            {data.label}
          </Text>
          <Text variant="codeHero" adjustsFontSizeToFit numberOfLines={1} style={{ marginTop: space[2] }}>
            {data.total}
          </Text>
          <Text variant="caption" color="success" style={{ marginTop: space[2] }}>
            {data.delta}
          </Text>

          {/* Bars live inside the total card — they are that figure, split up.
              Absent rather than flat when the server sent no days at all: an
              empty axis is a chart of nothing, and a rider reads it as a week
              in which they earned nothing. */}
          {data.bars.length > 0 && (
            <View style={styles.chart}>
              {data.bars.map(([label, height, highlighted], i) => (
                <View key={`${label}-${i}`} style={styles.col}>
                  <View
                    style={{
                      width: "100%",
                      height: Math.max(3, Math.round(height * 96)),
                      borderRadius: radius.chip,
                      backgroundColor: highlighted ? colors.brand : colors.surfaceSunken,
                    }}
                  />
                  <Text variant="numMeta" color="tertiary">
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Breakdown ────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            Breakdown
          </Text>
          <View style={{ marginTop: space[3] }}>
            {data.rows.map((r) => (
              <View key={r.l} style={styles.ledgerRow}>
                <Text variant="body" color="secondary" style={{ flex: 1 }}>
                  {r.l}
                </Text>
                <Text variant="priceMd" style={r.tone ? { color: resolveTone(r.tone).ink } : undefined}>
                  {r.v}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.totalRow}>
            <Text variant="label" color="tertiary">
              Total
            </Text>
            <Text variant="priceHero">{data.total}</Text>
          </View>
        </View>

        <View style={styles.statGrid}>
          <StatCard label="Deliveries" value={data.orders} />
          <StatCard label="Online hours" value={data.hours} />
        </View>

        {/*
          How the money actually reaches the rider, said once and sourced.

          `support.audiences.js` on the server is where this comes from: the
          rider's `payout` category exists for "my weekly settlement has not
          arrived", separately from `earnings`, which is one trip paid wrong.
          So a weekly settlement is a real process with a real queue behind it.
          What this app does NOT do is move any of it — there is no payout
          route in `driver.routes.js`, no ledger in `driver.model.js`, and the
          screen that claimed to transfer money has been removed — and that is
          worth saying in the same breath, because the question a rider brings
          to this tab is "where is it", and "not from here" is half the answer.

          No day of the week, no cut-off, no processing time. None of those is
          written down anywhere in this codebase, and a payout schedule guessed
          at on a rider's earnings screen is exactly the kind of promise that
          gets someone waiting by a bank app on a Monday for nothing.
        */}
        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            Getting paid
          </Text>
          <Text variant="body" color="secondary" style={{ marginTop: space[2] }}>
            These are what your delivered orders have paid. Lampose settles them weekly to the
            account you gave when you signed up; the app itself does not move money. If a
            settlement has not arrived, or has arrived short, raise it in Help under
            &ldquo;Payout&rdquo;.
          </Text>
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
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
    backgroundColor: colors.surface,
  },

  chart: {
    marginTop: space[5],
    height: 120,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space[2],
  },
  col: { flex: 1, alignItems: "center", gap: space[2], justifyContent: "flex-end" },

  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    gap: space[3],
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: space[4],
  },

  statGrid: { flexDirection: "row", gap: space[2] },
});
