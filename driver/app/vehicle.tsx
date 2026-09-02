/* ══════════════════════════════════════════════════════════════════════════
   The vehicle, and changing it.

   A rider's plate is on the diner's screen at the gate and on the RC an
   approver checked, so this is not a read-only summary: a rider who buys a new
   scooter has to be able to say so, and the alternative to letting them is a
   support ticket for a field they can see is wrong.

   Editing the plate does NOT re-open verification on its own — the RC does
   that, and it lives on the Documents screen. The two are said plainly beside
   each other here so a rider changing a vehicle knows the second half is
   waiting for them.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Btn,
  ChoiceField,
  Chip,
  Icon,
  Input,
  Notice,
  Text,
  Toast,
  TopBar,
  type Choice,
} from "@/components/ui";
import { useFlowStore } from "@/store/flowStore";
import { useDriverStore, type Vehicle } from "@/store/driverStore";
import { ApiError } from "@/utils/api";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

const TYPES: Choice<NonNullable<Vehicle["type"]>>[] = [
  { value: "bike", label: "Motorcycle" },
  { value: "scooter", label: "Scooter" },
  { value: "cycle", label: "Bicycle" },
  { value: "auto", label: "Auto" },
];

const TYPE_LABEL: Record<string, string> = {
  bike: "Registered motorcycle",
  scooter: "Registered scooter",
  cycle: "Registered bicycle",
  auto: "Registered auto",
};

export default function VehicleScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();

  const profile = useDriverStore((s) => s.profile);
  const updateProfile = useDriverStore((s) => s.updateProfile);

  const [type, setType] = useState<Vehicle["type"] | null>(profile?.vehicle?.type ?? null);
  const [plate, setPlate] = useState(profile?.vehicle?.plate ?? "");
  const [model, setModel] = useState(profile?.vehicle?.model ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* Re-seed only what the rider has not started editing, so a profile refresh
     landing mid-edit cannot blank a box they are typing in. */
  useEffect(() => {
    if (!profile) return;
    setType((v) => v || profile.vehicle?.type || null);
    setPlate((v) => v || profile.vehicle?.plate || "");
    setModel((v) => v || profile.vehicle?.model || "");
  }, [profile]);

  const rc = profile?.documents?.find((doc) => doc.kind === "rc");

  const dirty =
    type !== (profile?.vehicle?.type ?? null)
    || plate.replace(/[\s-]/g, "").toUpperCase() !== (profile?.vehicle?.plate ?? "")
    || model.trim() !== (profile?.vehicle?.model ?? "");

  const save = async () => {
    const errors: Record<string, string> = {};
    if (!type) errors.type = "Pick what you ride.";
    if (type !== "cycle" && plate.replace(/[\s-]/g, "").length < 6) {
      errors.plate = "Enter the registration number, like AP05CJ4471.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setError("");
    setSaving(true);
    try {
      await updateProfile({
        vehicle: {
          type: type!,
          plate: plate.replace(/[\s-]/g, "").toUpperCase(),
          model: model.trim(),
        },
      });
      say("Vehicle updated.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.payload as { message?: string } | null)?.message || err.message
          : "That did not save.",
      );
    } finally {
      setSaving(false);
    }
  };

  const plateOnFile = profile?.vehicle?.plate || "";

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Vehicle" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="caption" color="tertiary">
          The vehicle your deliveries are assigned against. Customers see this plate at the
          gate.
        </Text>

        {/* The plate as it stands on the account, in the numeric face — it is an
            identifier, not a name. Drawn from the SAVED value rather than the
            draft, so it keeps saying what a diner would currently be shown
            while the rider is halfway through typing a new one. */}
        <View style={styles.plate}>
          <View style={styles.plateGlyph}>
            <Icon name="vehicle" size={20} color={colors.brandInk} />
          </View>
          <Text variant="eyebrow" color="tertiary">
            {TYPE_LABEL[profile?.vehicle?.type ?? ""] ?? "No vehicle on file"}
          </Text>
          <Text variant="priceHero" style={{ marginTop: space[2] }}>
            {plateOnFile || "—"}
          </Text>
          {!!profile?.vehicle?.model && (
            <Text variant="caption" color="tertiary" style={{ marginTop: space[1] }}>
              {profile.vehicle.model}
            </Text>
          )}
          {!!rc && (
            <Chip
              label={
                rc.status === "verified"
                  ? "RC verified"
                  : rc.status === "rejected"
                    ? "RC needs a new photo"
                    : rc.status === "pending"
                      ? "RC under review"
                      : "RC not sent"
              }
              tone={
                rc.status === "verified"
                  ? "success"
                  : rc.status === "rejected"
                    ? "danger"
                    : rc.status === "pending"
                      ? "warning"
                      : "muted"
              }
              style={{ marginTop: space[3] }}
            />
          )}
        </View>

        {!!error && <Notice tone="danger" glyph="alert" title={error} />}

        <View style={{ gap: space[4] }}>
          <ChoiceField
            label="What do you ride?"
            options={TYPES}
            value={type ?? null}
            onChange={setType}
            error={fieldErrors.type}
          />
          <Input
            label="Registration number"
            value={plate}
            onChangeText={setPlate}
            error={fieldErrors.plate}
            required={type !== "cycle"}
            placeholder="AP05CJ4471"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={16}
            mono
          />
          <Input
            label="Make and model"
            value={model}
            onChangeText={setModel}
            required={false}
            placeholder="Honda Activa 6G"
            maxLength={40}
          />
        </View>

        <Btn
          label={saving ? "Saving…" : "Save changes"}
          disabled={!dirty || saving}
          loading={saving}
          onPress={save}
        />

        {/* Said here rather than left to be discovered: changing the plate does
            not re-verify the vehicle, and the RC is the half that does. */}
        <Notice
          tone="info"
          glyph="documents"
          title="Changed vehicle?"
          body="Upload the new RC on the Documents screen — a plate that does not match the RC on file will be refused at review."
        />
        <Btn
          label="Go to Documents"
          variant="ghost"
          glyph="documents"
          onPress={() => router.push("/documents")}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  plate: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[5],
    alignItems: "center",
  },
  plateGlyph: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[3],
  },
});
