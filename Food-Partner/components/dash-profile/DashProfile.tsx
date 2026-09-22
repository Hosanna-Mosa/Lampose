/* ══════════════════════════════════════════════════════════════════════════
   Food Partner — Redesigned Profile Screen
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Note, Refresher, Scroller, TextField } from "@/components/common";
import { Icon, Text } from "@/components/common";
import { rupees } from "@/lib/money";
import { getMe, updateMe, type ServerRestaurant } from "@/services/foodPartner";
import { listTickets } from "@/services/support";
import { usePartnerStore } from "@/store/partnerStore";

const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=150&auto=format&fit=crop&q=80";

export function DashProfile() {
  const insets = useSafeAreaInsets();
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
  const [minOrder, setMinOrder] = useState("150");
  const [packagingCharge, setPackagingCharge] = useState("15");

  /* Editable restaurant details — accepted by PATCH /me since onboarding, but
     with no screen to reach them from after it. Business hours and the
     delivery-fee scheme are the other two `updateMe` already accepts; they
     need a structured editor of their own (the onboarding flow's `TimeRange`
     step, and a type-dependent fee form) and are deliberately left for that
     follow-up rather than a rushed version here. */
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
      setPrepTime(String(restaurant.avgPreparationTime ?? 25));
      setDeliveryRadius(String(restaurant.deliveryRadiusKm ?? 6));
      setMinOrder(String(restaurant.minOrderValue ?? 150));
      setPackagingCharge(String(restaurant.packagingCharge ?? 15));
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

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleSaveOperational = async () => {
    if (!session?.token || !me) return;
    setSaving(true);
    setError("");
    setSavedNote("");
    try {
      const updated = await updateMe(session.token, {
        avgPreparationTime: parseInt(prepTime, 10) || 25,
        deliveryRadiusKm: parseFloat(deliveryRadius) || 6,
        minOrderValue: parseFloat(minOrder) || 0,
        packagingCharge: parseFloat(packagingCharge) || 0,
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

  const restaurantName = me?.restaurantName || session?.restaurantName || "Paradise Biryani House";
  const restaurantId = me?.restaurantId || session?.restaurantId || "FP-P5Y9DQ4B";

  return (
    <Box style={{ flex: 1, backgroundColor: "#F4F6F8" }}>
      {/* ── TOP HEADER ────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <Text style={styles.headerTitle}>Restaurant Profile</Text>
        <Pressable
          style={styles.helpBtn}
          onPress={() => router.push("/support")}
        >
          <Icon name="help" size={18} color="#059669" />
          <Text style={styles.helpText}>Support</Text>
          {supportUnread > 0 && <View style={styles.unreadDot} />}
        </Pressable>
      </View>

      <Scroller
        contentContainerStyle={styles.scrollContent}
        refreshControl={<Refresher refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}
        {!!savedNote && <Note tone="ok">{savedNote}</Note>}

        {/* ── HERO BANNER CARD ──────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.avatarWrapper}>
            <Image
              source={{ uri: me?.coverBannerImage?.url || DEFAULT_AVATAR }}
              style={styles.heroAvatar}
            />
          </View>

          <Text style={styles.heroName}>{restaurantName}</Text>
          <Text style={styles.heroId}>{restaurantId}</Text>

          <View style={styles.verifiedRow}>
            <View style={styles.verifiedPill}>
              <Icon name="check" size={12} color="#059669" strokeWidth={2.5} />
              <Text style={styles.verifiedPillText}>Approved Kitchen</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: me?.isCurrentlyOpen ? "#D1FAE5" : "#FEF3C7" }]}>
              <Text style={[styles.statusPillText, { color: me?.isCurrentlyOpen ? "#047857" : "#D97706" }]}>
                {me?.isCurrentlyOpen ? "Live & Taking Orders" : "Offline"}
              </Text>
            </View>
          </View>
        </View>

        {/* ── SECTION 1: RESTAURANT & OWNER INFO ────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="store" size={20} color="#059669" />
            <Text style={styles.cardTitle}>Basic Information</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Owner Name</Text>
            <Text style={styles.infoValueBlock}>{me?.ownerName || "—"}</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Contact Phone</Text>
            <Text style={styles.infoValueBlock}>+91 {me?.ownerPhone || "—"}</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValueBlock}>{me?.ownerEmail || "—"}</Text>
          </View>

          <View style={styles.infoItemLast}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={styles.infoValueBlock}>
              {[me?.address?.line1, me?.address?.city].filter(Boolean).join(", ") || "—"}
            </Text>
          </View>
        </View>

        {/* ── SECTION: RESTAURANT DETAILS (editable) ────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="edit" size={20} color="#059669" />
            <Text style={styles.cardTitle}>Restaurant Details</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Cuisine (comma-separated)</Text>
            <TextField
              value={cuisineTypesText}
              onChangeText={setCuisineTypesText}
              placeholder="e.g. Biryani, North Indian"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Customer-facing Phone</Text>
            <TextField
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
              placeholder="Number diners may call"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Description</Text>
            <TextField
              value={description}
              onChangeText={setDescription}
              placeholder="What should a customer know about this kitchen?"
              multiline
            />
          </View>

          {!!detailsError && <Note tone="bad">{detailsError}</Note>}
          {!!detailsNote && <Note tone="ok">{detailsNote}</Note>}

          <Pressable
            style={[styles.saveBtn, savingDetails && { opacity: 0.7 }]}
            onPress={handleSaveDetails}
            disabled={savingDetails}
          >
            <Text style={styles.saveBtnText}>{savingDetails ? "Saving Changes..." : "Save Details"}</Text>
          </Pressable>
        </View>

        {/* ── SECTION 2: OPERATIONAL SETTINGS ─────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="clock" size={20} color="#059669" />
            <Text style={styles.cardTitle}>Kitchen Operations</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Prep Time (Minutes)</Text>
            <View style={styles.inputWrap}>
              <TextField
                value={prepTime}
                onChangeText={setPrepTime}
                keyboardType="number-pad"
                style={styles.inputField}
              />
              <Text style={styles.inputUnit}>min</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Delivery Radius</Text>
            <View style={styles.inputWrap}>
              <TextField
                value={deliveryRadius}
                onChangeText={setDeliveryRadius}
                keyboardType="numeric"
                style={styles.inputField}
              />
              <Text style={styles.inputUnit}>km</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Min Order Value</Text>
            <View style={styles.inputWrap}>
              <TextField
                value={minOrder}
                onChangeText={setMinOrder}
                keyboardType="number-pad"
                style={styles.inputField}
              />
              <Text style={styles.inputUnit}>₹</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Packaging Charge</Text>
            <View style={styles.inputWrap}>
              <TextField
                value={packagingCharge}
                onChangeText={setPackagingCharge}
                keyboardType="number-pad"
                style={styles.inputField}
              />
              <Text style={styles.inputUnit}>₹</Text>
            </View>
          </View>

          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSaveOperational}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? "Saving Changes..." : "Save Settings"}</Text>
          </Pressable>
        </View>

        {/* ── SECTION 3: LEGAL & PAYOUT DETAILS ───────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="shieldCheck" size={20} color="#059669" />
            <Text style={styles.cardTitle}>Verified Credentials & Bank</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>FSSAI License No.</Text>
            <Text style={styles.infoValue}>{me?.fssaiLicenseNumber || "—"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>GSTIN Number</Text>
            <Text style={styles.infoValue}>{(me as any)?.gstNumber || (me as any)?.gstinNumber || "Verified ✓"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Bank Account</Text>
            <Text style={styles.infoValue}>
              {me?.payout?.accountLast4 ? `•••• •••• ${me.payout.accountLast4}` : "—"}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>IFSC Code</Text>
            <Text style={styles.infoValue}>{me?.payout?.ifscCode || "—"}</Text>
          </View>
        </View>

        {/* ── PAYOUTS & EARNINGS LINK ──────────────────────────────────── */}
        <Pressable style={styles.payoutsLinkCard} onPress={() => router.push("/payouts")}>
          <View style={styles.payoutsLinkIcon}>
            <Icon name="wallet" size={20} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.payoutsLinkTitle}>Payouts & Earnings</Text>
            <Text style={styles.payoutsLinkSub}>See what you're owed and request a payout</Text>
          </View>
          <Icon name="chevronRight" size={18} color="#9CA3AF" />
        </Pressable>

        {/* ── SIGN OUT BUTTON ──────────────────────────────────────────── */}
        <Pressable style={styles.signOutBtn} onPress={() => setConfirmOut(true)}>
          <Icon name="logout" size={18} color="#DC2626" />
          <Text style={styles.signOutText}>Sign Out of Partner Account</Text>
        </Pressable>
      </Scroller>

      {/* SIGN OUT CONFIRMATION MODAL */}
      <Modal visible={confirmOut} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sign Out?</Text>
            <Text style={styles.modalSub}>
              Are you sure you want to sign out of your kitchen partner account?
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setConfirmOut(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.confirmBtn}
                onPress={() => {
                  setConfirmOut(false);
                  signOut();
                  router.replace("/signin");
                }}
              >
                <Text style={styles.confirmText}>Sign Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Box>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  helpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    position: "relative",
  },
  helpText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#059669",
  },
  unreadDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },

  /* HERO CARD */
  heroCard: {
    backgroundColor: "#034527",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  avatarWrapper: {
    position: "relative",
    marginBottom: 4,
  },
  heroAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  heroName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroId: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "600",
  },
  verifiedRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },

  /* SECTIONS — flat, not cards: no background fill, no shadow, no border
     radius. A bottom divider is what tells one section from the next,
     matching the menu screen's flat rows rather than a floating white box
     per section. */
  card: {
    gap: 14,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoLabel: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  /* Stacked label-then-value item, for fields whose value can run long
     (a cuisine list, a full address) and would otherwise crush against the
     label in a side-by-side row. */
  infoItem: {
    gap: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoItemLast: {
    gap: 4,
  },
  infoValueBlock: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 21,
  },

  /* INPUT GROUPS */
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputField: {
    flex: 1,
  },
  inputUnit: {
    fontSize: 14,
    fontWeight: "700",
    color: "#059669",
    width: 32,
  },

  saveBtn: {
    backgroundColor: "#059669",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  /* PAYOUTS LINK — a flat row, not a card. */
  payoutsLinkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  payoutsLinkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  payoutsLinkTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  payoutsLinkSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },

  /* SIGN OUT BUTTON */
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#FEE2E2",
    marginTop: 8,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#DC2626",
  },

  /* MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  modalSub: {
    fontSize: 14,
    color: "#6B7280",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#DC2626",
  },
  confirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
