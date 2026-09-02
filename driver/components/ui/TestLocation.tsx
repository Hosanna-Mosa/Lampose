/* ══════════════════════════════════════════════════════════════════════════
   Putting the rider somewhere, for testing.

   The dispatcher searches 2km, then 5km, then 10km around the RESTAURANT'S
   pin, and skips any rider whose last fix is over five minutes old. On a
   handset in the right city none of that needs thinking about. On an emulator
   it is the whole story: an Android emulator reports the Googleplex
   (37.4220, -122.0840) until told otherwise, which is 13,476km from
   Rajahmundry — so every search returns zero candidates, no offer is ever
   made over any transport, and the diner is told nobody is available.

   Nothing about that failure looks like a location problem from either app.
   The rider sees "You're online · waiting for orders" and the diner sees
   "still finding you a rider", which is exactly what a working system looks
   like while it is busy. This panel is the shortest path from that symptom to
   the cause, and then past it.

   ## It reports through the same path as a real fix

   `setSimulated` on `useDriverLocation` takes over the watch, and the home
   screen's existing effect PATCHes it to `/me/location` like any other
   position. There is no test-only route and no server-side flag: what is being
   exercised is the real dispatcher against a real stored position, and the
   only thing faked is which coordinates the phone believes it is at.

   ## Not in production

   Same gate as the sign-up shortcut — `DUMMY_DATA_ENABLED`, which is `__DEV__`
   unless a build sets `EXPO_PUBLIC_ALLOW_DUMMY_DATA`. A rider who could move
   their own pin could take an order from a kitchen they are nowhere near.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { DUMMY_DATA_ENABLED } from "@/constants/dummyPartner";
import { colors, radius, space } from "@/theme";
import { Btn, Chip } from "./primitives";
import { Input } from "./Form";
import { Text } from "./Text";

/**
 * Rajahmundry, where Lampose operates. Not a landmark — it is close enough to
 * the restaurants that have pins that the 2km ring usually answers, which is
 * the whole job of a default here.
 */
const CITY = { lat: 16.9328, lng: 81.7528 };

export function TestLocation({
  active,
  onUse,
  onClear,
}: {
  /** The coordinates currently being simulated, if any. */
  active: { lat: number; lng: number } | null;
  onUse: (coords: { lat: number; lng: number }) => void;
  onClear: () => void;
}) {
  const [lat, setLat] = useState(String(CITY.lat));
  const [lng, setLng] = useState(String(CITY.lng));
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  if (!DUMMY_DATA_ENABLED) return null;

  const use = () => {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    /* Checked here rather than left to the server, which answers a 400 the
       position feed deliberately swallows — `pushLocation` is fire-and-forget,
       so a bad number would fail silently and look exactly like the problem
       this panel exists to diagnose. */
    if (!Number.isFinite(parsedLat) || Math.abs(parsedLat) > 90) {
      setError("Latitude is between -90 and 90.");
      return;
    }
    if (!Number.isFinite(parsedLng) || Math.abs(parsedLng) > 180) {
      setError("Longitude is between -180 and 180.");
      return;
    }
    setError("");
    onUse({ lat: parsedLat, lng: parsedLng });
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="title2">Test location</Text>
          <Text variant="caption" color="tertiary">
            {active
              ? "Simulated. The dispatcher sees these coordinates."
              : "Emulators report California. Move yourself near a kitchen to get offers."}
          </Text>
        </View>
        {active && <Chip label="Simulated" tone="warning" />}
      </View>

      {open && (
        <View style={{ gap: space[3], marginTop: space[3] }}>
          {/* Latitude first, because that is how a person reads a pin off a
              map — and it is the opposite of the [lng, lat] order the database
              and every payload use. The conversion happens once, at `onUse`. */}
          <Input
            label="Latitude"
            value={lat}
            onChangeText={setLat}
            required={false}
            keyboardType="numbers-and-punctuation"
            placeholder="16.9328"
            mono
          />
          <Input
            label="Longitude"
            value={lng}
            onChangeText={setLng}
            error={error}
            required={false}
            keyboardType="numbers-and-punctuation"
            placeholder="81.7528"
            mono
            hint="Copy a restaurant's pin from the admin console — Delivery Riders shows one per rider, Restaurant Approvals one per kitchen."
          />
          <Btn label="Use these coordinates" variant="accent" onPress={use} />
          {active && <Btn label="Back to real GPS" variant="quiet" onPress={onClear} />}
        </View>
      )}

      {!open && (
        <View style={{ flexDirection: "row", gap: space[2], marginTop: space[3] }}>
          <Btn
            label="Put me in Rajahmundry"
            variant="accent"
            onPress={() => onUse(CITY)}
            style={{ flex: 1 }}
          />
          <Btn label="Pick a spot" variant="quiet" onPress={() => setOpen(true)} style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
});
