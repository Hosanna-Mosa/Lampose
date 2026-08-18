import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { StatCard } from "@/app/(tabs)/index";
import { Bar, Btn, Chip, Icon, Notice, Text, TopBar } from "@/components/ui";
import { useFlowStore, REQUEST_SECONDS } from "@/store/flowStore";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

/**
 * Thirty seconds, two numbers, one dominant action.
 *
 * The countdown and its bar both flip to the danger tone under 11 seconds —
 * and the eyebrow changes wording at the same moment, so the urgency is not
 * carried by the colour alone.
 */
export default function RequestScreen() {
  const { phase, countdown, tickCountdown, acceptOrder, declineOrder, startRequest, say } =
    useFlowStore();

  const live = phase === "request";
  const expired = phase === "expired";
  const urgent = countdown < 11;
  const toneName = expired || urgent ? "danger" : "success";
  const t = resolveTone(toneName);

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
    <View style={styles.root}>
      {/*
        The countdown IS the header here. Pinning it is not consistency for
        its own sake: this screen is a thirty-second decision, and a rider who
        has scrolled down to read the drop address must still be able to see
        how long is left without scrolling back up.
      */}
      <TopBar
        title={expired ? "Expired" : urgent ? "Request expiring" : "New delivery request"}
        subtitle="#LP48291"
        right={<Chip label={`${countdown}s`} tone={toneName} glyph={expired ? "close" : "clock"} />}
      />
      <Bar
        pct={Math.round((countdown / REQUEST_SECONDS) * 100)}
        tone={t.base}
        height={4}
        track={colors.surface}
        style={styles.countdownBar}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── The two numbers that matter ──────────────────────────────── */}
        <View style={styles.figures}>
          <View style={styles.figureCell}>
            <Text variant="eyebrow" color="tertiary">
              You earn
            </Text>
            <Text variant="codeHero" adjustsFontSizeToFit numberOfLines={1} style={{ marginTop: space[1] }}>
              ₹86
            </Text>
          </View>
          <View style={[styles.figureCell, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
            <Text variant="eyebrow" color="tertiary">
              Time left
            </Text>
            <Text
              variant="codeHero"
              adjustsFontSizeToFit
              numberOfLines={1}
              style={{ marginTop: space[1], color: t.ink }}
            >
              {countdown}s
            </Text>
          </View>
        </View>

        {/* ── Route ────────────────────────────────────────────────────── */}
        <View style={styles.routeCard}>
          <View style={{ flexDirection: "row", gap: space[3] }}>
            <View style={styles.rail}>
              <View style={styles.railRing} />
              <View style={styles.railLine} />
              <View style={styles.railDot} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: space[5] }}>
              <View style={{ gap: 2 }}>
                <Text variant="eyebrow" color="tertiary">
                  Pick up · 1.2 km away
                </Text>
                <Text variant="display2" numberOfLines={2}>
                  Paradise Biryani
                </Text>
                <Text variant="caption" color="tertiary">
                  Danavaipeta Main Road, near Kotak Bank
                </Text>
              </View>
              <View style={{ gap: 2 }}>
                <Text variant="eyebrow" color="tertiary">
                  Drop · 3.6 km further
                </Text>
                <Text variant="display2" numberOfLines={2}>
                  Morampudi Junction
                </Text>
                <Text variant="caption" color="tertiary">
                  Rajahmundry · exact address after pickup
                </Text>
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
        <Notice
          tone="warning"
          glyph="info"
          title="Note from restaurant"
          body="Order is prepaid · ₹640 · carry the insulated bag, one item is gravy."
        />

        {/* ── Decision ─────────────────────────────────────────────────── */}
        {live && (
          <View style={{ gap: space[2] }}>
            <Btn label="Accept · ₹86" large glyph="check" onPress={onAccept} />
            <Btn label="Decline" variant="ghost" onPress={onDecline} />
          </View>
        )}

        {expired && (
          <View style={{ gap: space[3] }}>
            <View style={styles.expiredCard}>
              <View style={styles.expiredMark}>
                <Icon name="close" size={22} color={colors.danger.on} strokeWidth={2} />
              </View>
              <Text variant="display2">Request expired</Text>
              <Text variant="caption" color="secondary" style={{ textAlign: "center" }}>
                It went to another partner. Missing requests lowers your acceptance rate.
              </Text>
            </View>
            <Btn
              label="Back to searching"
              glyph="refresh"
              onPress={() => {
                startRequest();
                router.replace("/");
              }}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingTop: space[4], paddingBottom: space[6], gap: space[4] },

  countdownBar: { borderRadius: 0 },

  figures: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  figureCell: { flex: 1, paddingVertical: space[4], paddingHorizontal: space[4], gap: space[1] },

  routeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
  rail: { width: 12, paddingTop: 14, alignItems: "center" },
  railRing: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    borderWidth: 2.5,
    borderColor: colors.brand,
  },
  railLine: { flex: 1, width: 1.5, minHeight: 36, backgroundColor: colors.border, marginVertical: 3 },
  railDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.graphite },

  statGrid: { flexDirection: "row", gap: space[2] },

  expiredCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger.border,
    backgroundColor: colors.danger.tint,
    borderRadius: radius.card,
    padding: space[5],
    alignItems: "center",
    gap: space[2],
  },
  expiredMark: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.danger.base,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[1],
  },
});
