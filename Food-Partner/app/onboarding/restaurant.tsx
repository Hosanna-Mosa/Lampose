/* ══════════════════════════════════════════════════════════════════════════
   Step 1 — Restaurant Information.

   Who the business is, who owns it, how to reach it, and exactly where it is.
   Ported from the website's step 1 and extended with the brand images, the
   customer-facing contact number and the full postal address the field spec
   asks for.

   The OTP is three states in one field. SMS is not wired to this flow yet, so
   the error names the demo code — a partner walking the form must not be
   stopped by a code that can never arrive.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  Block,
  CheckRow,
  ChoiceChips,
  Field,
  ImagePick,
  Note,
  StepFrame,
  TextField,
} from "@/components/form";
import { Btn, ChoiceChip, Icon, Text } from "@/components/ui";
import { COPY, CUISINE_OPTIONS, INDIAN_STATES } from "@/constants/partner";
import { missingFor } from "@/lib/gates";
import { startPhoneOtp, verifyPhoneOtp } from "@/services/foodPartner";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, radius, space, touch } from "@/theme";

export default function StepRestaurant() {
  const data = usePartnerStore((s) => s.data);
  const set = usePartnerStore((s) => s.set);
  const patch = usePartnerStore((s) => s.patch);
  const toggleInArray = usePartnerStore((s) => s.toggleInArray);
  const fillSample = usePartnerStore((s) => s.fillSample);

  const [otpError, setOtpError] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [pickingState, setPickingState] = useState(false);

  const setPhoneProof = usePartnerStore((s) => s.setPhoneProof);

  const missing = missingFor(1, data, COPY);

  /* Both halves talk to the real backend. There is no demo code: the server
     decides whether a number is verified, and the proof it hands back is what
     the application POST is accepted with. */
  const sendOtp = async () => {
    setOtpBusy(true);
    setOtpError("");
    try {
      await startPhoneOtp(`+91${data.phone}`);
      patch({ otpSent: true });
    } catch (err) {
      setOtpError((err as Error)?.message || "We could not send that code. Try again.");
    } finally {
      setOtpBusy(false);
    }
  };

  const verifyOtp = async () => {
    setOtpBusy(true);
    setOtpError("");
    try {
      const res = await verifyPhoneOtp(`+91${data.phone}`, data.otp);
      setPhoneProof(res.verificationToken);
      patch({ otpVerified: true });
    } catch (err) {
      setOtpError((err as Error)?.message || "That code did not match.");
    } finally {
      setOtpBusy(false);
    }
  };

  return (
    <StepFrame
      step={1}
      onSample={() => fillSample(1)}
      missing={missing}
      onNext={() => router.push("/onboarding/operations")}
      onBack={() => router.replace("/")}
      backLabel="Cancel"
      intro={COPY.infoIntro}
    >
      <Block glyph="store" title={COPY.detailsTitle}>
        <Field label={COPY.businessLabel} required hint="The name customers will see in the app">
          <TextField
            value={data.restaurantName}
            onChangeText={(v) => set("restaurantName", v)}
            placeholder={COPY.businessPlaceholder}
          />
        </Field>

        <Field label="Tagline" hint="The one line a diner reads under your name" optional>
          <TextField
            value={data.description}
            onChangeText={(v) => set("description", v)}
            placeholder="e.g. Authentic Hyderabadi dum biryani"
            maxLength={80}
          />
        </Field>

        <Field label={COPY.categoryLabel} required hint={COPY.categoryHelp}>
          <ChoiceChips
            options={CUISINE_OPTIONS}
            selected={data.cuisineTypes}
            onToggle={(v) => toggleInArray("cuisineTypes", v)}
          />
          {data.cuisineTypes.length > 0 && (
            <Text variant="caption" color="tertiary">
              Selected: {data.cuisineTypes.join(", ")}
            </Text>
          )}
        </Field>
      </Block>

      <Block glyph="image" title="Brand images" subtitle="What a diner sees before anything else">
        <ImagePick
          label="Logo"
          desc="Square. Shown on your card in the listing."
          value={data.logoImage}
          onChange={(v) => set("logoImage", v)}
        />
        <ImagePick
          label="Cover banner"
          desc="Wide. Sits across the top of your restaurant page."
          aspect="wide"
          value={data.coverBannerImage}
          onChange={(v) => set("coverBannerImage", v)}
        />
      </Block>

      <Block glyph="users" title="Owner & contact details">
        <Field label="Full name" required>
          <TextField
            value={data.ownerName}
            onChangeText={(v) => set("ownerName", v)}
            placeholder="The owner's full name"
            autoCapitalize="words"
          />
        </Field>

        <Field label="Email address" required>
          <TextField
            value={data.ownerEmail}
            onChangeText={(v) => set("ownerEmail", v)}
            placeholder="owner@business.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </Field>

        <View style={styles.panel}>
          <View style={{ flexDirection: "row", gap: space[2], alignItems: "flex-start" }}>
            <Icon name="lock" size={16} color={colors.brandInk} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="title3">Partner dashboard login</Text>
              <Text variant="caption" color="tertiary">
                Your email or phone number and this password sign you in once the application is
                approved.
              </Text>
            </View>
          </View>

          <Field label="Password" required>
            <TextField
              value={data.password}
              onChangeText={(v) => set("password", v)}
              placeholder="At least 6 characters"
              secureTextEntry={!showPass}
              autoCapitalize="none"
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPass ? "Hide password" : "Show password"}
                  hitSlop={8}
                  onPress={() => setShowPass((v) => !v)}
                >
                  <Icon name={showPass ? "eyeOff" : "eye"} size={18} color={colors.textTertiary} />
                </Pressable>
              }
            />
          </Field>

          <Field label="Confirm password" required>
            <TextField
              value={data.confirmPassword}
              onChangeText={(v) => set("confirmPassword", v)}
              placeholder="Type it again"
              secureTextEntry={!showPass}
              autoCapitalize="none"
              state={data.confirmPassword ? (data.password === data.confirmPassword ? "ok" : "bad") : undefined}
            />
          </Field>

          {!!data.confirmPassword && data.password !== data.confirmPassword && (
            <Note tone="bad">The two passwords do not match.</Note>
          )}
        </View>

        <Field label="Phone number" required>
          {!data.otpSent ? (
            <View style={{ flexDirection: "row", gap: space[2] }}>
              <TextField
                value={data.phone}
                onChangeText={(v) => set("phone", v.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile number"
                keyboardType="number-pad"
                prefix="+91"
                style={{ flex: 1 }}
              />
              <Btn
                label="Send code"
                variant="accent"
                disabled={data.phone.length < 10}
                loading={otpBusy}
                onPress={sendOtp}
                style={{ width: 110 }}
              />
            </View>
          ) : !data.otpVerified ? (
            <View style={{ gap: space[2] }}>
              <Text variant="caption" color="tertiary">
A code was sent to +91 {data.phone}.
              </Text>
              <View style={{ flexDirection: "row", gap: space[2] }}>
                <TextField
                  value={data.otp}
                  onChangeText={(v) => set("otp", v.replace(/\D/g, "").slice(0, 4))}
                  placeholder="––––"
                  keyboardType="number-pad"
                  maxLength={4}
                  style={{ flex: 1 }}
                />
                <Btn
                  label="Verify"
                  variant="accent"
                  disabled={data.otp.length < 4}
                  loading={otpBusy}
                  onPress={verifyOtp}
                  style={{ width: 110 }}
                />
              </View>
              {!!otpError && <Note tone="bad">{otpError}</Note>}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  patch({ otpSent: false, otp: "" });
                  setOtpError("");
                }}
                style={{ minHeight: touch.min, justifyContent: "center" }}
              >
                <Text variant="bodyStrong" color="brand">
                  Change the number
                </Text>
              </Pressable>
            </View>
          ) : (
            <Note tone="ok">Verified — +91 {data.phone}</Note>
          )}
        </Field>

        <Field label="Customer support number" hint="The number diners and our riders ring. It can differ from the owner's.">
          <CheckRow
            checked={data.sameAsOwner}
            onChange={(next) => patch({ sameAsOwner: next, contactNumber: next ? "" : data.phone })}
            label="Same as the owner's mobile number"
          />
          <TextField
            value={data.sameAsOwner ? data.phone : data.contactNumber}
            onChangeText={(v) => set("contactNumber", v.replace(/\D/g, "").slice(0, 10))}
            placeholder="10-digit mobile number"
            keyboardType="number-pad"
            prefix="+91"
            editable={!data.sameAsOwner}
          />
        </Field>
      </Block>

      <Block glyph="mapPin" title="Where you are" subtitle="A rider is sent to the pin, not to the address text">
        <LocationRow />
      </Block>

      <Block glyph="pin" title="Detailed address">
        <Field label="Shop no. / building" required>
          <TextField
            value={data.addressLine1}
            onChangeText={(v) => set("addressLine1", v)}
            placeholder="e.g. Shop 42, Sunrise Tower"
          />
        </Field>
        <Field label="Area / locality" optional>
          <TextField
            value={data.addressLine2}
            onChangeText={(v) => set("addressLine2", v)}
            placeholder="e.g. MVP Colony, Sector 4"
          />
        </Field>
        <Field label="City" required>
          <TextField value={data.city} onChangeText={(v) => set("city", v)} placeholder="e.g. Visakhapatnam" />
        </Field>

        <Field label="State" required>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPickingState((v) => !v)}
            style={styles.select}
          >
            <Text variant="body" color={data.state ? "primary" : "tertiary"} style={{ flex: 1 }}>
              {data.state || "Select a state"}
            </Text>
            <Icon name={pickingState ? "chevronUp" : "chevronDown"} size={16} color={colors.textSecondary} />
          </Pressable>
          {pickingState && (
            <View style={styles.stateWrap}>
              {INDIAN_STATES.map((s) => (
                <ChoiceChip
                  key={s}
                  label={s}
                  selected={data.state === s}
                  onPress={() => {
                    set("state", s);
                    setPickingState(false);
                  }}
                />
              ))}
            </View>
          )}
        </Field>

        <Field label="Pincode" required>
          <TextField
            value={data.pincode}
            onChangeText={(v) => set("pincode", v.replace(/\D/g, "").slice(0, 6))}
            placeholder="6 digits"
            keyboardType="number-pad"
            maxLength={6}
          />
        </Field>

        <Field label="Nearby landmark" required hint="Please make sure this matches your FSSAI registration">
          <TextField
            value={data.landmark}
            onChangeText={(v) => set("landmark", v)}
            placeholder="e.g. Opposite the RTC complex"
          />
        </Field>
      </Block>
    </StepFrame>
  );
}

/* ── The pin ──────────────────────────────────────────────────────────────
   No maps dependency and no API key: the device's own location, or typed
   coordinates. Either way the pin is what is collected, and the manual fields
   are always the way through if location is refused. */
function LocationRow() {
  const data = usePartnerStore((s) => s.data);
  const set = usePartnerStore((s) => s.set);
  const patch = usePartnerStore((s) => s.patch);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const locate = async () => {
    setBusy(true);
    setError("");
    try {
      const Location = await import("expo-location");
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Location access was declined. Type the coordinates below instead.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const next: Record<string, string> = {
        lat: pos.coords.latitude.toFixed(6),
        lng: pos.coords.longitude.toFixed(6),
      };

      /* Fill what the device knows so the partner corrects rather than types.
         A reverse geocode that fails is not a failure of the step. */
      try {
        const [place] = await Location.reverseGeocodeAsync(pos.coords);
        if (place) {
          if (place.name || place.street) next.addressLine1 = [place.name, place.street].filter(Boolean).join(", ");
          if (place.district) next.addressLine2 = place.district;
          if (place.city || place.subregion) next.city = place.city || place.subregion || "";
          if (place.region) next.state = place.region;
          if (place.postalCode) next.pincode = place.postalCode.replace(/\D/g, "").slice(0, 6);
        }
      } catch {
        /* Coordinates alone are still a usable result. */
      }

      patch(next);
    } catch {
      setError("We could not read your location. Type the coordinates below instead.");
    } finally {
      setBusy(false);
    }
  };

  const placed = !!data.lat && !!data.lng;

  return (
    <>
      <Btn label="Use my current location" variant="accent" glyph="mapPin" loading={busy} onPress={locate} />
      {!!error && <Note tone="warn">{error}</Note>}

      {placed ? (
        <Note tone="ok">
          Pin placed at {data.lat}, {data.lng}
        </Note>
      ) : (
        <Note tone="info">No pin yet. Use your location, or type the coordinates.</Note>
      )}

      <View style={{ flexDirection: "row", gap: space[2] }}>
        <View style={{ flex: 1 }}>
          <Field label="Latitude">
            <TextField
              value={data.lat}
              onChangeText={(v) => set("lat", v.replace(/[^0-9.-]/g, ""))}
              placeholder="17.7231"
              keyboardType="numbers-and-punctuation"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Longitude">
            <TextField
              value={data.lng}
              onChangeText={(v) => set("lng", v.replace(/[^0-9.-]/g, ""))}
              placeholder="83.3012"
              keyboardType="numbers-and-punctuation"
            />
          </Field>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: space[3],
    backgroundColor: colors.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    padding: space[3],
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    minHeight: touch.min,
  },
  stateWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] },
});
