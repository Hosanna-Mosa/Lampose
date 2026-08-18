import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Bar, Btn, Chip, Icon, Sheet, Text, Toast, TopBar } from "@/components/ui";
import { DRIVER, STAGES, STATUS, STATUS_ONLINE_IDLE } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, elevation, layout, radius, space, tone as resolveTone } from "@/theme";

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
          borderWidth: 1.5,
          borderColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.6] }) }],
        },
        style,
      ]}
    />
  );
}

/** White card with an eyebrow and a figure. The one shape a tally takes. */
export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text variant="eyebrow" color="tertiary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="priceHero" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
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
  const statusInk = resolveTone(status.tone);
  const statusLabel = online ? (phase === "noorders" ? "Online · low demand" : "Online") : "Offline";

  return (
    <View style={styles.root}>
      {/*
        Home has no title — who you are IS the header. The rider's name and
        rating stay pinned because the bell beside them is the screen's only
        escape hatch to alerts, and a notification you have to scroll up to
        reach is one you find out about late.
      */}
      <TopBar
        left={
          <View style={styles.identity}>
            <Avatar name={DRIVER.name} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title2" numberOfLines={1}>
                {DRIVER.name}
              </Text>
              <Text variant="numMeta" color="tertiary" numberOfLines={1}>
                {DRIVER.rating}
              </Text>
            </View>
          </View>
        }
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => router.push("/notifications")}
            hitSlop={6}
            style={({ pressed }) => [styles.bell, pressed && { backgroundColor: colors.surfaceSunken }]}
          >
            <Icon name="bell" size={20} color={colors.textPrimary} />
            <View style={styles.bellDot} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Duty ───────────────────────────────────────────────────── */}
        <View
          style={[
            styles.statusCard,
            online
              ? { borderColor: colors.brandOnDark, backgroundColor: colors.brandTint }
              : { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <View style={styles.statusRow}>
            <View style={styles.dotWrap}>
              {online && <PulseRing size={9} color={statusInk.base} duration={1800} />}
              <View style={[styles.dot, { backgroundColor: statusInk.base }]} />
            </View>
            <Text variant="label" style={{ color: statusInk.ink }}>
              {statusLabel}
            </Text>
          </View>

          <Text variant="display1" style={{ marginTop: space[2] }}>
            {status.head}
          </Text>
          <Text variant="bodyLg" color="secondary" style={{ marginTop: space[1], maxWidth: 260 }}>
            {status.sub}
          </Text>

          {searching && (
            <View style={styles.radar}>
              <View style={styles.radarCore} />
              <PulseRing size={120} color={colors.brand} style={styles.radarRing} />
              <PulseRing size={120} color={colors.brand} delay={1200} style={styles.radarRing} />
              <Text variant="label" color="brand" style={styles.radarLabel}>
                Waiting for orders…
              </Text>
            </View>
          )}

          <Btn
            label={online ? "Go offline" : "Go online"}
            variant={online ? "ghost" : "ink"}
            large={!online}
            glyph="power"
            onPress={online ? goOffline : goOnline}
            style={{ marginTop: space[5] }}
          />

          {online && (
            <Text variant="numMeta" color="tertiary" style={styles.onlineFor}>
              Online for 6h 24m · you can go offline any time
            </Text>
          )}
        </View>

        {/* ── Active delivery ────────────────────────────────────────── */}
        {hasActive && (
          <Pressable
            onPress={() => router.push("/active")}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.activeCard,
              pressed && { backgroundColor: colors.surfaceSunken },
            ]}
          >
            <View style={styles.activeHead}>
              <Chip label="Active delivery" tone="brand" glyph="navigate" />
              <Text variant="numMeta" color="tertiary">
                #LP48291
              </Text>
            </View>
            <View style={styles.activeBody}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text variant="label" color="brand">
                  {STAGES[stage]}
                </Text>
                <Text variant="title1" numberOfLines={1}>
                  Paradise Biryani
                </Text>
                <Text variant="numMeta" color="tertiary" numberOfLines={1}>
                  4.8 km · ETA 18 min · ₹86
                </Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.textTertiary} />
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
          accessibilityRole="button"
          style={({ pressed }) => [styles.incentive, pressed && { backgroundColor: colors.surfaceSunken }]}
        >
          <View style={styles.incentiveHead}>
            <Chip label="Today's incentive" tone="warning" glyph="trendingUp" />
            <Text variant="numMeta" color="tertiary">
              Ends 11:59 pm
            </Text>
          </View>
          <Text variant="title1" style={{ marginTop: space[3] }}>
            Complete 10 deliveries today · earn ₹300 extra
          </Text>
          <Bar pct={80} style={{ marginTop: space[3] }} />
          <Text variant="numMeta" color="tertiary" style={{ marginTop: space[2] }}>
            8 of 10 done · 2 more deliveries
          </Text>
        </Pressable>

        {/* ── Shortcuts ──────────────────────────────────────────────── */}
        <View style={styles.quickGrid}>
          <Btn
            label="Earnings"
            variant="accent"
            glyph="earnings"
            onPress={() => router.push("/earnings")}
            style={{ flex: 1 }}
          />
          <Btn
            label="Get help"
            variant="accent"
            glyph="support"
            onPress={() => router.push("/support")}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingTop: space[4], paddingBottom: space[6], gap: space[4] },

  identity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space[2] },
  bell: {
    width: 40,
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    top: 7,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.danger.base,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },

  statusCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: space[4],
    overflow: "hidden",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  dotWrap: { width: 9, height: 9, alignItems: "center", justifyContent: "center" },
  dot: { width: 9, height: 9, borderRadius: radius.pill },

  radar: {
    marginTop: space[4],
    height: 76,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.brandOnDark,
    alignItems: "center",
    justifyContent: "center",
  },
  radarCore: {
    position: "absolute",
    top: 24,
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  radarRing: { top: -32 },
  radarLabel: { position: "absolute", bottom: 2 },
  onlineFor: { textAlign: "center", marginTop: space[2] },

  activeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
    gap: space[3],
    ...elevation.raised,
  },
  activeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[2] },
  activeBody: { flexDirection: "row", gap: space[3], alignItems: "center" },

  statGrid: { flexDirection: "row", gap: space[2] },
  statCard: {
    flex: 1,
    gap: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    backgroundColor: colors.surface,
  },

  incentive: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
    backgroundColor: colors.surface,
  },
  incentiveHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[2] },

  quickGrid: { flexDirection: "row", gap: space[2] },
});
