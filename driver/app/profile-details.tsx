/* ══════════════════════════════════════════════════════════════════════════
   Personal information, and correcting it.

   Editable, with two exceptions that are shown as facts rather than fields:

     · the MOBILE NUMBER, because it is the account. Changing it here would be
       an account takeover with extra steps — the same rule `PATCH /me` states
       on the server, and it is worth the screen saying so rather than leaving
       a rider to discover a box that does not work.
     · the PARTNER ID, which is minted once and printed on everything.

   Everything else a rider typed during sign-up they can retype here. A name
   that does not match the Aadhaar is the most common reason an application is
   refused, and the fix has to be one screen away rather than a support ticket.
   ══════════════════════════════════════════════════════════════════════════ */
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Avatar,
  Btn,
  Chip,
  DataRow,
  DateField,
  Input,
  LocateButton,
  Notice,
  PhotoSlot,
  Text,
  Toast,
  TopBar,
} from "@/components/ui";
import { useFlowStore } from "@/store/flowStore";
import { useDriverStore } from "@/store/driverStore";
import { LocationRefused, locateMe } from "@/services/locateMe";
import { ApiError } from "@/utils/api";
import { colors, layout, radius, space, tone as resolveTone, type ToneName } from "@/theme";

const STATUS: Record<string, { label: string; tone: ToneName }> = {
  approved: { label: "Verified partner", tone: "success" },
  pending: { label: "Under review", tone: "warning" },
  rejected: { label: "Not approved", tone: "danger" },
  suspended: { label: "On hold", tone: "danger" },
};

export default function ProfileDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();

  const profile = useDriverStore((s) => s.profile);
  const updateProfile = useDriverStore((s) => s.updateProfile);
  const uploadImage = useDriverStore((s) => s.uploadImage);

  const [name, setName] = useState(profile?.name ?? "");
  const [dob, setDob] = useState<string | null>(
    profile?.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : null,
  );
  const [city, setCity] = useState(profile?.city ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [line1, setLine1] = useState(profile?.address?.line1 ?? "");
  const [landmark, setLandmark] = useState(profile?.address?.landmark ?? "");
  const [pincode, setPincode] = useState(profile?.address?.pincode ?? "");
  const [pin, setPin] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [locating, setLocating] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(profile?.profilePhotoUrl ?? "");

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    setName((v) => v || profile.name || "");
    setDob((v) => v || (profile.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : null));
    setCity((v) => v || profile.city || "");
    setEmail((v) => v || profile.email || "");
    setLine1((v) => v || profile.address?.line1 || "");
    setLandmark((v) => v || profile.address?.landmark || "");
    setPincode((v) => v || profile.address?.pincode || "");
    setPhotoUrl((v) => v || profile.profilePhotoUrl || "");
  }, [profile]);

  const savedDob = profile?.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : null;
  const dirty =
    name.trim() !== (profile?.name ?? "")
    || dob !== savedDob
    || city.trim() !== (profile?.city ?? "")
    || email.trim() !== (profile?.email ?? "")
    || line1.trim() !== (profile?.address?.line1 ?? "")
    || landmark.trim() !== (profile?.address?.landmark ?? "")
    || pincode.trim() !== (profile?.address?.pincode ?? "")
    || photoUrl !== (profile?.profilePhotoUrl ?? "");

  const status = STATUS[profile?.status ?? "pending"] ?? STATUS.pending;

  const useMyLocation = async () => {
    setError("");
    setLocating(true);
    try {
      const found = await locateMe();
      setPin(found.location);
      /* Fills only what is still empty — see the same rule on the sign-up
         form. A rider correcting one line does not want the rest rewritten. */
      const fill = (current: string, next: string) => (current.trim() ? current : next);
      setLine1((v) => fill(v, found.fields.line1));
      setLandmark((v) => fill(v, found.fields.landmark));
      setCity((v) => fill(v, found.fields.city));
      setPincode((v) => fill(v, found.fields.pincode));
      if (found.namedNothing) {
        setError("We saved the pin but could not name this spot — type the address.");
      }
    } catch (err) {
      setError(
        err instanceof LocationRefused
          ? err.message
          : readError(err, "We could not get your location."),
      );
    } finally {
      setLocating(false);
    }
  };

  const changePhoto = async () => {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("We need access to your photos to change your picture.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsEditing: true,
      aspect: [1, 1],
      /* The bytes, rather than a URI the store would have to read back — see
         `uploadImage`. */
      base64: true,
    });
    const asset = picked.canceled ? null : picked.assets?.[0];
    if (!asset?.base64) return;

    setUploading(true);
    try {
      setPhotoUrl(await uploadImage("profile", asset.base64));
    } catch (err) {
      setError(readError(err, "That photo did not upload."));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (name.trim().length < 3) {
      setError("Enter your full name, as printed on your licence.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        city: city.trim(),
        email: email.trim(),
        ...(dob ? { dateOfBirth: dob } : null),
        /* Only when there is a first line. An address with a landmark and no
           street is one the server refuses, and sending it would turn a
           half-filled optional field into a blocked Save. */
        ...(line1.trim()
          ? {
              address: {
                kind: "home" as const,
                line1: line1.trim(),
                landmark: landmark.trim(),
                city: city.trim(),
                pincode: pincode.trim(),
                ...(pin ? { location: pin } : null),
              },
            }
          : null),
        ...(photoUrl ? { profilePhotoUrl: photoUrl } : null),
      });
      say("Saved.");
    } catch (err) {
      setError(readError(err, "That did not save."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Personal information" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="caption" color="tertiary">
          This must match the government ID you uploaded. A mismatch is the most common
          reason an application is refused.
        </Text>

        <View style={styles.identity}>
          <Avatar name={profile?.name || "Partner"} size={56} />
          <View style={{ flex: 1, minWidth: 0, gap: space[2] }}>
            <Text variant="display2" numberOfLines={1}>
              {profile?.name || "Your name"}
            </Text>
            <Chip label={status.label} tone={status.tone} glyph="shield" />
          </View>
        </View>

        {/* The account's verdict in the server's own words, whenever there is
            one — this is the screen a rider opens after a refusal. */}
        {!!profile?.blockedReason && (
          <Notice tone={status.tone === "success" ? "info" : status.tone} glyph="info" title={profile.blockedReason} />
        )}
        {!!error && <Notice tone="danger" glyph="alert" title={error} />}

        <View style={{ gap: space[4] }}>
          <Input
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="As printed on your licence"
            autoCapitalize="words"
            maxLength={60}
          />
          <DateField label="Date of birth" value={dob} onChange={setDob} />
          <Input
            label="City"
            value={city}
            onChangeText={setCity}
            placeholder="Rajahmundry"
            autoCapitalize="words"
            maxLength={40}
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            required={false}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={80}
            hint="Only used for payout statements."
          />

          <LocateButton busy={locating} onPress={useMyLocation} />

          {/* Read by an approver beside the Aadhaar. Optional — the server's
              completeness rule does not ask for it, so a rider who leaves it
              blank is not blocked from working. */}
          <Input
            label="Where you live"
            value={line1}
            onChangeText={setLine1}
            required={false}
            placeholder="12-3-45, Danavaipeta"
            maxLength={120}
            hint="As it appears on your Aadhaar."
          />
          <Input
            label="Landmark"
            value={landmark}
            onChangeText={setLandmark}
            required={false}
            placeholder="Near the temple"
            maxLength={80}
          />
          <Input
            label="Pincode"
            value={pincode}
            onChangeText={setPincode}
            required={false}
            placeholder="533103"
            keyboardType="number-pad"
            maxLength={6}
            mono
          />

          <View style={{ gap: space[1] }}>
            <Text variant="eyebrow" color="tertiary">
              Profile photo
            </Text>
            <View style={{ flexDirection: "row", gap: space[3] }}>
              <PhotoSlot
                label="Your photo"
                uri={photoUrl}
                busy={uploading}
                onPress={changePhoto}
              />
              <View style={{ flex: 1, justifyContent: "center" }}>
                <Text variant="caption" color="tertiary">
                  Restaurants and customers see this when they hand food over.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Btn
          label={saving ? "Saving…" : "Save changes"}
          disabled={!dirty || saving || uploading}
          loading={saving}
          onPress={save}
        />

        {/* The two facts, not fields — see the header. */}
        <View style={styles.card}>
          <DataRow label="Mobile number" value={formatPhone(profile?.phone)} first />
          <DataRow label="Partner ID" value={profile?.driverId || "—"} />
          <DataRow
            label="Partner since"
            value={
              profile?.driverId
                ? new Date(
                    (profile as { createdAt?: string }).createdAt || Date.now(),
                  ).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
                : "—"
            }
          />
          <DataRow
            label="Documents"
            value={documentSummary(profile?.documents)}
            valueTone={
              profile?.documents?.some((d) => d.status === "rejected")
                ? resolveTone("danger").ink
                : undefined
            }
          />
        </View>

        <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
          Your number is your account and cannot be changed here. Contact support if you
          have a new one.
        </Text>
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
    </View>
  );
}

/** `+919849041172` as `+91 98490 41172`, which is how a rider reads it back. */
function formatPhone(phone?: string): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

function documentSummary(documents?: { status: string; required: boolean }[]): string {
  if (!documents?.length) return "None sent";
  const verified = documents.filter((d) => d.status === "verified").length;
  const rejected = documents.filter((d) => d.status === "rejected").length;
  if (rejected) return `${rejected} need${rejected === 1 ? "s" : ""} a new photo`;
  return `${verified} of ${documents.length} verified`;
}

function readError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload as { message?: string } | null;
    return payload?.message || err.message || fallback;
  }
  return (err as Error)?.message || fallback;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingHorizontal: space[4],
    paddingVertical: space[1],
  },
});
