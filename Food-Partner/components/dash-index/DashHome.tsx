/* ══════════════════════════════════════════════════════════════════════════
   Food Partner Dashboard Home — Redesigned layout matching reference UI.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Note, Refresher, Scroller, Tappable } from "@/components/common";
import { Icon, Text } from "@/components/common";
import {
  getMe,
  listMyOrders,
  listMyProducts,
  setAvailability,
  setMissingLocation,
  type ServerProduct,
  type ServerRestaurant,
} from "@/services/foodPartner";
import { listTickets } from "@/services/support";
import { usePartnerStore } from "@/store/partnerStore";
import { NotificationsModal } from "./NotificationsModal";

// Default biryani avatar image URL matching reference screenshot

export function DashHome() {
  const insets = useSafeAreaInsets();
  const session = usePartnerStore((s) => s.session);
  const syncFromServer = usePartnerStore((s) => s.syncFromServer);

  const [me, setMe] = useState<ServerRestaurant | null>(null);
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  const load = useCallback(async () => {
    if (!session?.token) {
      setLoading(false);
      setError("You are signed out. Sign in again to continue.");
      return;
    }
    setError("");
    try {
      const [restaurant, menu] = await Promise.all([
        getMe(session.token),
        listMyProducts(session.token),
      ]);
      setMe(restaurant);
      setProducts(menu);
      syncFromServer({
        restaurantId: restaurant.restaurantId,
        restaurantName: restaurant.restaurantName,
        verificationStatus: restaurant.verificationStatus,
        verificationNote: restaurant.verificationNote,
      });

      /* The SAME count the list shows: unread support replies, orders still
         waiting to be accepted, and a status that needs action. The bell
         counted tickets alone, so it said 0 over a list showing three. */
      try {
        const [tickets, waiting] = await Promise.all([
          listTickets(session.token),
          listMyOrders(session.token, "placed"),
        ]);
        const needsAction = restaurant.verificationStatus === "rejected"
          || (restaurant.verificationStatus === "approved" && restaurant.isActive === false);
        setUnreadNotifications(
          (tickets.unread || 0) + Math.min(waiting.data.length, 10) + (needsAction ? 1 : 0),
        );
      } catch (e) {
        setUnreadNotifications(0);
      }
    } catch (err) {
      setError((err as Error)?.message || "We could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [session?.token, syncFromServer]);

  /* The pull's own flag. `loading` is set true only on mount, so a pull
     started a load with the spinner already off — it vanished at once and
     the partner could not tell whether anything had been fetched. */
  const [refreshing, setRefreshing] = useState(false);
  const pull = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const changeOpenState = async (next: "auto" | "open" | "closed") => {
    if (!session?.token || !me) return;
    const previous = me.openState;
    setMe({ ...me, openState: next });
    setSaving(true);
    try {
      const updated = await setAvailability(session.token, next);
      /* Merged, not replaced: this endpoint answers with three fields
         (`openState`, `isCurrentlyOpen`, `restaurantId`), and swapping the
         whole restaurant for them blanked the name, approval, prep time and
         radius until the next reload — an approved kitchen read "not
         approved yet". Only the two fields this call can change are taken. */
      setMe((current) =>
        current
          ? {
              ...current,
              openState: updated?.openState ?? next,
              isCurrentlyOpen: updated?.isCurrentlyOpen ?? current.isCurrentlyOpen,
            }
          : current,
      );
    } catch (err) {
      setMe({ ...me, openState: previous });
      setError((err as Error)?.message || "That did not save.");
    } finally {
      setSaving(false);
    }
  };

  /*
   * No map pin, no riders: dispatch searches from this point, and a kitchen
   * without one sat "unassigned" on every order. The pin used to be optional
   * at onboarding with no way to add it later, so this is that way.
   */
  const [pinning, setPinning] = useState(false);
  const hasPin = !!me?.location?.coordinates?.length;
  const dropPin = async () => {
    if (!session?.token || pinning) return;
    setPinning(true);
    setError("");
    try {
      const Location = await import("expo-location");
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Location access was declined. Allow it in Settings, then stand at the restaurant and try again.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const location = await setMissingLocation(session.token, pos.coords.latitude, pos.coords.longitude);
      setMe((current) =>
        current
          ? { ...current, location: location ?? { type: "Point", coordinates: [pos.coords.longitude, pos.coords.latitude] } }
          : current,
      );
    } catch (err) {
      setError((err as Error)?.message || "We could not save the pin. Try again.");
    } finally {
      setPinning(false);
    }
  };

  const unavailable = products.filter((p) => !p.isAvailable).length;
  const onSchedule = !me?.openState || me.openState === "auto";
  const openNow = me?.isCurrentlyOpen;
  /* This kitchen's own name, id and logo — or nothing while they load. Every
     kitchen used to be shown "Paradise Biryani House", a sample id, a stock
     photo and a "Verified Partner" badge, approved or not. */
  const restaurantName = me?.restaurantName || session?.restaurantName || "";
  const restaurantId = me?.restaurantId || session?.restaurantId || "";
  const logoUrl = me?.logoImage?.url || "";
  const approved = me?.verificationStatus === "approved";
  const heroTitle = !approved ? "Not live yet" : openNow ? "Taking orders" : "Not taking orders";
  const heroDescription = !approved
    ? "Diners cannot see your restaurant until it is approved."
    : openNow
      ? "Your restaurant is live and visible to customers"
      : "You are closed right now, so diners cannot order."; 

  return (
    <Box style={{ flex: 1, backgroundColor: "#F4F6F8" }}>
      {/* ── TOP HEADER ────────────────────────────────────────────────── */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.headerLeft}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { alignItems: "center", justifyContent: "center", backgroundColor: "#D1FAE5" }]}>
              <Text style={{ fontWeight: "700", color: "#047857" }}>{(restaurantName || "?").charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {restaurantName}
            </Text>
            <View style={styles.subRow}>
              <Text style={styles.headerSub}>{restaurantId}</Text>
              {approved && (
                <View style={styles.verifiedBadge}>
                  <Icon name="check" size={12} color="#059669" strokeWidth={2.5} />
                  <Text style={styles.verifiedText}>Verified Partner</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Pressable style={styles.iconCircleButton} onPress={() => setShowNotificationsModal(true)}>
            <Icon name="bell" size={20} color="#374151" />
            {unreadNotifications > 0 && <View style={styles.redBadgeDot} />}
          </Pressable>
        </View>
      </View>

      <Scroller
        contentContainerStyle={styles.scrollBody}
        refreshControl={<Refresher refreshing={refreshing} onRefresh={pull} />}
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}

        {!!me && !hasPin && (
          <Tappable accessibilityRole="button" onPress={dropPin} disabled={pinning}>
            <Note tone="bad">
              {pinning
                ? "Saving your pin..."
                : "Your restaurant has no map pin, so no rider can be sent for your orders. Stand at the restaurant and tap here to drop it."}
            </Note>
          </Tappable>
        )}

        {me?.verificationStatus !== "approved" && !!me && (
          <Tappable accessibilityRole="button" onPress={() => router.push("/status")}>
            <Note tone="warn">
              This restaurant is not approved yet, so it is not shown to diners. Tap to see where the
              application has got to.
            </Note>
          </Tappable>
        )}

        {/* ── HERO RESTAURANT STATUS CARD ────────────────────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <Text style={styles.heroSubHeader}>RESTAURANT STATUS</Text>
            <Pressable
              style={styles.openNowDropdown}
              onPress={() => changeOpenState(me?.openState === "open" ? "closed" : "open")}
              accessibilityRole="button"
              accessibilityLabel={openNow ? "Open now. Tap to close" : "Closed. Tap to open"}
            >
              <Icon name={openNow ? "check" : "clock"} size={14} color="#047857" strokeWidth={2.5} />
              <Text style={styles.dropdownText}>{openNow ? "OPEN NOW" : "CLOSED"}</Text>
            </Pressable>
          </View>

          <Text style={styles.heroTitle}>{heroTitle}</Text>
          <Text style={styles.heroDescription}>{heroDescription}</Text>

          {/* Segment Selector Row */}
          <View style={styles.segmentWrapper}>
            <View style={styles.segmentContainer}>
              {/* The way back to the opening hours. Without it, one manual
                  Open or Closed pinned the kitchen to that choice for good. */}
              <Pressable
                style={[styles.segBtn, onSchedule && styles.segBtnActive]}
                onPress={() => changeOpenState("auto")}
              >
                <Text style={[styles.segText, onSchedule && styles.segTextActive]}>Schedule</Text>
              </Pressable>

              <Pressable
                style={[styles.segBtn, me?.openState === "open" && styles.segBtnActive]}
                onPress={() => changeOpenState("open")}
              >
                <Text style={[styles.segText, me?.openState === "open" && styles.segTextActive]}>
                  Open now
                </Text>
              </Pressable>

              <Pressable
                style={[styles.segBtn, me?.openState === "closed" && styles.segBtnActive]}
                onPress={() => changeOpenState("closed")}
              >
                <Text style={[styles.segText, me?.openState === "closed" && styles.segTextActive]}>
                  Closed
                </Text>
              </Pressable>
            </View>

            {/* The kitchen's own logo, or nothing — never a stock photo. */}
            {logoUrl ? (
              <View style={styles.illustrationWrap}>
                <Image source={{ uri: logoUrl }} style={styles.foodIllustration} />
              </View>
            ) : null}
          </View>

          {/* Bottom Info Strip */}
          <View style={styles.heroFooterStrip}>
            <Icon name="clock" size={18} color="#059669" strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.stripTitle}>
                {saving
                  ? "Saving changes..."
                  : onSchedule
                    ? "Following your opening hours."
                    : `Set to ${me?.openState === "open" ? "open" : "closed"} by hand.`}
              </Text>
              <Text style={styles.stripSubtitle}>
                {onSchedule
                  ? "Open and Closed override it until you choose Schedule again."
                  : "Choose Schedule to follow your opening hours again."}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.metricsGrid}>
          {/* Tile 1: On the menu */}
          <Pressable style={[styles.metricCard, { backgroundColor: "#F0FDF4" }]} onPress={() => router.push("/(dash)/menu")}>
            <View style={styles.metricCardHeader}>
              <View style={[styles.metricIconCircle, { backgroundColor: "#DCFCE7" }]}>
                <Icon name="utensils" size={18} color="#16A34A" />
              </View>
              <Text style={styles.metricValue}>{products.length}</Text>
              <View style={{ marginLeft: "auto" }}>
                <Icon name="chevronRight" size={16} color="#9CA3AF" />
              </View>
            </View>
            <Text style={styles.metricLabel}>On the menu</Text>
          </Pressable>

          {/* Tile 2: Out of stock */}
          <Pressable style={[styles.metricCard, { backgroundColor: "#FEF2F2" }]} onPress={() => router.push("/(dash)/menu")}>
            <View style={styles.metricCardHeader}>
              <View style={[styles.metricIconCircle, { backgroundColor: "#FEE2E2" }]}>
                <Icon name="alert" size={18} color="#DC2626" />
              </View>
              <Text style={[styles.metricValue, { color: "#DC2626" }]}>{unavailable}</Text>
              <View style={{ marginLeft: "auto" }}>
                <Icon name="chevronRight" size={16} color="#9CA3AF" />
              </View>
            </View>
            <Text style={styles.metricLabel}>Out of stock</Text>
          </Pressable>

          {/* Tile 3: Prep time — and 4 — open Profile, where both are edited.
              They drew chevrons and did nothing when pressed. */}
          <Pressable style={[styles.metricCard, { backgroundColor: "#F0F9FF" }]} onPress={() => router.push("/(dash)/profile")}>
            <View style={styles.metricCardHeader}>
              <View style={[styles.metricIconCircle, { backgroundColor: "#E0F2FE" }]}>
                <Icon name="clock" size={18} color="#0284C7" />
              </View>
              <Text style={styles.metricValue}>{typeof me?.avgPreparationTime === "number" ? `${me.avgPreparationTime} min` : "Not set"}</Text>
              <View style={{ marginLeft: "auto" }}>
                <Icon name="chevronRight" size={16} color="#9CA3AF" />
              </View>
            </View>
            <Text style={styles.metricLabel}>Prep time</Text>
          </Pressable>

          {/* Tile 4: Delivers */}
          <Pressable style={[styles.metricCard, { backgroundColor: "#FFFBEB" }]} onPress={() => router.push("/(dash)/profile")}>
            <View style={styles.metricCardHeader}>
              <View style={[styles.metricIconCircle, { backgroundColor: "#FEF3C7" }]}>
                <Icon name="truck" size={18} color="#D97706" />
              </View>
              <Text style={styles.metricValue}>{typeof me?.deliveryRadiusKm === "number" ? `${me.deliveryRadiusKm} km` : "Not set"}</Text>
              <View style={{ marginLeft: "auto" }}>
                <Icon name="chevronRight" size={16} color="#9CA3AF" />
              </View>
            </View>
            <Text style={styles.metricLabel}>Delivers</Text>
          </Pressable>

          {/* Tile 6: Rating */}
          <View style={[styles.metricCard, { backgroundColor: "#ECFDF5" }]}>
            <View style={styles.metricCardHeader}>
              <View style={[styles.metricIconCircle, { backgroundColor: "#D1FAE5" }]}>
                <Icon name="star" size={18} color="#059669" />
              </View>
              <Text style={[styles.metricValue, { fontSize: 16 }]}>
                {me?.ratingCount ? `${me.ratingAvg?.toFixed(1)} ★` : "No ratings yet"}
              </Text>
              {/* No chevron: there is no ratings screen to open. */}
            </View>
            <Text style={styles.metricLabel}>Rating</Text>
          </View>
        </View>
      </Scroller>

      <NotificationsModal
        visible={showNotificationsModal}
        onDismiss={() => setShowNotificationsModal(false)}
        onReadCountChange={setUnreadNotifications}
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerSub: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#047857",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconCircleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  redBadgeDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  scrollBody: {
    padding: 16,
    gap: 18,
    paddingBottom: 40,
  },

  /* HERO CARD STYLING */
  heroCard: {
    backgroundColor: "#034527",
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroSubHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.8,
  },
  openNowDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dropdownText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#047857",
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroDescription: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginTop: -4,
  },

  segmentWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 14,
    padding: 4,
    gap: 4,
    flex: 1,
    marginRight: 12,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  segBtnActive: {
    backgroundColor: "#10B981",
  },
  segText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  segTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  illustrationWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
  },
  foodIllustration: {
    width: "100%",
    height: "100%",
  },

  heroFooterStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#E6F4EA",
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
  },
  stripTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#065F46",
  },
  stripSubtitle: {
    fontSize: 11,
    color: "#047857",
  },

  /* SECTION HEADERS */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  viewDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#059669",
  },

  /* METRICS GRID */
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    width: "48%",
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  metricCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metricIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
  },

  /* ACTION GRID */
  actionGrid: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 4,
  },
  actionCard: {
    backgroundColor: "#FFFFFF",
    width: 86,
    height: 90,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
});
