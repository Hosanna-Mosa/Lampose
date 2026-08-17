import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, BellIcon, Btn, Icon, Sheet, Toast } from "@/components/ui";
import { DRIVER, STAGES, STATUS, STATUS_ONLINE_IDLE } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, space, typography as t } from "@/theme";

/** Expanding ring used by the status dot and the "waiting for orders" radar. */
export function PulseRing({
  size,
  color,
  delay = 0,
  duration = 2400,
  style,
}: {
  size: number;
  color: string;
  delay?: number;
  duration?: number;
  style?: object;
}) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay, duration]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.6] }) }],
        },
        style,
      ]}
    />
  );
}

/** Pale well with a tracked label and a large figure. */
export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={t.kicker}>{label}</Text>
      <Text style={styles.statNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const {
    online,
    phase,
    stage,
    earned,
    orderCount,
    toast,
    goOnline,
    goOffline,
    setPhase,
    startRequest,
    clearToast,
  } = useFlowStore();
  const sheet = useSheet();

  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searching = phase === "connecting" || phase === "searching";
  const hasActive = phase === "active";

  // Duty sequence: connecting (1.4s) → searching → a request lands (5.2s).
  useEffect(() => {
    if (phase !== "connecting") return;
    connectTimer.current = setTimeout(() => setPhase("searching"), 1400);
    return () => clearTimeout(connectTimer.current ?? undefined);
  }, [phase, setPhase]);

  useEffect(() => {
    if (phase !== "searching") return;
    searchTimer.current = setTimeout(() => {
      startRequest();
      router.push("/request");
    }, 5200);
    return () => clearTimeout(searchTimer.current ?? undefined);
  }, [phase, startRequest]);

  useEffect(() => {
    if (!toast) return;
    toastTimer.current = setTimeout(clearToast, 2600);
    return () => clearTimeout(toastTimer.current ?? undefined);
  }, [toast, clearToast]);

  const status = online && phase === "idle" ? STATUS_ONLINE_IDLE : STATUS[phase];
  const statusLabel = online ? (phase === "noorders" ? "Online · low demand" : "Online") : "Offline";

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + ms(8) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Identity ───────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Avatar name={DRIVER.name} size={ms(44)} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name}>{DRIVER.name}</Text>
            <Text style={styles.rating}>{DRIVER.rating}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => router.push("/notifications")}
            style={({ pressed }) => [styles.bell, pressed && { opacity: 0.6 }]}
          >
            <BellIcon size={ms(19)} />
            <View style={styles.bellDot} />
          </Pressable>
        </View>

        {/* ── Duty ───────────────────────────────────────────────────── */}
        <View
          style={[
            styles.statusCard,
            {
              borderColor: online ? colors.ok : colors.divider,
              backgroundColor: online ? "rgba(61, 107, 76, 0.07)" : colors.neutral100,
            },
          ]}
        >
          <View style={styles.statusRow}>
            <View style={styles.dotWrap}>
              {online && <PulseRing size={ms(9)} color={status.tone} duration={1800} />}
              <View style={[styles.dot, { backgroundColor: status.tone }]} />
            </View>
            <Text style={[styles.statusLabel, { color: status.tone }]}>{statusLabel}</Text>
          </View>

          <Text style={styles.statusHead}>{status.head}</Text>
          <Text style={styles.statusSub}>{status.sub}</Text>

          {searching && (
            <View style={styles.radar}>
              <View style={styles.radarCore} />
              <PulseRing size={ms(120)} color={colors.ok} style={styles.radarRing} />
              <PulseRing size={ms(120)} color={colors.ok} delay={1200} style={styles.radarRing} />
              <Text style={styles.radarLabel}>Waiting for orders…</Text>
            </View>
          )}

          <Btn
            label={online ? "Go offline" : "Go online"}
            variant={online ? "ghost" : "ink"}
            large={!online}
            onPress={online ? goOffline : goOnline}
            style={{ marginTop: online ? ms(18) : ms(20) }}
          />

          {online && (
            <Text style={styles.onlineFor}>Online for 6h 24m · you can go offline any time</Text>
          )}
        </View>

        {/* ── Active delivery ────────────────────────────────────────── */}
        {hasActive && (
          <Pressable
            onPress={() => router.push("/active")}
            style={({ pressed }) => [styles.activeCard, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.activeHead}>
              <Text style={styles.activeHeadLabel}>Active delivery</Text>
              <Text style={styles.activeHeadId}>#LP48291</Text>
            </View>
            <View style={styles.activeBody}>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeStage}>{STAGES[stage]}</Text>
                <Text style={styles.activeName}>Paradise Biryani</Text>
                <Text style={styles.activeMeta}>4.8 km · ETA 18 min · ₹86</Text>
              </View>
              <Icon name="chevronRight" size={ms(20)} />
            </View>
          </Pressable>
        )}

        {/* ── Today ──────────────────────────────────────────────────── */}
        <View style={styles.statGrid}>
          <StatCard label="Earnings" value={`₹${earned}`} />
          <StatCard label="Orders" value={String(orderCount)} />
          <StatCard label="Online" value="6h 24m" />
        </View>

        {/* ── Incentive ──────────────────────────────────────────────── */}
        <Pressable
          onPress={() => router.push("/incentives")}
          style={({ pressed }) => [styles.incentive, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.incentiveHead}>
            <Text style={t.kicker}>Today's incentive</Text>
            <Text style={styles.incentiveEnds}>Ends 11:59 pm</Text>
          </View>
          <Text style={styles.incentiveTitle}>Complete 10 deliveries today · earn ₹300 extra</Text>
          <View style={styles.incentiveTrack}>
            <View style={styles.incentiveFill} />
          </View>
          <Text style={styles.incentiveMeta}>8 of 10 done · 2 more deliveries</Text>
        </Pressable>

        {/* ── Shortcuts ──────────────────────────────────────────────── */}
        <View style={styles.quickGrid}>
          <Btn
            label="Earnings"
            variant="accent"
            onPress={() => router.push("/earnings")}
            style={{ flex: 1 }}
          />
          <Btn
            label="Get help"
            variant="accent"
            onPress={() => router.push("/support")}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + ms(8)} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: ms(26) },

  header: { flexDirection: "row", alignItems: "center", gap: ms(12) },
  name: { ...font.heading, fontSize: ms(19), lineHeight: ms(21), color: colors.text },
  rating: {
    ...font.body,
    fontSize: ms(12),
    lineHeight: ms(16),
    color: colors.neutral700,
    fontVariant: ["tabular-nums"],
  },
  bell: {
    width: ms(40),
    height: ms(40),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    top: ms(7),
    right: ms(8),
    width: ms(7),
    height: ms(7),
    borderRadius: radius.pill,
    backgroundColor: colors.err,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },

  statusCard: {
    marginTop: ms(18),
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: ms(18),
    paddingTop: ms(20),
    paddingBottom: ms(18),
    overflow: "hidden",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: ms(9) },
  dotWrap: { width: ms(9), height: ms(9), alignItems: "center", justifyContent: "center" },
  dot: { width: ms(9), height: ms(9), borderRadius: radius.pill },
  statusLabel: {
    ...font.bodySemi,
    fontSize: ms(10),
    letterSpacing: ms(10) * 0.16,
    textTransform: "uppercase",
  },
  statusHead: {
    ...font.headingBold,
    fontSize: ms(30),
    lineHeight: ms(32),
    letterSpacing: -0.3,
    color: colors.text,
    marginTop: ms(10),
  },
  statusSub: {
    ...font.body,
    fontSize: ms(13.5),
    lineHeight: ms(20),
    color: colors.neutral700,
    marginTop: ms(5),
    maxWidth: ms(250),
  },
  radar: {
    marginTop: ms(16),
    height: ms(74),
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  radarCore: {
    position: "absolute",
    top: ms(24),
    width: ms(9),
    height: ms(9),
    borderRadius: radius.pill,
    backgroundColor: colors.ok,
  },
  radarRing: { top: ms(-32) },
  radarLabel: {
    position: "absolute",
    bottom: 2,
    ...font.bodySemi,
    fontSize: ms(10),
    letterSpacing: ms(10) * 0.14,
    textTransform: "uppercase",
    color: colors.ok,
  },
  onlineFor: {
    textAlign: "center",
    ...font.body,
    fontSize: ms(11.5),
    color: colors.neutral600,
    marginTop: ms(9),
  },

  activeCard: {
    marginTop: ms(16),
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  activeHead: {
    backgroundColor: colors.ink,
    paddingHorizontal: ms(14),
    paddingVertical: ms(9),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  activeHeadLabel: {
    ...font.bodySemi,
    fontSize: ms(9.5),
    letterSpacing: ms(9.5) * 0.16,
    textTransform: "uppercase",
    color: colors.bg,
  },
  activeHeadId: {
    ...font.bodySemi,
    fontSize: ms(9.5),
    letterSpacing: ms(9.5) * 0.1,
    color: colors.bg,
    fontVariant: ["tabular-nums"],
  },
  activeBody: { padding: ms(14), flexDirection: "row", gap: ms(12), alignItems: "center" },
  activeStage: {
    ...font.bodySemi,
    fontSize: ms(10),
    letterSpacing: ms(10) * 0.14,
    textTransform: "uppercase",
    color: colors.accent700,
  },
  activeName: {
    ...font.heading,
    fontSize: ms(18),
    lineHeight: ms(21),
    color: colors.text,
    marginTop: ms(6),
  },
  activeMeta: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(17),
    color: colors.neutral700,
    fontVariant: ["tabular-nums"],
  },

  statGrid: { flexDirection: "row", gap: ms(9), marginTop: ms(16) },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    paddingHorizontal: ms(10),
    paddingVertical: ms(12),
    backgroundColor: colors.neutral100,
  },
  statNum: {
    ...font.headingBold,
    fontSize: ms(27),
    lineHeight: ms(29),
    letterSpacing: -0.3,
    marginTop: ms(8),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },

  incentive: {
    marginTop: ms(16),
    borderWidth: 1,
    borderColor: colors.divider,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    borderRadius: radius.lg,
    padding: ms(14),
    backgroundColor: colors.neutral100,
  },
  incentiveHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  incentiveEnds: {
    ...font.body,
    fontSize: ms(12),
    color: colors.neutral600,
    fontVariant: ["tabular-nums"],
  },
  incentiveTitle: {
    ...font.heading,
    fontSize: ms(17),
    lineHeight: ms(21),
    color: colors.text,
    marginTop: ms(7),
  },
  incentiveTrack: {
    marginTop: ms(11),
    height: ms(5),
    borderRadius: 3,
    backgroundColor: colors.neutral300,
    overflow: "hidden",
  },
  incentiveFill: { width: "80%", height: "100%", backgroundColor: colors.accent },
  incentiveMeta: {
    ...font.body,
    fontSize: ms(12),
    color: colors.neutral700,
    marginTop: ms(7),
    fontVariant: ["tabular-nums"],
  },

  quickGrid: { flexDirection: "row", gap: ms(9), marginTop: ms(16) },
});
