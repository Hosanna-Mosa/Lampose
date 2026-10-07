/* ══════════════════════════════════════════════════════════════════════════
   Food Partner — Home.

   Laid out as the Adios partner dashboard: the kitchen's own header, the
   notes that need a tap, the "taking orders" card, the figures two by two and
   the shortcuts a kitchen opens most. Everything on it is read from the
   server; nothing is a sample.
   ══════════════════════════════════════════════════════════════════════════ */
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabBarHeight } from "@/components/dash/organisms/TabBar";
import {
  ActionTile,
  Avatar,
  Badge,
  Card,
  IconButton,
  InfoNote,
  ListRow,
  ScreenShell,
  SectionHeader,
  SegmentedControl,
  StatCard,
  Txt,
  fadeInDown,
  fadeInUp,
  staggerListItem,
} from "@/components/ui";
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
import { font, line, ms, radius, size, ui } from "@/theme/ui";
import { NotificationsModal } from "./NotificationsModal";

const OPEN_STATES = [
  { key: "auto", label: "Schedule" },
  { key: "open", label: "Open now" },
  { key: "closed", label: "Closed" },
] as const;

export function DashHome() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
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
    <ScreenShell
      scroll
      refreshing={refreshing}
      onRefresh={pull}
      contentStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: tabBarHeight }]}
    >
      {/* ── The kitchen ──────────────────────────────────────────────────── */}
      <Animated.View entering={fadeInDown(0)} style={styles.header}>
        <Avatar name={restaurantName || "?"} imageUri={logoUrl} size={ms(52)} />
        <View style={styles.headerTexts}>
          {!!restaurantId && (
            <Txt style={styles.restaurantId} numberOfLines={1}>
              {restaurantId}
            </Txt>
          )}
          <Txt style={styles.outletName} numberOfLines={1}>
            {restaurantName}
          </Txt>
          <View style={styles.badgeRow}>
            {approved && <Badge label="Verified Partner" tone="success" icon="checkmark-circle" />}
          </View>
        </View>
        <IconButton
          icon="notifications-outline"
          accessibilityLabel={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} new` : "Notifications"}
          dot={unreadNotifications > 0}
          onPress={() => setShowNotificationsModal(true)}
        />
      </Animated.View>

      {/* ── What needs a tap ─────────────────────────────────────────────── */}
      {!!error && <InfoNote tone="danger" text={error} style={styles.banner} />}

      {!!me && !hasPin && (
        <Animated.View entering={fadeInUp(20)} style={styles.banner}>
          <ListRow
            card
            icon="location-outline"
            iconColor={ui.error}
            iconBackground={ui.errorSkin}
            label={pinning ? "Saving your pin..." : "No map pin yet"}
            description="Your restaurant has no map pin, so no rider can be sent for your orders. Stand at the restaurant and tap here to drop it."
            descriptionLines={4}
            onPress={dropPin}
            disabled={pinning}
          />
        </Animated.View>
      )}

      {me?.verificationStatus !== "approved" && !!me && (
        <Animated.View entering={fadeInUp(30)} style={styles.banner}>
          <ListRow
            card
            icon="hourglass-outline"
            iconColor={ui.warning}
            iconBackground={ui.warningSkin}
            label="Not approved yet"
            description="This restaurant is not approved yet, so it is not shown to diners. Tap to see where the application has got to."
            descriptionLines={4}
            onPress={() => router.push("/status")}
          />
        </Animated.View>
      )}

      {/* No cover means diners see a plain card with the Lampose mark on it;
          no photos means a restaurant page with nothing to look at. */}
      {!!me && (!me.coverBannerImage?.url || !me.galleryImages?.some((image) => !!image.url)) && (
        <Animated.View entering={fadeInUp(35)} style={styles.banner}>
          <ListRow
            card
            icon="camera-outline"
            iconColor={ui.brandInk}
            iconBackground={ui.brandSkin}
            label={!me.coverBannerImage?.url ? "Add a cover photo" : "Add photos of your restaurant"}
            description="Diners choose by what they can see. Take real photos of your food and your place, or pick them from your gallery."
            descriptionLines={3}
            onPress={() => router.push("/photos")}
          />
        </Animated.View>
      )}

      {/* ── Taking orders ────────────────────────────────────────────────── */}
      <Animated.View entering={fadeInUp(40)} style={styles.banner}>
        <Card bordered elevationLevel="sm" style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View style={[styles.statusIcon, { backgroundColor: openNow ? ui.successSkin : ui.sunken }]}>
              <Ionicons name={openNow ? "storefront" : "storefront-outline"} size={ms(18)} color={openNow ? ui.success : ui.sec} />
            </View>
            <View style={styles.statusTexts}>
              <Txt style={styles.eyebrow}>Restaurant status</Txt>
              <Txt style={styles.heroTitle}>{heroTitle}</Txt>
              <Txt style={styles.heroDescription}>{heroDescription}</Txt>
            </View>
            <Badge
              label={openNow ? "Open now" : "Closed"}
              tone={openNow ? "success" : "neutral"}
              icon={openNow ? "checkmark" : "time-outline"}
              onPress={() => changeOpenState(me?.openState === "open" ? "closed" : "open")}
              accessibilityLabel={openNow ? "Open now. Tap to close" : "Closed. Tap to open"}
            />
          </View>

          {/* The way back to the opening hours. Without it, one manual Open
              or Closed pinned the kitchen to that choice for good. */}
          <SegmentedControl
            segments={OPEN_STATES}
            value={onSchedule ? "auto" : me?.openState}
            onChange={(next) => changeOpenState(next)}
          />

          <View style={styles.strip}>
            <Ionicons name="time-outline" size={18} color={ui.brandInk} />
            <View style={{ flex: 1 }}>
              <Txt style={styles.stripTitle}>
                {saving
                  ? "Saving changes..."
                  : onSchedule
                    ? "Following your opening hours."
                    : `Set to ${me?.openState === "open" ? "open" : "closed"} by hand.`}
              </Txt>
              <Txt style={styles.stripSubtitle}>
                {onSchedule
                  ? "Open and Closed override it until you choose Schedule again."
                  : "Choose Schedule to follow your opening hours again."}
              </Txt>
            </View>
          </View>
        </Card>
      </Animated.View>

      {/* ── Today at a glance ────────────────────────────────────────────── */}
      <View style={styles.statsGrid}>
        <Animated.View entering={staggerListItem(0)} style={styles.row}>
          <StatCard
            icon="restaurant-outline"
            tone="brand"
            label="On the menu"
            value={String(products.length)}
            onPress={() => router.push("/(dash)/menu")}
          />
          <StatCard
            icon="alert-circle-outline"
            tone="error"
            toneValue={unavailable > 0}
            label="Out of stock"
            value={String(unavailable)}
            onPress={() => router.push("/(dash)/menu")}
          />
        </Animated.View>
        {/* Prep time and delivery radius open Profile, where both are edited. */}
        <Animated.View entering={staggerListItem(1)} style={styles.row}>
          <StatCard
            icon="time-outline"
            tone="info"
            label="Prep time"
            value={typeof me?.avgPreparationTime === "number" ? `${me.avgPreparationTime} min` : "Not set"}
            onPress={() => router.push("/(dash)/profile")}
          />
          <StatCard
            icon="bicycle-outline"
            tone="warning"
            label="Delivers"
            value={typeof me?.deliveryRadiusKm === "number" ? `${me.deliveryRadiusKm} km` : "Not set"}
            onPress={() => router.push("/(dash)/profile")}
          />
        </Animated.View>
        {/* No chevron: there is no ratings screen to open. */}
        <Animated.View entering={staggerListItem(2)} style={styles.row}>
          <StatCard
            icon="star-outline"
            tone="success"
            label="Rating"
            value={me?.ratingCount ? `${me.ratingAvg?.toFixed(1)} ★` : "No ratings yet"}
          />
        </Animated.View>
      </View>

      {/* ── Shortcuts ────────────────────────────────────────────────────── */}
      <Animated.View entering={fadeInUp(120)} style={styles.section}>
        <SectionHeader title="Quick actions" />
        <View style={styles.row}>
          <ActionTile icon="receipt" label="Orders" onPress={() => router.navigate("/(dash)/orders")} />
          <ActionTile
            icon="restaurant"
            label="Menu"
            color={ui.warning}
            background={ui.warningSkin}
            onPress={() => router.navigate("/(dash)/menu")}
          />
        </View>
        <View style={[styles.row, styles.rowGap]}>
          <ActionTile
            icon="wallet"
            label="Payouts"
            color={ui.success}
            background={ui.successSkin}
            onPress={() => router.push("/payouts")}
          />
          <ActionTile
            icon="chatbubbles"
            label="Help & support"
            color={ui.info}
            background={ui.infoSkin}
            onPress={() => router.push("/support")}
          />
        </View>
        <View style={[styles.row, styles.rowGap]}>
          <ActionTile icon="images" label="Photos" onPress={() => router.push("/photos")} />
          <ActionTile
            icon="settings"
            label="Dine-in setup"
            color={ui.warning}
            background={ui.warningSkin}
            onPress={() => router.push("/dine-in")}
          />
        </View>
      </Animated.View>

      <NotificationsModal
        visible={showNotificationsModal}
        onDismiss={() => setShowNotificationsModal(false)}
        onReadCountChange={setUnreadNotifications}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16 },
  section: { marginTop: 24 },
  banner: { marginTop: 16 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8, paddingBottom: 4 },
  headerTexts: { flex: 1, minWidth: 0 },
  restaurantId: { fontFamily: font.body.medium, fontSize: size.medium, color: ui.sec },
  outletName: {
    fontFamily: font.heading.bold,
    fontSize: size.extraLarge,
    lineHeight: line.extraLarge,
    letterSpacing: -0.4,
    color: ui.text,
    marginTop: 2,
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },

  statusCard: { gap: 14 },
  statusTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  statusIcon: { width: ms(40), height: ms(40), borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statusTexts: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontFamily: font.body.bold,
    fontSize: size.small,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: ui.muted,
  },
  heroTitle: {
    fontFamily: font.heading.bold,
    fontSize: size.extraLarge,
    lineHeight: line.extraLarge,
    letterSpacing: -0.4,
    color: ui.text,
    marginTop: 4,
  },
  heroDescription: {
    fontFamily: font.body.medium,
    fontSize: size.small,
    lineHeight: line.small,
    color: ui.sec,
    marginTop: 2,
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: ui.brandSkin,
    borderRadius: radius.md,
    padding: 12,
  },
  stripTitle: { fontFamily: font.body.bold, fontSize: size.small, lineHeight: line.small, color: ui.brandInk },
  stripSubtitle: { fontFamily: font.body.medium, fontSize: size.small, lineHeight: line.small, color: ui.sec },

  statsGrid: { gap: 12, marginTop: 20 },
  row: { flexDirection: "row", gap: 12 },
  rowGap: { marginTop: 12 },
});
