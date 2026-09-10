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
} from "@/components/common";
import { Btn, ChoiceChip, Icon, Text } from "@/components/common";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, radius, space, touch } from "@/theme";

export function LocationRow() {
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
