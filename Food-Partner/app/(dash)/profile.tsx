/* ══════════════════════════════════════════════════════════════════════════
   The restaurant's own record, and the way out.

   Everything is read from `GET /me`. The presentation and operations fields
   are editable in place and PATCH straight back; the legal numbers and the
   payout account are shown but NOT editable, because they were verified by a
   person during approval and a field that silently un-verifies itself is worse
   than no field. Changing them is a conversation with the team.

   The account number is shown as its last four digits and never in full — the
   server does not send more than that on this route, which is the real
   protection; the masking here just matches it.

   ## The logo and cover banner are editable here too

   Onboarding was the only place either could ever be set — a restaurant that
   skipped picking one, or whose partner just wants a better photo later, had
   no way back to it; `updateMe` already accepted both fields on the server
   (`EDITABLE_FIELDS` in `foodPartner.controller.js`), nothing on this screen
   used it. `ImagePick` is reused from onboarding's own form, with its
   "Sample" shortcut turned off — that button fills a stock photo for an
   account that is not live yet, and this restaurant already is.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { Block, Field, ImagePick, Note, NumberField, SwitchRow, TextField, TimeRange } from "@/components/form";
import { Btn, Card, Chip, ChoiceChip, ConfirmSheet, DataRow, Icon, Stepper, Text, TopBar } from "@/components/ui";
import { DAYS } from "@/constants/partner";
import { rupees } from "@/lib/money";
import { getMe, updateMe, type ServerRestaurant } from "@/services/foodPartner";
import { listTickets } from "@/services/support";
import { uploadOne } from "@/services/uploads";
import { usePartnerStore, type Attachment, type Slot } from "@/store/partnerStore";
import { colors, layout, radius, space, touch } from "@/theme";

/** The server's flat `{day, openTime, closeTime}[]` — one row per slot, a day
    repeated when a kitchen closes between meals — read into the shape the
    onboarding editor already works in: which days are open, and each day's
    own list of slots. `TimeRange`/`ChoiceChip` below are the same components
    step 2 of onboarding uses, reused rather than re-invented, because a
    partner should not have to relearn how to set hours the second time. */
const hoursFromServer = (rows?: { day: string; openTime: string; closeTime: string }[]) => {
  const slots: Record<string, Slot[]> = {};
  for (const row of rows ?? []) {
    (slots[row.day] ??= []).push({ open: row.openTime, close: row.closeTime });
  }
  const days = DAYS.filter((d) => slots[d]?.length);
  return { days, activeDay: days[0] ?? "Monday", slots };
};

/** A server image with a real URL, as the `uri` an `<ImagePick>` preview
    needs — `isUploaded` then reads it back as already-uploaded, so re-saving
    without touching it costs no re-upload. Null when there is none, which
    `ImagePick` reads correctly as "nothing chosen yet". */
const attachmentOf = (image?: { url?: string; publicId?: string } | null): Attachment | null =>
  image?.url ? { name: "image.jpg", uri: image.url, url: image.url, publicId: image.publicId } : null;

export default function DashProfile() {
  const session = usePartnerStore((s) => s.session);
  const signOut = usePartnerStore((s) => s.signOut);

  const [me, setMe] = useState<ServerRestaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  /* How many support threads have a reply nobody has opened. Zero and "we
     could not ask" look the same on purpose — see `load`. */
  const [supportUnread, setSupportUnread] = useState(0);

  /* The editable subset, held locally while it is being typed in. */
  const [draft, setDraft] = useState<{
    description: string;
    contactNumber: string;
    avgPreparationTime: number;
    deliveryRadiusKm: number;
    minOrderValue: string;
    packagingCharge: string;
    acceptsOnlinePayment: boolean;
    acceptsCod: boolean;
    logoImage: Attachment | null;
    coverBannerImage: Attachment | null;
  }>({
    description: "",
    contactNumber: "",
    avgPreparationTime: 30,
    deliveryRadiusKm: 5,
    minOrderValue: "",
    packagingCharge: "",
    acceptsOnlinePayment: true,
    acceptsCod: true,
    logoImage: null,
    coverBannerImage: null,
  });

  /* Kept apart from `draft` rather than folded in: it has its own shape
     (days, an active day, a slot list per day) and its own conversion to and
     from the server's flat rows — see `hoursFromServer` — where everything
     else in `draft` maps one field to one field. */
  const [hours, setHours] = useState<{ days: string[]; activeDay: string; slots: Record<string, Slot[]> }>(
    hoursFromServer(),
  );

  const load = useCallback(async () => {
    /* A missing session must END the loading state, never skip past it — the
       same bug fixed in `(dash)/orders.tsx`: `loading` starts `true`, so an
       early return leaves a spinner turning over a blank screen with nothing
       saying why. Either the screen has data, or it says what is wrong. */
    if (!session?.token) {
      setLoading(false);
      setError("You are signed out. Sign in again to continue.");
      return;
    }
    setError("");
    try {
      const r = await getMe(session.token);
      setMe(r);
      setDraft({
        description: r.description ?? "",
        contactNumber: (r.contactNumber ?? "").replace(/^\+91/, ""),
        avgPreparationTime: r.avgPreparationTime ?? 30,
        deliveryRadiusKm: r.deliveryRadiusKm ?? 5,
        minOrderValue: r.minOrderValue != null ? String(r.minOrderValue) : "",
        packagingCharge: r.packagingCharge != null ? String(r.packagingCharge) : "",
        acceptsOnlinePayment: r.acceptsOnlinePayment ?? true,
        acceptsCod: r.acceptsCod ?? true,
        logoImage: attachmentOf(r.logoImage),
        coverBannerImage: attachmentOf(r.coverBannerImage),
      });
      setHours(hoursFromServer(r.openingHours));
    } catch (err) {
      setError((err as Error)?.message || "We could not load your details.");
    } finally {
      setLoading(false);
    }

    /* The support badge is a SECOND request with its own failure. A support
       queue that cannot be reached must not put an error banner over a profile
       that loaded perfectly well, and must not stop the page rendering — the
       worst case is a badge that is not shown, and the support screen itself
       says what went wrong when it is opened. */
    try {
      const support = await listTickets(session.token);
      setSupportUnread(support.unread);
    } catch {
      setSupportUnread(0);
    }
  }, [session?.token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async () => {
    if (!session?.token) return;
    setSaving(true);
    setError("");
    setSaved("");
    try {
      /* Uploaded one at a time, not in parallel — see `services/uploads.ts`'s
         own reasoning: this is a phone-camera photograph on a kitchen's own
         connection, and two at once is how both time out together. Each call
         is a no-op when the attachment already carries an `https` url, which
         is exactly the case where the partner picked neither image this time
         — see `attachmentOf`. */
      const logo = draft.logoImage ? await uploadOne(draft.logoImage, "logo", session.token) : null;
      const cover = draft.coverBannerImage
        ? await uploadOne(draft.coverBannerImage, "cover", session.token)
        : null;

      const updated = await updateMe(session.token, {
        description: draft.description.trim(),
        contactNumber: `+91${draft.contactNumber}`,
        avgPreparationTime: draft.avgPreparationTime,
        deliveryRadiusKm: draft.deliveryRadiusKm,
        minOrderValue: Number(draft.minOrderValue) || 0,
        packagingCharge: Number(draft.packagingCharge) || 0,
        acceptsOnlinePayment: draft.acceptsOnlinePayment,
        acceptsCod: draft.acceptsCod,
        /* Same flat shape onboarding's own step 2 sends — see
           `buildApplicationPayload` — so the backend's `buildOpeningHours`
           reads one row format regardless of which screen it came from. */
        openingHours: hours.days.flatMap((day) =>
          (hours.slots[day] || []).map((s) => ({ day, openTime: s.open, closeTime: s.close })),
        ),
        /* An empty pair is how `readImage` on the server reads "cleared" —
           the same shape a Remove tap already leaves `draft` in. */
        logoImage: logo ? { url: logo.url, publicId: logo.publicId } : { url: "", publicId: "" },
        coverBannerImage: cover ? { url: cover.url, publicId: cover.publicId } : { url: "", publicId: "" },
      });
      setMe(updated);
      /* Re-derived from what the server actually persisted, not from `logo`/
         `cover` directly — the single source of truth is the same one `load`
         reads from, so a second save in the same visit re-uploads nothing. */
      setDraft((d) => ({
        ...d,
        logoImage: attachmentOf(updated.logoImage),
        coverBannerImage: attachmentOf(updated.coverBannerImage),
      }));
      setHours(hoursFromServer(updated.openingHours));
      setSaved("Saved.");
    } catch (err) {
      setError((err as Error)?.message || "That did not save.");
    } finally {
      setSaving(false);
    }
  };

  const address = me?.address
    ? [me.address.line1, me.address.line2, me.address.city, me.address.state, me.address.pincode]
        .filter(Boolean)
        .join(", ")
    : "—";

  const daySlots = hours.slots[hours.activeDay] ?? [];

  /* Turning a day off drops its slots from what gets saved, but keeps them in
     `hours.slots` — flip it back on before Save and the times typed in
     earlier are still there rather than reset to a blank default. */
  const toggleHoursDay = (day: string) =>
    setHours((h) => {
      const days = h.days.includes(day) ? h.days.filter((d) => d !== day) : [...h.days, day];
      const activeDay = days.includes(h.activeDay) ? h.activeDay : days[0] ?? day;
      const slots = h.slots[day]?.length ? h.slots : { ...h.slots, [day]: [{ open: "09:00", close: "22:00" }] };
      return { days, activeDay, slots };
    });

  const setHoursSlots = (day: string, slots: Slot[]) =>
    setHours((h) => ({ ...h, slots: { ...h.slots, [day]: slots } }));

  const copyActiveDayEverywhere = () => {
    const base = daySlots.length ? daySlots : [{ open: "09:00", close: "22:00" }];
    setHours((h) => {
      const slots: Record<string, Slot[]> = { ...h.slots };
      for (const day of h.days) slots[day] = base.map((s) => ({ ...s }));
      return { ...h, slots };
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar back={null} title="Profile" subtitle={me?.restaurantId} />

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}
        {!!saved && <Note tone="ok">{saved}</Note>}

        {/* ── Identity ─────────────────────────────────────────────────── */}
        <Card style={{ gap: space[3] }}>
          {me?.coverBannerImage?.url ? (
            <Image source={{ uri: me.coverBannerImage.url }} style={styles.cover} resizeMode="cover" />
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
            {me?.logoImage?.url ? (
              <Image source={{ uri: me.logoImage.url }} style={styles.logo} resizeMode="cover" />
            ) : (
              <View style={[styles.logo, styles.logoEmpty]}>
                <Icon name="store" size={20} color={colors.brandInk} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text variant="title1" numberOfLines={1}>
                {me?.restaurantName || "—"}
              </Text>
              <Text variant="caption" color="tertiary" numberOfLines={1}>
                {me?.cuisineTypes?.join(" · ") || "—"}
              </Text>
            </View>
            <Chip
              label={me?.verificationStatus === "approved" ? "Approved" : me?.verificationStatus ?? "—"}
              tone={me?.verificationStatus === "approved" ? "success" : "warning"}
            />
          </View>
        </Card>

        {/* ── Editable ─────────────────────────────────────────────────── */}
        <Block glyph="store" title="How you appear">
          <ImagePick
            label="Logo"
            desc="Square. Shown on your card in the listing."
            value={draft.logoImage}
            onChange={(v) => setDraft((d) => ({ ...d, logoImage: v }))}
            allowSample={false}
          />
          <ImagePick
            label="Cover banner"
            desc="Wide. Sits across the top of your restaurant page."
            aspect="wide"
            value={draft.coverBannerImage}
            onChange={(v) => setDraft((d) => ({ ...d, coverBannerImage: v }))}
            allowSample={false}
          />
          <Field label="Tagline" hint="The one line a diner reads under your name">
            <TextField
              value={draft.description}
              onChangeText={(v) => setDraft((d) => ({ ...d, description: v }))}
              placeholder="e.g. Authentic Hyderabadi dum biryani"
              maxLength={80}
            />
          </Field>
          <Field label="Customer support number">
            <TextField
              value={draft.contactNumber}
              onChangeText={(v) => setDraft((d) => ({ ...d, contactNumber: v.replace(/\D/g, "").slice(0, 10) }))}
              keyboardType="number-pad"
              prefix="+91"
            />
          </Field>
        </Block>

        <Block glyph="clock" title="Opening hours">
          <Field label="Days you are open">
            <View style={styles.chipWrap}>
              {DAYS.map((day) => (
                <ChoiceChip
                  key={day}
                  label={day.slice(0, 3)}
                  selected={hours.days.includes(day)}
                  onPress={() => toggleHoursDay(day)}
                />
              ))}
            </View>
          </Field>

          {hours.days.length > 0 ? (
            <Field label="Opening & closing times" hint="Tap a day to edit its own hours.">
              <View style={styles.chipWrap}>
                {hours.days.map((day) => (
                  <ChoiceChip
                    key={day}
                    label={day.slice(0, 3)}
                    selected={hours.activeDay === day}
                    onPress={() => setHours((h) => ({ ...h, activeDay: day }))}
                  />
                ))}
              </View>

              <View style={{ gap: space[2], marginTop: space[2] }}>
                {daySlots.map((slot, i) => (
                  <TimeRange
                    key={`${hours.activeDay}-${i}`}
                    slot={slot}
                    onChange={(next) => setHoursSlots(hours.activeDay, daySlots.map((s, idx) => (idx === i ? next : s)))}
                    onRemove={
                      daySlots.length > 1
                        ? () => setHoursSlots(hours.activeDay, daySlots.filter((_, idx) => idx !== i))
                        : undefined
                    }
                  />
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => setHoursSlots(hours.activeDay, [...daySlots, { open: "18:00", close: "23:00" }])}
                style={styles.link}
              >
                <Icon name="plus" size={14} color={colors.brandInk} />
                <Text variant="bodyStrong" color="brand">
                  Add another slot for {hours.activeDay}
                </Text>
              </Pressable>

              {hours.days.length > 1 && (
                <Pressable accessibilityRole="button" onPress={copyActiveDayEverywhere} style={styles.link}>
                  <Icon name="refresh" size={14} color={colors.brandInk} />
                  <Text variant="bodyStrong" color="brand">
                    Copy {hours.activeDay}&apos;s hours to every day
                  </Text>
                </Pressable>
              )}
            </Field>
          ) : (
            <Note tone="bad">No days are set — diners will not see this kitchen as open on a schedule.</Note>
          )}
        </Block>

        <Block glyph="truck" title="Operations">
          <Field label="Average preparation time" hint="The ETA a diner sees">
            <Stepper
              value={draft.avgPreparationTime}
              onChange={(v) => setDraft((d) => ({ ...d, avgPreparationTime: v }))}
              min={5}
              max={120}
              step={5}
              suffix="min"
            />
          </Field>
          <Field label="Delivery radius">
            <Stepper
              value={draft.deliveryRadiusKm}
              onChange={(v) => setDraft((d) => ({ ...d, deliveryRadiusKm: v }))}
              min={1}
              max={30}
              suffix="km"
            />
          </Field>
          <Field label="Minimum order">
            <NumberField
              value={draft.minOrderValue}
              onChangeText={(v) => setDraft((d) => ({ ...d, minOrderValue: v }))}
              prefix="₹"
              placeholder="0"
            />
          </Field>
          <Field label="Packaging charge">
            <NumberField
              value={draft.packagingCharge}
              onChangeText={(v) => setDraft((d) => ({ ...d, packagingCharge: v }))}
              prefix="₹"
              placeholder="0"
            />
          </Field>
          <SwitchRow
            glyph="card"
            label="Online payment"
            value={draft.acceptsOnlinePayment}
            onChange={(v) => setDraft((d) => ({ ...d, acceptsOnlinePayment: v }))}
          />
          <SwitchRow
            glyph="wallet"
            label="Cash on delivery"
            value={draft.acceptsCod}
            onChange={(v) => setDraft((d) => ({ ...d, acceptsCod: v }))}
          />
          {!draft.acceptsOnlinePayment && !draft.acceptsCod && (
            <Note tone="bad">With both off there is no way for a diner to pay you.</Note>
          )}
        </Block>

        <Btn label="Save changes" loading={saving} onPress={save} />

        {/* ── Read-only, and why ───────────────────────────────────────── */}
        <Card style={{ gap: space[1] }}>
          <Text variant="title1" style={{ marginBottom: space[1] }}>
            Verified details
          </Text>
          <DataRow first label="Address" value={address} tabular={false} />
          <DataRow label="Owner" value={me?.ownerName || "—"} tabular={false} />
          <DataRow label="Email" value={me?.ownerEmail || "—"} tabular={false} />
          <DataRow label="Phone" value={me?.ownerPhone || "—"} />
          <DataRow label="FSSAI" value={me?.fssaiLicenseNumber || "—"} />
          <DataRow label="GST" value={me?.gstNumber || "Exempt"} />
          <DataRow label="PAN" value={me?.panNumber || "—"} />
          <DataRow
            label="Payout account"
            value={me?.payout?.accountLast4 ? `ending ${me.payout.accountLast4}` : "—"}
          />
          <DataRow label="IFSC" value={me?.payout?.ifscCode || "—"} />
          <DataRow label="Minimum order" value={rupees(me?.minOrderValue ?? 0)} />
          <Text variant="caption" color="tertiary" style={{ marginTop: space[2] }}>
            These were checked by a person during approval, so they can only be changed by contacting
            the team.
          </Text>
        </Card>

        {/* ── Help ─────────────────────────────────────────────────────── */}
        {/* Directly under the sentence above, which says the verified details
            can only be changed by contacting the team — this is where that
            sentence sends somebody. */}
        <Card style={{ gap: space[3] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text variant="title1">Help &amp; support</Text>
              <Text variant="caption" color="tertiary">
                A settlement, one order, your menu, a rider — ask us here and the reply comes back
                inside the app.
              </Text>
            </View>
            {supportUnread > 0 && (
              <Chip
                label={supportUnread === 1 ? "1 new reply" : `${supportUnread} new replies`}
                tone="brand"
                glyph="bell"
              />
            )}
          </View>
          <Btn label="Get help" variant="ghost" glyph="help" onPress={() => router.push("/support")} />
        </Card>

        <Btn label="Sign out" variant="danger" glyph="logout" onPress={() => setConfirmOut(true)} />
      </ScrollView>

      <ConfirmSheet
        visible={confirmOut}
        onDismiss={() => setConfirmOut(false)}
        onPrimary={() => {
          setConfirmOut(false);
          signOut();
          router.replace("/signin");
        }}
        spec={{
          kicker: "Signing out",
          tone: "warning",
          title: "Sign out of this restaurant?",
          body: "You will need your email and password to get back in. Your menu is not affected.",
          primary: "Sign out",
          secondary: "Stay signed in",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: layout.gutter, gap: space[4], paddingBottom: space[10] },
  cover: { width: "100%", height: 110, borderRadius: radius.chip },
  logo: { width: 52, height: 52, borderRadius: radius.chip },
  logoEmpty: {
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    minHeight: touch.min,
    borderRadius: radius.chip,
  },
});
