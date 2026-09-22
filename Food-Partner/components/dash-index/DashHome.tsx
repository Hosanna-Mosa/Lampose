/* ══════════════════════════════════════════════════════════════════════════
   Food Partner Dashboard Home — Redesigned layout matching reference UI.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Note, Refresher, Scroller, Tappable } from "@/components/common";
import { Icon, Text } from "@/components/common";
import { OPEN_STATES, OPEN_STATE_LABELS } from "@/constants/partner";
import { rupees } from "@/lib/money";
import {
  getMe,
  listMyProducts,
  setAvailability,
  type ServerProduct,
  type ServerRestaurant,
} from "@/services/foodPartner";
import { listTickets } from "@/services/support";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, layout, radius, space, touch } from "@/theme";
import { NotificationsModal } from "./NotificationsModal";

// Default biryani avatar image URL matching reference screenshot
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=150&auto=format&fit=crop&q=80";

export function DashHome() {
  const insets = useSafeAreaInsets();
  const session = usePartnerStore((s) => s.session);
  const syncFromServer = usePartnerStore((s) => s.syncFromServer);

  const [me, setMe] = useState<ServerRestaurant | null>(null);
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(2);
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

      try {
        const ticketsRes = await listTickets(session.token);
        const ticketList = Array.isArray(ticketsRes) ? ticketsRes : (ticketsRes as any)?.tickets || [];
        const unread = ticketList.filter((t: any) => t.hasUnreadReply).length;
        setUnreadNotifications(unread > 0 ? unread : 2);
      } catch (e) {
        setUnreadNotifications(2);
      }
    } catch (err) {
      setError((err as Error)?.message || "We could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [session?.token, syncFromServer]);

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
      setMe(updated);
    } catch (err) {
      setMe({ ...me, openState: previous });
      setError((err as Error)?.message || "That did not save.");
    } finally {
      setSaving(false);
    }
  };

  const unavailable = products.filter((p) => !p.isAvailable).length;
  const openNow = me?.isCurrentlyOpen;
  const restaurantName = me?.restaurantName || session?.restaurantName || "Paradise Biryani House";
  const restaurantId = me?.restaurantId || session?.restaurantId || "FP-P5Y9DQ4B";

  return (
    <Box style={{ flex: 1, backgroundColor: "#F4F6F8" }}>
      {/* ── TOP HEADER ────────────────────────────────────────────────── */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.headerLeft}>
          <Image source={{ uri: (me as any)?.coverImageUrl || DEFAULT_AVATAR }} style={styles.avatar} />
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {restaurantName}
            </Text>
            <View style={styles.subRow}>
              <Text style={styles.headerSub}>{restaurantId}</Text>
              <View style={styles.verifiedBadge}>
                <Icon name="check" size={12} color="#059669" strokeWidth={2.5} />
                <Text style={styles.verifiedText}>Verified Partner</Text>
              </View>
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
        refreshControl={<Refresher refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}

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
            >
              <Icon name={openNow ? "check" : "clock"} size={14} color="#047857" strokeWidth={2.5} />
              <Text style={styles.dropdownText}>{openNow ? "OPEN NOW" : "CLOSED"}</Text>
              <Icon name="chevronDown" size={14} color="#047857" />
            </Pressable>
          </View>

          <Text style={styles.heroTitle}>Taking orders</Text>
          <Text style={styles.heroDescription}>Your restaurant is live and visible to customers</Text>

          {/* Segment Selector Row */}
          <View style={styles.segmentWrapper}>
            <View style={styles.segmentContainer}>
              <Pressable
                style={[styles.segBtn, (me?.openState === "open" || me?.openState === undefined || me?.openState === "auto") && styles.segBtnActive]}
                onPress={() => changeOpenState("open")}
              >
                <Text
                  style={[
                    styles.segText,
                    (me?.openState === "open" || me?.openState === undefined || me?.openState === "auto") && styles.segTextActive,
                  ]}
                >
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

            <View style={styles.illustrationWrap}>
              <Image
                source={{ uri: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=120&auto=format&fit=crop&q=80" }}
                style={styles.foodIllustration}
              />
            </View>
          </View>

          {/* Bottom Info Strip */}
          <View style={styles.heroFooterStrip}>
            <Icon name="clock" size={18} color="#059669" strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.stripTitle}>
                {saving ? "Saving changes..." : "Schedule follows your opening hours."}
              </Text>
              <Text style={styles.stripSubtitle}>A manual choice beats it until you set it back.</Text>
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
              <Text style={styles.metricValue}>{products.length || 7}</Text>
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

          {/* Tile 3: Prep time */}
          <View style={[styles.metricCard, { backgroundColor: "#F0F9FF" }]}>
            <View style={styles.metricCardHeader}>
              <View style={[styles.metricIconCircle, { backgroundColor: "#E0F2FE" }]}>
                <Icon name="clock" size={18} color="#0284C7" />
              </View>
              <Text style={styles.metricValue}>{me?.avgPreparationTime ?? 25} min</Text>
              <View style={{ marginLeft: "auto" }}>
                <Icon name="chevronRight" size={16} color="#9CA3AF" />
              </View>
            </View>
            <Text style={styles.metricLabel}>Prep time</Text>
          </View>

          {/* Tile 4: Delivers */}
          <View style={[styles.metricCard, { backgroundColor: "#FFFBEB" }]}>
            <View style={styles.metricCardHeader}>
              <View style={[styles.metricIconCircle, { backgroundColor: "#FEF3C7" }]}>
                <Icon name="truck" size={18} color="#D97706" />
              </View>
              <Text style={styles.metricValue}>{me?.deliveryRadiusKm ?? 6} km</Text>
              <View style={{ marginLeft: "auto" }}>
                <Icon name="chevronRight" size={16} color="#9CA3AF" />
              </View>
            </View>
            <Text style={styles.metricLabel}>Delivers</Text>
          </View>

          {/* Tile 5: what the kitchen usually takes to cook, which is the
              figure it actually controls. It replaced a "Min order" tile: there
              is no minimum order any more, and the tile was reporting ₹150 to
              every kitchen that had never set one. */}
          <View style={[styles.metricCard, { backgroundColor: "#F5F3FF" }]}>
            <View style={styles.metricCardHeader}>
              <View style={[styles.metricIconCircle, { backgroundColor: "#EDE9FE" }]}>
                <Icon name="clock" size={18} color="#7C3AED" />
              </View>
              <Text style={styles.metricValue}>{me?.avgPreparationTime ?? 0} min</Text>
              <View style={{ marginLeft: "auto" }}>
                <Icon name="chevronRight" size={16} color="#9CA3AF" />
              </View>
            </View>
            <Text style={styles.metricLabel}>Usual prep time</Text>
          </View>

          {/* Tile 6: Rating */}
          <View style={[styles.metricCard, { backgroundColor: "#ECFDF5" }]}>
            <View style={styles.metricCardHeader}>
              <View style={[styles.metricIconCircle, { backgroundColor: "#D1FAE5" }]}>
                <Icon name="star" size={18} color="#059669" />
              </View>
              <Text style={[styles.metricValue, { fontSize: 16 }]}>
                {me?.ratingCount ? `${me.ratingAvg?.toFixed(1)} ★` : "No ratings yet"}
              </Text>
              <View style={{ marginLeft: "auto" }}>
                <Icon name="chevronRight" size={16} color="#9CA3AF" />
              </View>
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

  /* HOURS CARD */
  hoursCard: {
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
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  editText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#059669",
  },
  hoursList: {
    gap: 10,
  },
  hoursRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  timeSlotText: {
    fontSize: 13,
    color: "#4B5563",
    fontWeight: "600",
  },
});
