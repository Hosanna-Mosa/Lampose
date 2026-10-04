/* ══════════════════════════════════════════════════════════════════════════
   Food Partner — Profile.

   Laid out as the Adios account tab: the kitchen's card at the top, then
   grouped sections — its details, the two editable forms, its credentials,
   the business shortcuts — and sign-out at the foot.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabBarHeight } from "@/components/dash/organisms/TabBar";
import {
  AlertDialog,
  Avatar,
  Badge,
  Button,
  Card,
  IconButton,
  InfoNote,
  ListGroup,
  ListRow,
  ScreenShell,
  ScreenTitle,
  TextField,
  ToggleSwitch,
  Txt,
  fadeInUp,
} from "@/components/ui";
import { getMe, updateMe, type ServerRestaurant } from "@/services/foodPartner";
import { listTickets } from "@/services/support";
import { usePartnerStore } from "@/store/partnerStore";
import { elevation, font, line, ms, radius, size, ui } from "@/theme/ui";

/** The most a kitchen may charge for packaging — `FOOD_PRICING_CONFIG.maxPackagingFee` on the server. */
const MAX_PACKAGING_FEE = 50;


export function DashProfile() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const session = usePartnerStore((s) => s.session);
  const signOut = usePartnerStore((s) => s.signOut);

  const [me, setMe] = useState<ServerRestaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);

  /* Editable operational fields */
  const [prepTime, setPrepTime] = useState("25");
  const [deliveryRadius, setDeliveryRadius] = useState("6");
  /* The packaging fee is the kitchen's own: billed to the diner (with 18%
     GST) and paid to the kitchen in full. Delivery is no longer set here —
     Lampose prices it by distance (`foodPricing.js`), so the old delivery-fee
     editor would have been saving a number nothing reads. There is still no
     minimum order: small carts pay a small-order fee instead. */
  const [packagingFee, setPackagingFee] = useState("");
  const [acceptsOnline, setAcceptsOnline] = useState(true);
  const [acceptsCod, setAcceptsCod] = useState(true);


  /* Editable restaurant details — accepted by PATCH /me since onboarding, but
     with no screen to reach them from after it. The delivery fee is edited
     in Operations above. Business hours are the one `updateMe` field still
     without an editor here — they need the onboarding flow's per-day
     `TimeRange` step, not a text box. */
  const [description, setDescription] = useState("");
  const [cuisineTypesText, setCuisineTypesText] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsNote, setDetailsNote] = useState("");

  const load = useCallback(async () => {
    if (!session?.token) {
      setLoading(false);
      setError("You are signed out. Sign in again to continue.");
      return;
    }
    setError("");
    try {
      const restaurant = await getMe(session.token);
      setMe(restaurant);
      /* The kitchen's own values, or empty — not a pre-filled 25 / 6. */
      setPrepTime(restaurant.avgPreparationTime ? String(restaurant.avgPreparationTime) : "");
      setDeliveryRadius(restaurant.deliveryRadiusKm ? String(restaurant.deliveryRadiusKm) : "");
      setPackagingFee(restaurant.packagingCharge ? String(restaurant.packagingCharge) : "");
      setAcceptsOnline(restaurant.acceptsOnlinePayment ?? true);
      setAcceptsCod(restaurant.acceptsCod ?? true);
      setDescription(restaurant.description ?? "");
      setCuisineTypesText((restaurant.cuisineTypes ?? []).join(", "));
      setContactNumber(restaurant.contactNumber ?? "");

      try {
        const { unread } = await listTickets(session.token);
        setSupportUnread(unread);
      } catch (e) {
        setSupportUnread(0);
      }
    } catch (err) {
      setError((err as Error)?.message || "We could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

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

  const handleSaveOperational = async () => {
    if (!session?.token || !me) return;
    /* Checked and SAID — an empty or mistyped box used to be quietly saved as
       25 minutes and 6 km, numbers the kitchen never chose, and the rider
       search radius is built from both. */
    const prep = Number(prepTime);
    const radius = Number(deliveryRadius);
    if (!Number.isInteger(prep) || prep < 1 || prep > 180) {
      setError("Enter a preparation time between 1 and 180 minutes.");
      return;
    }
    if (!Number.isFinite(radius) || radius < 0.5 || radius > 30) {
      setError("Enter a delivery radius between 0.5 and 30 km.");
      return;
    }
    const packaging = packagingFee.trim() === "" ? 0 : Number(packagingFee);
    if (!Number.isFinite(packaging) || packaging < 0 || packaging > MAX_PACKAGING_FEE) {
      setError(`Enter a packaging fee between ₹0 and ₹${MAX_PACKAGING_FEE}.`);
      return;
    }
    setSaving(true);
    setError("");
    setSavedNote("");
    try {
      const updated = await updateMe(session.token, {
        avgPreparationTime: prep,
        deliveryRadiusKm: radius,
        packagingCharge: Math.round(packaging * 100) / 100,
        acceptsOnlinePayment: acceptsOnline,
        acceptsCod: acceptsCod,
      });
      setMe(updated);
      setSavedNote("Operational settings updated successfully!");
    } catch (err) {
      setError((err as Error)?.message || "Failed to update settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!session?.token || !me) return;
    setSavingDetails(true);
    setDetailsError("");
    setDetailsNote("");
    try {
      const updated = await updateMe(session.token, {
        description: description.trim(),
        cuisineTypes: cuisineTypesText
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        contactNumber: contactNumber.trim(),
      });
      setMe(updated);
      setDetailsNote("Restaurant details updated successfully!");
    } catch (err) {
      setDetailsError((err as Error)?.message || "Failed to update details.");
    } finally {
      setSavingDetails(false);
    }
  };

  /* The kitchen's own details or nothing — see DashHome for what these used
     to fall back to. */
  const restaurantName = me?.restaurantName || session?.restaurantName || "";
  const restaurantId = me?.restaurantId || session?.restaurantId || "";
  const avatarUrl = me?.logoImage?.url || me?.coverBannerImage?.url || "";
  /* Stored as E.164 already ("+919…"), so no second "+91". */
  const ownerPhone = me?.ownerPhone ? (me.ownerPhone.startsWith("+") ? me.ownerPhone : `+91 ${me.ownerPhone}`) : "—";
  const address = [me?.address?.line1, me?.address?.city].filter(Boolean).join(", ") || "—";

  return (
    <ScreenShell
      scroll
      refreshing={refreshing}
      onRefresh={pull}
      keyboardAvoiding
      contentStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: tabBarHeight }]}
    >
      <ScreenTitle
        title="Restaurant Profile"
        style={styles.title}
        right={
          <IconButton
            icon="headset-outline"
            accessibilityLabel={supportUnread > 0 ? `Support, ${supportUnread} new` : "Support"}
            dot={supportUnread > 0}
            onPress={() => router.push("/support")}
          />
        }
      />

      {!!error && <InfoNote tone="danger" text={error} style={styles.note} />}
      {!!savedNote && <InfoNote tone="success" text={savedNote} style={styles.note} />}

      {/* ── The kitchen's card ─────────────────────────────────────────── */}
      <Animated.View entering={fadeInUp(0)} style={styles.profileCard}>
        <View style={styles.banner} />
        <View style={styles.profileBody}>
          <Avatar name={restaurantName || "?"} imageUri={avatarUrl} size={ms(68)} style={styles.avatar} />
          <Txt style={styles.name} numberOfLines={2}>
            {restaurantName}
          </Txt>
          {!!restaurantId && <Txt style={styles.restaurantId}>{restaurantId}</Txt>}
          <View style={styles.badgeRow}>
            {me?.verificationStatus === "approved" && (
              <Badge label="Approved Kitchen" tone="success" icon="checkmark-circle" />
            )}
            <Badge
              label={me?.isCurrentlyOpen ? "Live & Taking Orders" : "Offline"}
              tone={me?.isCurrentlyOpen ? "success" : "warning"}
              dot
            />
          </View>
        </View>
      </Animated.View>

      {/* ── Restaurant & owner ─────────────────────────────────────────── */}
      <ListGroup title="Basic Information" delay={40}>
        <ListRow icon="person-outline" label={me?.ownerName || "—"} description="Owner Name" right={null} divider />
        <ListRow icon="call-outline" label={ownerPhone} description="Contact Phone" right={null} divider />
        <ListRow icon="mail-outline" label={me?.ownerEmail || "—"} description="Email" right={null} divider />
        <ListRow icon="location-outline" label={address} description="Address" right={null} />
      </ListGroup>

      {/* ── Restaurant details (editable) ──────────────────────────────── */}
      <ListGroup title="Restaurant Details" grouped={false} delay={80}>
        <Card bordered elevationLevel="none" style={styles.form}>
          <TextField
            label="Cuisine (comma-separated)"
            value={cuisineTypesText}
            onChangeText={setCuisineTypesText}
            placeholder="e.g. Biryani, North Indian"
          />
          <TextField
            label="Customer-facing Phone"
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
            placeholder="Number diners may call"
          />
          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="What should a customer know about this kitchen?"
            multiline
          />

          {!!detailsError && <InfoNote tone="danger" text={detailsError} />}
          {!!detailsNote && <InfoNote tone="success" text={detailsNote} />}

          <Button title="Save Details" onPress={handleSaveDetails} loading={savingDetails} fullWidth />
        </Card>
      </ListGroup>

      {/* ── Kitchen operations ─────────────────────────────────────────── */}
      <ListGroup title="Kitchen Operations" grouped={false} delay={120}>
        <Card bordered elevationLevel="none" style={styles.form}>
          <TextField
            label="Prep Time (Minutes)"
            value={prepTime}
            onChangeText={setPrepTime}
            keyboardType="number-pad"
            right={<Txt style={styles.unit}>min</Txt>}
          />
          <TextField
            label="Delivery Radius"
            value={deliveryRadius}
            onChangeText={setDeliveryRadius}
            keyboardType="numeric"
            right={<Txt style={styles.unit}>km</Txt>}
          />
          {/* Packaging fee — the kitchen's own. Delivery is priced by Lampose
              by distance, so there is no delivery fee to set here. */}
          <TextField
            label="Packaging fee (per order)"
            value={packagingFee}
            onChangeText={setPackagingFee}
            keyboardType="numeric"
            prefix="₹"
            hint={`Billed to the diner with 18% GST and paid to you in full. Up to ₹${MAX_PACKAGING_FEE}. Delivery is priced by Lampose by distance. Lampose currently charges 0% commission on food orders.`}
          />

          {/* Payment toggles */}
          <View style={styles.switches}>
            <ListRow
              icon="card-outline"
              iconColor={ui.brandInk}
              iconBackground={ui.brandSkin}
              label="Online Payments"
              description="Accept UPI, Cards & NetBanking"
              right={<ToggleSwitch value={acceptsOnline} onValueChange={setAcceptsOnline} accessibilityLabel="Online Payments" />}
              divider
              style={styles.switchRow}
            />
            <ListRow
              icon="cash-outline"
              iconColor={ui.warning}
              iconBackground={ui.warningSkin}
              label="Cash on Delivery (COD)"
              description="Allow customers to pay cash on delivery"
              right={<ToggleSwitch value={acceptsCod} onValueChange={setAcceptsCod} accessibilityLabel="Cash on Delivery" />}
              style={styles.switchRow}
            />
          </View>

          <Button title="Save Settings" onPress={handleSaveOperational} loading={saving} fullWidth />
        </Card>
      </ListGroup>

      {/* ── Legal & payout details ─────────────────────────────────────── */}
      <ListGroup title="Verified Credentials & Bank" delay={160}>
        <ListRow
          icon="document-text-outline"
          label="FSSAI License No."
          right={<Txt style={styles.value}>{me?.fssaiLicenseNumber || "—"}</Txt>}
          divider
        />
        <ListRow
          icon="receipt-outline"
          label="GSTIN Number"
          right={<Txt style={styles.value}>{me?.gstNumber || "Not provided"}</Txt>}
          divider
        />
        <ListRow
          icon="business-outline"
          label="Bank Account"
          right={<Txt style={styles.value}>{me?.payout?.accountLast4 ? `•••• •••• ${me.payout.accountLast4}` : "—"}</Txt>}
          divider
        />
        <ListRow
          icon="key-outline"
          label="IFSC Code"
          right={<Txt style={styles.value}>{me?.payout?.ifscCode || "—"}</Txt>}
        />
      </ListGroup>

      {/* ── Business ───────────────────────────────────────────────────── */}
      <ListGroup title="Business" delay={200}>
        <ListRow
          icon="wallet-outline"
          iconColor={ui.success}
          iconBackground={ui.successSkin}
          label="Payouts & Earnings"
          description="See what you're owed and request a payout"
          onPress={() => router.push("/payouts")}
          divider
        />
        <ListRow
          icon="help-buoy-outline"
          iconColor={ui.brandInk}
          iconBackground={ui.brandSkin}
          label="Help & support"
          description={supportUnread > 0 ? `${supportUnread} with a new reply` : "Settlements, orders, your menu or a rider"}
          onPress={() => router.push("/support")}
        />
      </ListGroup>

      {/* ── Sign out ───────────────────────────────────────────────────── */}
      <ListGroup grouped={false} delay={240}>
        <ListRow
          icon="log-out-outline"
          label="Sign Out of Partner Account"
          destructive
          card
          right={null}
          onPress={() => setConfirmOut(true)}
        />
      </ListGroup>

      {/* Quieter than Sign Out, and a door rather than an action: the screen
          behind it explains what is kept, asks, and offers the way back. */}
      <Button
        title="Delete account"
        variant="link"
        onPress={() => router.push("/delete-account")}
        style={styles.deleteLink}
      />

      {/* SIGN OUT CONFIRMATION */}
      <AlertDialog
        visible={confirmOut}
        tone="danger"
        title="Sign Out?"
        message="Are you sure you want to sign out of your kitchen partner account?"
        onDismiss={() => setConfirmOut(false)}
        actions={[
          {
            text: "Sign Out",
            style: "destructive",
            onPress: () => {
              setConfirmOut(false);
              signOut();
              router.replace("/signin");
            },
          },
          { text: "Cancel", style: "cancel", onPress: () => setConfirmOut(false) },
        ]}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16 },
  // The scroll content is already padded; the title must not add its own.
  title: { paddingHorizontal: 0 },
  note: { marginBottom: 12 },

  profileCard: {
    backgroundColor: ui.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: ui.border,
    overflow: "hidden",
    ...elevation.sm,
  },
  banner: { height: 64, backgroundColor: ui.brand },
  profileBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 6, marginTop: -34 },
  avatar: { borderWidth: 3, borderColor: ui.surface },
  name: {
    fontFamily: font.heading.semibold,
    fontSize: size.large,
    lineHeight: line.large,
    color: ui.text,
    marginTop: 4,
  },
  restaurantId: { fontFamily: font.body.medium, fontSize: size.small, color: ui.sec },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },

  form: { gap: 16 },
  unit: { fontFamily: font.body.bold, fontSize: size.medium, color: ui.brandInk },
  switches: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  switchRow: { paddingHorizontal: 12 },
  value: { fontFamily: font.body.semibold, fontSize: size.medium, color: ui.text, maxWidth: "50%", textAlign: "right" },

  deleteLink: { alignSelf: "center", marginTop: 16 },
});
