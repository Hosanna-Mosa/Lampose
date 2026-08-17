import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatCard } from "@/app/(tabs)/index";
import { Btn } from "@/components/ui";
import { useFlowStore, REQUEST_SECONDS } from "@/store/flowStore";
import { colors, font, ms, radius, space, typography as t } from "@/theme";

/**
 * Thirty seconds, four numbers, one dominant action. The countdown and the
 * progress bar both flip to the error tone under 11 seconds.
 */
export default function RequestScreen() {
  const insets = useSafeAreaInsets();
  const { phase, countdown, tickCountdown, acceptOrder, declineOrder, startRequest, say } =
    useFlowStore();

  const live = phase === "request";
  const expired = phase === "expired";
  const urgent = countdown < 11;
  const tone = expired || urgent ? colors.err : colors.ok;

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!live) return;
    timer.current = setInterval(tickCountdown, 1000);
    return () => clearInterval(timer.current ?? undefined);
  }, [live, tickCountdown]);

  const onAccept = () => {
    acceptOrder();
    say("Order accepted · navigate to Paradise Biryani");
    router.replace("/active");
  };

  const onDecline = () => {
    declineOrder();
    say("Request declined. Looking for the next order.");
    router.replace("/");
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + ms(6) }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Countdown header ─────────────────────────────────────────── */}
      <View style={styles.headRow}>
        <Text style={[styles.reqKicker, { color: tone }]}>
          {expired ? "Expired" : urgent ? "Request expiring" : "New delivery request"}
        </Text>
        <Text style={styles.reqId}>#LP48291</Text>
      </View>

      <View style={styles.track}>
        <View
          style={{
            height: "100%",
            width: `${Math.round((countdown / REQUEST_SECONDS) * 100)}%`,
            backgroundColor: tone,
          }}
        />
      </View>

      {/* ── The two numbers that matter ──────────────────────────────── */}
      <View style={styles.figures}>
        <View>
          <Text style={t.kicker}>You earn</Text>
          <Text style={styles.figure}>₹86</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={t.kicker}>Time left</Text>
          <Text style={[styles.figure, { color: tone }]}>{countdown}s</Text>
        </View>
      </View>

      {/* ── Route ────────────────────────────────────────────────────── */}
      <View style={styles.routeCard}>
        <View style={{ flexDirection: "row", gap: ms(12) }}>
          <View style={styles.rail}>
            <View style={styles.railRing} />
            <View style={styles.railLine} />
            <View style={styles.railDot} />
          </View>
          <View style={{ flex: 1, gap: ms(20) }}>
            <View>
              <Text style={t.kicker}>Pick up · 1.2 km away</Text>
              <Text style={styles.stopName}>Paradise Biryani</Text>
              <Text style={styles.stopAddr}>Danavaipeta Main Road, near Kotak Bank</Text>
            </View>
            <View>
              <Text style={t.kicker}>Drop · 3.6 km further</Text>
              <Text style={styles.stopName}>Morampudi Junction</Text>
              <Text style={styles.stopAddr}>Rajahmundry · exact address after pickup</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Trip facts ───────────────────────────────────────────────── */}
      <View style={styles.statGrid}>
        <StatCard label="Distance" value="4.8 km" />
        <StatCard label="Trip time" value="18 min" />
        <StatCard label="Items" value="3" />
      </View>

      {/* ── Restaurant note ──────────────────────────────────────────── */}
      <View style={styles.note}>
        <Text style={t.kicker}>Note from restaurant</Text>
        <Text style={styles.noteBody}>
          Order is prepaid · ₹640 · carry the insulated bag, one item is gravy.
        </Text>
      </View>

      {/* ── Decision ─────────────────────────────────────────────────── */}
      {live && (
        <>
          <Btn label="Accept · ₹86" onPress={onAccept} style={styles.acceptBtn} />
          <Btn label="Decline" variant="ghost" onPress={onDecline} style={{ marginTop: ms(9) }} />
        </>
      )}

      {expired && (
        <>
          <View style={styles.expiredCard}>
            <Text style={styles.expiredTitle}>Request expired</Text>
            <Text style={styles.expiredBody}>
              It went to another partner. Missing requests lowers your acceptance rate.
            </Text>
          </View>
          <Btn
            label="Back to searching"
            onPress={() => {
              startRequest();
              router.replace("/");
            }}
            style={{ marginTop: ms(16) }}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: ms(26) },

  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ms(10) },
  reqKicker: {
    ...font.bodySemi,
    fontSize: ms(10),
    letterSpacing: ms(10) * 0.14,
    textTransform: "uppercase",
  },
  reqId: {
    ...font.body,
    fontSize: ms(11.5),
    color: colors.neutral600,
    fontVariant: ["tabular-nums"],
  },
  track: {
    marginTop: ms(10),
    height: ms(4),
    borderRadius: radius.sm,
    backgroundColor: colors.neutral300,
    overflow: "hidden",
  },

  figures: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: ms(16),
  },
  figure: {
    ...font.headingBold,
    fontSize: ms(54),
    lineHeight: ms(56),
    letterSpacing: -1,
    marginTop: ms(6),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },

  routeCard: {
    marginTop: ms(18),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    padding: ms(16),
  },
  rail: { width: ms(11), paddingTop: ms(5), alignItems: "center" },
  railRing: {
    width: ms(9),
    height: ms(9),
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  railLine: { flex: 1, width: 1, minHeight: ms(34), backgroundColor: colors.divider },
  railDot: { width: ms(9), height: ms(9), borderRadius: radius.pill, backgroundColor: colors.ink },
  stopName: {
    ...font.heading,
    fontSize: ms(19),
    lineHeight: ms(22),
    color: colors.text,
    marginTop: ms(4),
  },
  stopAddr: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.neutral700,
  },

  statGrid: { flexDirection: "row", gap: ms(9), marginTop: ms(12) },

  note: {
    marginTop: ms(12),
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    paddingLeft: ms(12),
    paddingVertical: 2,
  },
  noteBody: {
    ...font.body,
    fontSize: ms(13.5),
    lineHeight: ms(20),
    color: colors.text,
    marginTop: ms(4),
  },

  acceptBtn: { marginTop: ms(16), paddingVertical: ms(24) },

  expiredCard: {
    marginTop: ms(16),
    borderWidth: 1,
    borderColor: colors.err,
    borderRadius: radius.lg,
    padding: ms(16),
    alignItems: "center",
  },
  expiredTitle: { ...font.heading, fontSize: ms(21), lineHeight: ms(25), color: colors.text },
  expiredBody: {
    ...font.body,
    fontSize: ms(13),
    lineHeight: ms(19),
    color: colors.neutral700,
    marginTop: ms(5),
    textAlign: "center",
  },
});
