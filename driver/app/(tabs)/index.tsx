import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type MapView from "react-native-maps";
import {
  Avatar,
  Btn,
  Chip,
  Icon,
  IncentiveBagGraphic,
  MapPanel,
  Notice,
  ScooterRiderGraphic,
  Sheet,
  Toast,
} from "@/components/ui";
import { STAGES, STATUS, STATUS_ONLINE_IDLE } from "@/constants/lampose";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { useSheet } from "@/hooks/useSheet";
import { LOCATION_HEARTBEAT_MS, selectStage, useDriverStore } from "@/store/driverStore";
import { useFlowStore } from "@/store/flowStore";
import { colors, elevation, layout, radius, space, tone as resolveTone, type ToneName } from "@/theme";

/** Format minutes into "00h 00m" double-digit format matching reference UI mockup. */
export function formatOnline(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const hStr = String(hours).padStart(2, "0");
  const mStr = String(rest).padStart(2, "0");
  return `${hStr}h ${mStr}m`;
}

/** Clean StatCard component matching reference mockup with green icon badge and title-case labels. */
export function StatCard({
  iconName,
  value,
  label,
}: {
  iconName?: "package" | "rupee" | "clock" | "star";
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statCard}>
      {!!iconName && (
        <View style={styles.statIconBadge}>
          <Icon name={iconName} size={18} color="#059669" />
        </View>
      )}
      <RNText style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </RNText>
      <RNText style={styles.statLabel} numberOfLines={1}>
        {label}
      </RNText>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say, clearToast } = useFlowStore();
  const sheet = useSheet();

  const profile = useDriverStore((s) => s.profile);
  const online = useDriverStore((s) => s.isOnline);
  const togglingDuty = useDriverStore((s) => s.togglingDuty);
  const dutyNote = useDriverStore((s) => s.dutyNote);
  const setOnline = useDriverStore((s) => s.setOnline);
  const offer = useDriverStore((s) => s.offer);
  const currentJob = useDriverStore((s) => s.currentJob);
  const earnings = useDriverStore((s) => s.earnings);
  const fetchEarnings = useDriverStore((s) => s.fetchEarnings);
  const pushLocation = useDriverStore((s) => s.pushLocation);
  const locationStale = useDriverStore((s) => s.locationStale);
  const jobEndedNote = useDriverStore((s) => s.jobEndedNote);
  const clearJobEndedNote = useDriverStore((s) => s.clearJobEndedNote);
  const refreshProfile = useDriverStore((s) => s.refreshProfile);

  const [mapType, setMapType] = useState<"standard" | "satellite">("standard");
  const mapRef = useRef<MapView | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { location, heading, permissionDenied, addressLabel, fetching, refreshLocation } = useDriverLocation();

  const headingRef = useRef<number | null>(null);
  headingRef.current = heading ?? null;

  /* Animated Transition Values */
  const dutyAnim = useRef(new Animated.Value(online ? 1 : 0)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const pulseRingAnim = useRef(new Animated.Value(0)).current;

  /* Full Screen Overlay Animation Values */
  const [transitionOverlay, setTransitionOverlay] = useState<{
    visible: boolean;
    targetOnline: boolean;
  }>({ visible: false, targetOnline: false });

  const fullScreenOpacity = useRef(new Animated.Value(0)).current;
  const fullScreenScale = useRef(new Animated.Value(0.85)).current;
  const transitionRadar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(dutyAnim, {
      toValue: online ? 1 : 0,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [online, dutyAnim]);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (online) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseRingAnim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseRingAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    } else {
      pulseRingAnim.setValue(0);
    }
    return () => loop?.stop();
  }, [online, pulseRingAnim]);

  useEffect(() => {
    refreshProfile().catch(() => {});
  }, [refreshProfile]);

  useEffect(() => {
    if (!online || !location) return;
    pushLocation(location.lat, location.lng, headingRef.current ?? undefined);

    const beat = setInterval(
      () => pushLocation(location.lat, location.lng, headingRef.current ?? undefined),
      LOCATION_HEARTBEAT_MS,
    );
    return () => clearInterval(beat);
  }, [online, location, pushLocation]);

  useEffect(() => {
    fetchEarnings().catch(() => {});
  }, [fetchEarnings]);

  useEffect(() => {
    if (offer) router.push("/request");
  }, [offer]);

  const hasActive = !!currentJob;
  const searching = online && !offer && !hasActive;
  const stage = selectStage(currentJob);
  const phase = hasActive ? "active" : online ? "searching" : "idle";

  useEffect(() => {
    if (!toast) return;
    toastTimer.current = setTimeout(clearToast, 2600);
    return () => clearTimeout(toastTimer.current ?? undefined);
  }, [toast, clearToast]);

  const status = online && !hasActive && !searching ? STATUS_ONLINE_IDLE : STATUS[phase];

  useEffect(() => {
    if (!jobEndedNote) return;
    say(jobEndedNote);
    clearJobEndedNote();
  }, [jobEndedNote, say, clearJobEndedNote]);

  const blocked = !!profile && !profile.canGoOnline;
  const blockedReason = profile?.blockedReason ?? "";
  const hasRejectedDocument = !!profile?.documents?.some((doc) => doc.status === "rejected");

  const locationFault: { tone: ToneName; title: string; body: string; settings?: boolean } | null =
    permissionDenied
      ? {
          tone: "danger",
          title: "Location is off",
          body: "We match you to restaurants by where you are, so no delivery can be offered to you until you allow location — however long you stay online.",
          settings: true,
        }
      : online && !location
        ? {
            tone: "info",
            title: "Finding your position",
            body: "Your first GPS fix has not arrived yet. Offers start reaching you once it does.",
          }
        : online && locationStale
          ? {
              tone: "warning",
              title: "We cannot see where you are",
              body: "Your position has not reached us for five minutes, and a rider we cannot place is left out of every search. Check your signal.",
            }
          : null;

  const openLocationSettings = () => {
    Linking.openSettings().catch(() =>
      say("Open your phone's Settings, find Lampose Driver, and allow location."),
    );
  };

  const toggleDuty = async () => {
    const targetOnline = !online;

    // Show full-screen overlay transition
    setTransitionOverlay({ visible: true, targetOnline });
    fullScreenOpacity.setValue(0);
    fullScreenScale.setValue(0.85);

    Animated.parallel([
      Animated.timing(fullScreenOpacity, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
      Animated.spring(fullScreenScale, {
        toValue: 1,
        friction: 5,
        tension: 45,
        useNativeDriver: true,
      }),
    ]).start();

    // Radar loop inside full screen overlay
    const radarLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(transitionRadar, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(transitionRadar, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    radarLoop.start();

    // Button spring bounce
    Animated.sequence([
      Animated.timing(buttonScaleAnim, {
        toValue: 0.92,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(buttonScaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      await setOnline(targetOnline);
      const note = useDriverStore.getState().dutyNote;
      if (note) {
        say(note);
      } else {
        say(targetOnline ? "You are now online! Looking for nearby orders 🚀" : "You are now offline.");
      }
    } catch (err) {
      const payload = (err as { payload?: { message?: string } } | null)?.payload;
      say(payload?.message || (err as Error)?.message || "We could not change your status.");
    } finally {
      setTimeout(() => {
        Animated.timing(fullScreenOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => {
          radarLoop.stop();
          setTransitionOverlay((prev) => ({ ...prev, visible: false }));
        });
      }, 2400);
    }
  };

  const handleRecenter = async () => {
    say("Fetching your real location...");
    const freshCoords = await refreshLocation();
    const target = freshCoords || location;
    if (target && mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: { latitude: target.lat, longitude: target.lng },
          zoom: 16,
        },
        { duration: 500 },
      );
      if (online) {
        pushLocation(target.lat, target.lng, headingRef.current ?? undefined);
      }
      say("Centered to real location");
    } else if (permissionDenied) {
      say("Location permission denied. Please allow location in settings.");
    } else {
      say("Unable to acquire GPS fix");
    }
  };

  const toggleLayers = () => {
    const nextType = mapType === "standard" ? "satellite" : "standard";
    setMapType(nextType);
    say(`Switched map to ${nextType} view`);
  };

  const driverCity = addressLabel || profile?.city || profile?.address?.city || "Rajahmundry, Andhra Pradesh";
  const driverPlate = profile?.vehicle?.plate || profile?.driverId || "";
  const driverName = profile?.name || "Rider";
  const driverRating = ((profile as any)?.rating ?? 5.0).toFixed(1);

  /* Color & Style Interpolations */
  const headerBgColor = dutyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#f3f4f6", "#ecfdf5"],
  });

  const headerBadgeBg = dutyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#e5e7eb", "#d1fae5"],
  });

  const headerBadgeText = dutyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#4b5563", "#047857"],
  });

  const heroTitleColor = dutyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#374151", "#064e3b"],
  });

  const heroEyebrowColor = dutyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#6b7280", "#059669"],
  });

  const dutyCardBg = dutyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#ecfdf5", "#fef2f2"],
  });

  const dutyCardBorder = dutyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#a7f3d0", "#fecaca"],
  });

  const dutyBtnText = dutyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#047857", "#dc2626"],
  });

  return (
    <View style={styles.root}>
      {/* ── Top Header Bar with Smooth Animated Color Transition ─────── */}
      <Animated.View
        style={[
          styles.headerContainer,
          { paddingTop: Math.max(insets.top, 12), backgroundColor: headerBgColor },
        ]}
      >
        <View style={styles.headerLeft}>
          <Avatar name={driverName} size={42} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <View style={styles.nameRow}>
              <RNText style={styles.driverNameText} numberOfLines={1}>
                {driverName}
              </RNText>
              <Animated.View style={[styles.statusBadge, { backgroundColor: headerBadgeBg }]}>
                <View style={[styles.statusDot, { backgroundColor: online ? "#059669" : "#6b7280" }]} />
                <Animated.Text style={[styles.statusBadgeText, { color: headerBadgeText }]}>
                  {online ? "Online" : "Offline"}
                </Animated.Text>
              </Animated.View>
            </View>
            <RNText style={styles.plateText} numberOfLines={1}>
              {driverPlate}
            </RNText>
          </View>
        </View>

        {/* Top Right Actions */}
        <View style={styles.headerRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => say("No new notifications")}
            style={styles.iconCircleBtn}
          >
            <Icon name="bell" size={18} color="#1f2937" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push("/settings")}
            style={styles.iconCircleBtn}
          >
            <Icon name="settings" size={18} color="#1f2937" />
          </Pressable>
        </View>
      </Animated.View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Hero Greeting Section ────────────────────────────────────── */}
        <View style={styles.heroSection}>
          <View style={styles.heroTextContainer}>
            <Animated.Text style={[styles.readyEyebrow, { color: heroEyebrowColor }]}>
              {online ? "READY TO DELIVER" : "CURRENTLY OFF DUTY"}
            </Animated.Text>
            <Animated.Text style={[styles.onlineHeaderTitle, { color: heroTitleColor }]}>
              {online ? "You're Online!" : "You're Offline"}
            </Animated.Text>
            <RNText style={styles.subtext}>
              {online ? "Looking for delivery requests near you..." : "Go online to start receiving delivery requests"}
            </RNText>
          </View>
          <ScooterRiderGraphic />
        </View>

        {/* ── Interactive Map Card ────────────────────────────────────── */}
        <View style={styles.mapCard}>
          <MapPanel
            height={250}
            me={location ? [location.lng, location.lat] : null}
            heading={heading}
            mapType={mapType}
            allowPan={true}
            onMapRef={(ref) => {
              mapRef.current = ref;
            }}
          />

          {/* Top-Left Location Selector Pill */}
          <View style={styles.locationPill}>
            <Icon name="mapPin" size={15} color="#1f2937" />
            <RNText style={styles.locationPillText} numberOfLines={1}>
              {driverCity}
            </RNText>
            <Icon name="chevronDown" size={14} color="#6b7280" />
          </View>

          {/* Top-Right "My Location" Button */}
          <Pressable
            accessibilityRole="button"
            onPress={handleRecenter}
            style={({ pressed }) => [styles.myLocationBtn, pressed && styles.pressedBtn]}
          >
            <Icon name="target" size={15} color="#1f2937" />
            <RNText style={styles.myLocationText}>
              My Location
            </RNText>
          </Pressable>

          {/* Right Floating Stack (Layers, Navigate) */}
          <View style={styles.floatingStack}>
            <Pressable
              accessibilityRole="button"
              onPress={toggleLayers}
              style={({ pressed }) => [styles.stackBtn, pressed && styles.pressedBtn]}
            >
              <Icon name="layers" size={18} color="#1f2937" />
              <RNText style={styles.stackLabel}>
                Layers
              </RNText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => (currentJob ? router.push("/active") : handleRecenter())}
              style={({ pressed }) => [styles.stackBtn, pressed && styles.pressedBtn]}
            >
              <Icon name="navigate" size={18} color="#1f2937" />
              <RNText style={styles.stackLabel}>
                Navigate
              </RNText>
            </Pressable>
          </View>

          {/* Bottom Center Status Pill */}
          <View style={styles.bottomStatusPill}>
            <View style={[styles.statusDot, { backgroundColor: online ? "#059669" : "#9ca3af" }]} />
            <RNText style={[styles.bottomStatusText, { color: online ? "#047857" : "#4b5563" }]}>
              {online ? "WAITING FOR ORDERS..." : "YOU ARE OFFLINE"}
            </RNText>
          </View>
        </View>

        {/* ── Stats Grid Cards (4 Cards) ──────────────────────────────── */}
        <View style={styles.statGrid}>
          <StatCard iconName="package" value={String(earnings.todayTrips)} label="Today's Orders" />
          <StatCard iconName="rupee" value={`₹${earnings.today}`} label="Today's Earnings" />
          <StatCard iconName="clock" value={formatOnline(earnings.onlineMinutes)} label="Online Time" />
          <StatCard iconName="star" value={driverRating} label="Rating" />
        </View>

        {/* ── Active Delivery Card ────────────────────────────────────── */}
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
              <RNText style={styles.activeOrderNum}>
                {currentJob?.orderNumber}
              </RNText>
            </View>
            <View style={styles.activeBody}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <RNText style={styles.activeStageText}>
                  {STAGES[stage]}
                </RNText>
                <RNText style={styles.activeAddressText} numberOfLines={1}>
                  {currentJob?.drop.address || "Delivery"}
                </RNText>
                <RNText style={styles.activeSubtext} numberOfLines={1}>
                  {currentJob?.itemCount} item{currentJob?.itemCount === 1 ? "" : "s"} · ₹
                  {currentJob?.earnings}
                  {currentJob && currentJob.collectAmount > 0
                    ? ` · collect ₹${currentJob.collectAmount}`
                    : " · prepaid"}
                </RNText>
              </View>
              <Icon name="chevronRight" size={18} color="#9ca3af" />
            </View>
          </Pressable>
        )}

        {/* ── Duty Action Button ─────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.dutyCard,
            { backgroundColor: dutyCardBg, borderColor: dutyCardBorder },
          ]}
        >
          {blocked && !online && (
            <Notice
              tone="warning"
              glyph="lock"
              title="You cannot go online yet"
              body={blockedReason || undefined}
              style={{ marginBottom: space[3] }}
            />
          )}

          {!!locationFault && (
            <Notice
              tone={locationFault.tone}
              glyph={locationFault.tone === "info" ? "mapPin" : "alert"}
              title={locationFault.title}
              body={locationFault.body}
              style={{ marginBottom: space[3] }}
            />
          )}

          {locationFault?.settings && (
            <Btn
              label="Open location settings"
              variant="accent"
              glyph="settings"
              onPress={openLocationSettings}
              style={{ marginBottom: space[3] }}
            />
          )}

          <Animated.View style={{ transform: [{ scale: buttonScaleAnim }], width: "100%" }}>
            <Pressable
              accessibilityRole="button"
              disabled={togglingDuty || (blocked && !online)}
              onPress={toggleDuty}
              style={({ pressed }) => [
                styles.dutyBtn,
                pressed && styles.pressedDutyBtn,
              ]}
            >
              {/* Animated Power Circle */}
              <View style={styles.powerCircleWrapper}>
                {online && (
                  <Animated.View
                    style={[
                      styles.powerPulseRing,
                      {
                        opacity: pulseRingAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.6, 0],
                        }),
                        transform: [
                          {
                            scale: pulseRingAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 2.2],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                )}
                <View style={[styles.dutyPowerCircle, online ? styles.powerCircleRed : styles.powerCircleGreen]}>
                  <Icon name="power" size={20} color={online ? "#dc2626" : "#059669"} />
                </View>
              </View>

              <Animated.Text style={[styles.dutyBtnText, { color: dutyBtnText }]}>
                {togglingDuty ? "One moment..." : online ? "Go Offline" : blocked ? "Not able to go online" : "Go Online"}
              </Animated.Text>
            </Pressable>
          </Animated.View>

          <RNText style={styles.dutySubtext}>
            {online ? "Tap to stop receiving requests" : "Tap to start receiving requests"}
          </RNText>

          {blocked && !online && hasRejectedDocument && (
            <Btn
              label="Retake your documents"
              variant="quiet"
              glyph="documents"
              onPress={() => router.push("/documents")}
              style={{ marginTop: space[2] }}
            />
          )}
        </Animated.View>

        {/* ── Promotional / Incentive Banner ──────────────────────────── */}
        <View style={styles.promoCard}>
          <View style={styles.promoTextCol}>
            <RNText style={styles.promoTitle}>
              Deliver More{"\n"}Earn More
            </RNText>
            <RNText style={styles.promoSub}>
              Stay online and get more nearby orders
            </RNText>

            {/* Carousel Page Dots */}
            <View style={styles.pageDots}>
              <View style={[styles.dot, styles.activeDot]} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
          </View>
          <IncentiveBagGraphic />
        </View>

        {/* ── Quick Action Shortcuts (Earnings & Help) ─────────────────── */}
        <View style={styles.quickGrid}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/earnings")}
            style={({ pressed }) => [styles.quickCard, pressed && styles.pressedBtn]}
          >
            <View style={styles.quickIconCircle}>
              <Icon name="earnings" size={20} color="#059669" />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <RNText style={styles.quickTitle}>
                Earnings
              </RNText>
              <RNText style={styles.quickSubtext} numberOfLines={1}>
                View your earnings & trips
              </RNText>
            </View>
            <Icon name="chevronRight" size={16} color="#9ca3af" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/support")}
            style={({ pressed }) => [styles.quickCard, pressed && styles.pressedBtn]}
          >
            <View style={styles.quickIconCircle}>
              <Icon name="support" size={20} color="#059669" />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <RNText style={styles.quickTitle}>
                Get Help
              </RNText>
              <RNText style={styles.quickSubtext} numberOfLines={1}>
                24x7 support
              </RNText>
            </View>
            <Icon name="chevronRight" size={16} color="#9ca3af" />
          </Pressable>
        </View>
      </ScrollView>

      {/* ── FULL SCREEN DUTY TRANSITION OVERLAY ────────────────────────── */}
      {transitionOverlay.visible && (
        <Animated.View
          style={[
            styles.fullScreenOverlay,
            {
              opacity: fullScreenOpacity,
              backgroundColor: transitionOverlay.targetOnline ? "#047857" : "#111827",
            },
          ]}
        >
          <Animated.View
            style={[
              styles.fullScreenContent,
              {
                transform: [{ scale: fullScreenScale }],
              },
            ]}
          >
            {/* Expanding Pulsing Waves */}
            <View style={styles.overlayRadarWrap}>
              <Animated.View
                style={[
                  styles.overlayRadarRing,
                  {
                    borderColor: transitionOverlay.targetOnline ? "#34d399" : "#6b7280",
                    opacity: transitionRadar.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.7, 0],
                    }),
                    transform: [
                      {
                        scale: transitionRadar.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 2.6],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <View
                style={[
                  styles.overlayPowerIconBadge,
                  { backgroundColor: transitionOverlay.targetOnline ? "#059669" : "#374151" },
                ]}
              >
                <Icon name="power" size={38} color="#ffffff" />
              </View>
            </View>

            <RNText style={styles.overlayTitleText}>
              {transitionOverlay.targetOnline ? "Going Online!" : "Going Offline..."}
            </RNText>

            <RNText style={styles.overlaySubtext}>
              {transitionOverlay.targetOnline
                ? "Connecting to Lampose Dispatcher...\nSearching for nearby delivery requests 🚀"
                : "Stopping delivery requests.\nRest well & see you soon!"}
            </RNText>

            <View style={{ marginTop: 24, alignItems: "center" }}>
              <ScooterRiderGraphic />
            </View>
          </Animated.View>
        </Animated.View>
      )}

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8faf9" },
  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[2],
    paddingBottom: space[8],
    gap: space[4],
  },

  /* Header Bar */
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: layout.gutter,
    paddingBottom: space[3],
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  driverNameText: {
    fontWeight: "700",
    color: "#064e3b",
    fontSize: 16,
  },
  plateText: {
    color: "#6b7280",
    fontSize: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    ...elevation.card,
  },

  /* Hero Section */
  heroSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space[2],
  },
  heroTextContainer: {
    flex: 1,
    paddingRight: space[2],
  },
  readyEyebrow: {
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  onlineHeaderTitle: {
    fontSize: 24,
    fontWeight: "800",
    marginTop: 2,
  },
  subtext: {
    color: "#4b5563",
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },

  /* Map Card & Overlays */
  mapCard: {
    height: 250,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: colors.surface,
    ...elevation.card,
  },
  locationPill: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    maxWidth: "58%",
    ...elevation.card,
  },
  locationPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1f2937",
    flex: 1,
  },
  myLocationBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    ...elevation.card,
  },
  myLocationText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1f2937",
  },
  floatingStack: {
    position: "absolute",
    right: 12,
    top: 56,
    gap: 8,
    width: 60,
  },
  stackBtn: {
    width: 60,
    height: 50,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#f3f4f6",
    paddingHorizontal: 2,
    ...elevation.card,
  },
  stackLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#4b5563",
    marginTop: 1,
    textAlign: "center",
  },
  bottomStatusPill: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    ...elevation.card,
  },
  bottomStatusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  /* Stats Grid (4 equal transparent items) */
  statGrid: {
    flexDirection: "row",
    gap: space[2],
    paddingVertical: space[1],
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    paddingVertical: space[2],
    paddingHorizontal: 2,
  },
  statIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 17,
    fontWeight: "800",
    color: "#064e3b",
  },
  statLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#4b5563",
    textAlign: "center",
    marginTop: 2,
  },

  /* Active Card */
  activeCard: {
    borderWidth: 1,
    borderColor: "#059669",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: space[4],
    gap: space[3],
    ...elevation.raised,
  },
  activeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[2] },
  activeOrderNum: { fontSize: 12, color: "#6b7280" },
  activeBody: { flexDirection: "row", gap: space[3], alignItems: "center" },
  activeStageText: { fontSize: 13, fontWeight: "700", color: "#059669" },
  activeAddressText: { fontSize: 16, fontWeight: "700", color: "#1f2937" },
  activeSubtext: { fontSize: 12, color: "#6b7280" },

  /* Duty Action Button */
  dutyCard: {
    borderRadius: 20,
    padding: space[4],
    alignItems: "center",
    borderWidth: 1,
  },
  dutyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
    width: "100%",
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
  },
  powerCircleWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  powerPulseRing: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#059669",
  },
  dutyPowerCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  powerCircleGreen: {
    backgroundColor: "#d1fae5",
  },
  powerCircleRed: {
    backgroundColor: "#fee2e2",
  },
  dutyBtnText: {
    fontSize: 17,
    fontWeight: "800",
  },
  dutySubtext: {
    textAlign: "center",
    marginTop: space[2],
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "500",
  },

  /* Promotional / Incentive Banner */
  promoCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#d1fae5",
    borderRadius: 20,
    padding: space[4],
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  promoTextCol: {
    flex: 1,
    paddingRight: space[2],
  },
  promoTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#064e3b",
    lineHeight: 22,
  },
  promoSub: {
    fontSize: 12,
    color: "#047857",
    marginTop: 4,
  },
  pageDots: {
    flexDirection: "row",
    gap: 4,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#a7f3d0",
  },
  activeDot: {
    width: 14,
    backgroundColor: "#059669",
  },

  /* Quick Shortcuts Grid (Transparent Seamless Items) */
  quickGrid: {
    flexDirection: "row",
    gap: space[3],
    paddingVertical: space[1],
  },
  quickCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    backgroundColor: "transparent",
    paddingVertical: space[2],
    paddingHorizontal: space[1],
  },
  quickIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
  },
  quickTitle: {
    fontWeight: "700",
    color: "#1f2937",
    fontSize: 14,
  },
  quickSubtext: {
    fontSize: 11,
    color: "#6b7280",
  },

  /* Full Screen Duty Overlay */
  fullScreenOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  fullScreenContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  overlayRadarWrap: {
    position: "relative",
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  overlayRadarRing: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
  },
  overlayPowerIconBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  overlayTitleText: {
    fontSize: 28,
    fontWeight: "900",
    color: "#ffffff",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  overlaySubtext: {
    fontSize: 14,
    color: "#e5e7eb",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },

  pressedBtn: {
    opacity: 0.75,
  },
  pressedDutyBtn: {
    opacity: 0.85,
  },
});
