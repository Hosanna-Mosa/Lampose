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
  Switch,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, ImagePick, Note, Refresher, Scroller, TextField, TimeRange } from "@/components/common";
import { ChoiceChip, Icon, Text } from "@/components/common";
import { DAYS } from "@/constants/partner";
import { getMe, updateMe, type ServerImage, type ServerRestaurant } from "@/services/foodPartner";
import { uploadOne } from "@/services/uploads";
import { listTickets } from "@/services/support";
import { usePartnerStore, type Attachment, type Slot } from "@/store/partnerStore";

/** The most a kitchen may charge for packaging — `FOOD_PRICING_CONFIG.maxPackagingFee` on the server. */
const MAX_PACKAGING_FEE = 50;

/** A stored Cloudinary image as the picker's attachment, so it previews as-is. */
const asAttachment = (image: ServerImage | undefined, name: string): Attachment | null =>
  image?.url ? { name, uri: image.url, url: image.url, publicId: image.publicId ?? "" } : null;

/** The server's flat `openingHours` rows, back into onboarding's days + per-day slots. */
const toWeek = (rows: ServerRestaurant["openingHours"]) => {
  const slots: Record<string, Slot[]> = {};
  for (const row of rows ?? []) {
    (slots[row.day] ??= []).push({ open: row.openTime, close: row.closeTime });
  }
  const days: string[] = DAYS.filter((day) => slots[day]?.length);
  return { days, slots };
};

const DEFAULT_SLOT: Slot = { open: "09:00", close: "22:00" };


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
  /* The packaging fee is the kitchen's own: billed to the diner (with 18%
     GST) and paid to the kitchen in full. Delivery is no longer set here —
     Lampose prices it by distance (`foodPricing.js`), so the old delivery-fee
     editor would have been saving a number nothing reads. There is still no
     minimum order: small carts pay a small-order fee instead. */
  const [packagingFee, setPackagingFee] = useState("");
  const [acceptsOnline, setAcceptsOnline] = useState(true);
  const [acceptsCod, setAcceptsCod] = useState(true);


  /* Editable restaurant details — accepted by PATCH /me since onboarding, but
     with no screen to reach them from after it. There is deliberately no
     delivery-fee editor: `deliveryFee` no longer prices an order (see the
     packaging note above). */
  const [description, setDescription] = useState("");
  const [cuisineTypesText, setCuisineTypesText] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsNote, setDetailsNote] = useState("");

  /* Brand images. Seeded with the stored Cloudinary pair; a new pick is a
     local uri until Save uploads it. Only a CHANGED image is sent, and a
     removed one is not sent at all — the server refuses an image with no url
     rather than blank the listing card, so "Remove" keeps what is live. */
  const [logo, setLogo] = useState<Attachment | null>(null);
  const [cover, setCover] = useState<Attachment | null>(null);
  const [savingImages, setSavingImages] = useState(false);
  const [imagesError, setImagesError] = useState("");
  const [imagesNote, setImagesNote] = useState("");

  /* Opening hours, in the same days + per-day-slots shape the onboarding step
     edits, flattened back into rows on save — see `buildApplicationPayload`. */
  const [days, setDays] = useState<string[]>([]);
  const [slots, setSlots] = useState<Record<string, Slot[]>>({});
  const [activeDay, setActiveDay] = useState<string>("Monday");
  const [savingHours, setSavingHours] = useState(false);
  const [hoursError, setHoursError] = useState("");
  const [hoursNote, setHoursNote] = useState("");

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
      setLogo(asAttachment(restaurant.logoImage, "Logo"));
      setCover(asAttachment(restaurant.coverBannerImage, "Cover banner"));
      const week = toWeek(restaurant.openingHours);
      setDays(week.days);
      setSlots(week.slots);
      setActiveDay(week.days[0] ?? "Monday");

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

  const handleSaveImages = async () => {
    if (!session?.token || !me) return;
    const changedLogo = logo && logo.uri !== me.logoImage?.url ? logo : null;
    const changedCover = cover && cover.uri !== me.coverBannerImage?.url ? cover : null;
    setImagesError("");
    setImagesNote("");
    if (!changedLogo && !changedCover) {
      setImagesNote("Nothing new to save. Choose a new logo or cover first.");
      return;
    }
    setSavingImages(true);
    try {
      const body: Record<string, unknown> = {};
      /* Uploaded first: only a Cloudinary link may reach the database (see
         `services/uploads.ts`). */
      if (changedLogo) {
        const up = await uploadOne(changedLogo, "logo", session.token);
        body.logoImage = { url: up.url, publicId: up.publicId };
      }
      if (changedCover) {
        const up = await uploadOne(changedCover, "cover", session.token);
        body.coverBannerImage = { url: up.url, publicId: up.publicId };
      }
      const updated = await updateMe(session.token, body);
      setMe(updated);
      setLogo(asAttachment(updated.logoImage, "Logo"));
      setCover(asAttachment(updated.coverBannerImage, "Cover banner"));
      setImagesNote("Images updated. Diners see them on your listing now.");
    } catch (err) {
      setImagesError((err as Error)?.message || "The images did not save.");
    } finally {
      setSavingImages(false);
    }
  };

  const toggleDay = (day: string) => {
    setHoursNote("");
    if (days.includes(day)) {
      const next = days.filter((d) => d !== day);
      setDays(next);
      if (activeDay === day) setActiveDay(next[0] ?? "Monday");
      return;
    }
    /* Kept in week order, and a newly opened day starts with a slot so it is
       never selected-but-empty. */
    setDays(DAYS.filter((d) => d === day || days.includes(d)));
    if (!slots[day]?.length) setSlots((prev) => ({ ...prev, [day]: [{ ...DEFAULT_SLOT }] }));
    setActiveDay(day);
  };

  const setDaySlots = (day: string, next: Slot[]) => {
    setHoursNote("");
    setSlots((prev) => ({ ...prev, [day]: next }));
  };

  const copyToEveryOpenDay = () => {
    const source = slots[activeDay] ?? [DEFAULT_SLOT];
    setHoursNote("");
    setSlots((prev) => {
      const next = { ...prev };
      for (const day of days) next[day] = source.map((s) => ({ ...s }));
      return next;
    });
  };

  const handleSaveHours = async () => {
    if (!session?.token || !me) return;
    setHoursError("");
    setHoursNote("");
    if (!days.length) {
      setHoursError("Pick at least one day you are open.");
      return;
    }
    /* Only the ticked days — a day unticked keeps its slots in `slots` but
       must not reopen the kitchen (same rule as `buildOpeningHours`). */
    const openingHours = days.flatMap((day) =>
      (slots[day] ?? []).map((s) => ({ day, openTime: s.open, closeTime: s.close })),
    );
    setSavingHours(true);
    try {
      const updated = await updateMe(session.token, { openingHours });
      setMe(updated);
      const week = toWeek(updated.openingHours);
      setDays(week.days);
      setSlots(week.slots);
      setHoursNote("Opening hours updated. They decide when diners can order.");
    } catch (err) {
      setHoursError((err as Error)?.message || "The hours did not save.");
    } finally {
      setSavingHours(false);
    }
  };

  const activeSlots = slots[activeDay] ?? [];

  /* The kitchen's own details or nothing — see DashHome for what these used
     to fall back to. */
  const restaurantName = me?.restaurantName || session?.restaurantName || "";
  const restaurantId = me?.restaurantId || session?.restaurantId || "";
  const avatarUrl = me?.logoImage?.url || me?.coverBannerImage?.url || "";

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
        refreshControl={<Refresher refreshing={refreshing} onRefresh={pull} />}
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}
        {!!savedNote && <Note tone="ok">{savedNote}</Note>}

        {/* ── HERO BANNER CARD ──────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.avatarWrapper}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.heroAvatar} />
            ) : (
              <View style={[styles.heroAvatar, { alignItems: "center", justifyContent: "center", backgroundColor: "#D1FAE5" }]}>
                <Text style={{ fontWeight: "700", fontSize: 28, color: "#047857" }}>
                  {(restaurantName || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.heroName}>{restaurantName}</Text>
          <Text style={styles.heroId}>{restaurantId}</Text>

          <View style={styles.verifiedRow}>
            {me?.verificationStatus === "approved" && (
              <View style={styles.verifiedPill}>
                <Icon name="check" size={12} color="#059669" strokeWidth={2.5} />
                <Text style={styles.verifiedPillText}>Approved Kitchen</Text>
              </View>
            )}
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
            {/* Stored as E.164 already ("+919…"), so no second "+91". */}
            <Text style={styles.infoValueBlock}>
              {me?.ownerPhone ? (me.ownerPhone.startsWith("+") ? me.ownerPhone : `+91 ${me.ownerPhone}`) : "—"}
            </Text>
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

        {/* ── SECTION: BRAND IMAGES ─────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="image" size={20} color="#059669" />
            <Text style={styles.cardTitle}>Brand Images</Text>
          </View>

          {/* No "Sample" shortcut: this is the live listing's real photograph. */}
          <ImagePick
            label="Logo"
            desc="Square. Shown on your card in the listing."
            value={logo}
            onChange={(v) => {
              setLogo(v);
              setImagesNote("");
            }}
            allowSample={false}
          />
          <ImagePick
            label="Cover banner"
            desc="Wide. Sits across the top of your restaurant page."
            aspect="wide"
            value={cover}
            onChange={(v) => {
              setCover(v);
              setImagesNote("");
            }}
            allowSample={false}
          />

          {!!imagesError && <Note tone="bad">{imagesError}</Note>}
          {!!imagesNote && <Note tone="ok">{imagesNote}</Note>}

          <Pressable
            style={[styles.saveBtn, savingImages && { opacity: 0.7 }]}
            onPress={handleSaveImages}
            disabled={savingImages}
          >
            <Text style={styles.saveBtnText}>{savingImages ? "Uploading..." : "Save Images"}</Text>
          </Pressable>
        </View>

        {/* ── SECTION: OPENING HOURS ───────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="clock" size={20} color="#059669" />
            <Text style={styles.cardTitle}>Opening Hours</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Days you are open</Text>
            <View style={styles.chipWrap}>
              {DAYS.map((day) => (
                <ChoiceChip
                  key={day}
                  label={day.slice(0, 3)}
                  selected={days.includes(day)}
                  onPress={() => toggleDay(day)}
                />
              ))}
            </View>
          </View>

          {days.length > 0 && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Hours for</Text>
              <View style={styles.chipWrap}>
                {days.map((day) => (
                  <ChoiceChip
                    key={day}
                    label={day.slice(0, 3)}
                    selected={activeDay === day}
                    onPress={() => setActiveDay(day)}
                  />
                ))}
              </View>

              {activeSlots.map((slot, i) => (
                <TimeRange
                  key={`${activeDay}-${i}`}
                  slot={slot}
                  onChange={(next) => setDaySlots(activeDay, activeSlots.map((s, idx) => (idx === i ? next : s)))}
                  onRemove={
                    activeSlots.length > 1
                      ? () => setDaySlots(activeDay, activeSlots.filter((_, idx) => idx !== i))
                      : undefined
                  }
                />
              ))}

              <Pressable
                style={styles.linkRow}
                onPress={() => setDaySlots(activeDay, [...activeSlots, { open: "18:00", close: "23:00" }])}
              >
                <Icon name="plus" size={14} color="#059669" />
                <Text style={styles.linkText}>Add another slot for {activeDay}</Text>
              </Pressable>
              {days.length > 1 && (
                <Pressable style={styles.linkRow} onPress={copyToEveryOpenDay}>
                  <Icon name="refresh" size={14} color="#059669" />
                  <Text style={styles.linkText}>Copy {activeDay}&apos;s hours to every open day</Text>
                </Pressable>
              )}
            </View>
          )}

          {!!hoursError && <Note tone="bad">{hoursError}</Note>}
          {!!hoursNote && <Note tone="ok">{hoursNote}</Note>}

          <Pressable
            style={[styles.saveBtn, savingHours && { opacity: 0.7 }]}
            onPress={handleSaveHours}
            disabled={savingHours}
          >
            <Text style={styles.saveBtnText}>{savingHours ? "Saving Changes..." : "Save Hours"}</Text>
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

          {/* Packaging fee — the kitchen's own. Delivery is priced by Lampose
              by distance, so there is no delivery fee to set here. */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Packaging fee (per order)</Text>
            <View style={styles.inputWrap}>
              <TextField value={packagingFee} onChangeText={setPackagingFee} keyboardType="numeric" style={styles.inputField} />
              <Text style={styles.inputUnit}>₹</Text>
            </View>
            <Text style={styles.inputLabel}>
              Billed to the diner with 18% GST and paid to you in full. Up to ₹{MAX_PACKAGING_FEE}. Delivery is
              priced by Lampose by distance. Lampose currently charges 0% commission on food orders.
            </Text>
          </View>

          {/* Payment Toggles */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Online Payments</Text>
              <Text style={styles.switchSub}>Accept UPI, Cards & NetBanking</Text>
            </View>
            <Switch
              value={acceptsOnline}
              onValueChange={setAcceptsOnline}
              trackColor={{ false: "#E5E7EB", true: "#A7F3D0" }}
              thumbColor={acceptsOnline ? "#059669" : "#9CA3AF"}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Cash on Delivery (COD)</Text>
              <Text style={styles.switchSub}>Allow customers to pay cash on delivery</Text>
            </View>
            <Switch
              value={acceptsCod}
              onValueChange={setAcceptsCod}
              trackColor={{ false: "#E5E7EB", true: "#A7F3D0" }}
              thumbColor={acceptsCod ? "#059669" : "#9CA3AF"}
            />
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
            <Text style={styles.infoValue}>{me?.gstNumber || "Not provided"}</Text>
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

        {/* Quieter than Sign Out, and a door rather than an action: the screen
            behind it explains what is kept, asks, and offers the way back. */}
        <Pressable
          style={styles.deleteBtn}
          onPress={() => router.push("/delete-account")}
          accessibilityRole="button"
        >
          <Text style={styles.deleteText}>Delete account</Text>
        </Pressable>
      </Scroller>

      {/* SIGN OUT CONFIRMATION MODAL */}
      {/* `onRequestClose`: without it Android's back button did nothing here. */}
      <Modal visible={confirmOut} transparent animationType="fade" onRequestClose={() => setConfirmOut(false)}>
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

  /* PAYMENT TOGGLES — restored after a merge kept the rows and lost these. */
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  switchSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },

  /* OPENING HOURS */
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
  },
  linkText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#059669",
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

  deleteBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    textDecorationLine: "underline",
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
