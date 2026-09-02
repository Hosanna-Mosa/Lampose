/* ══════════════════════════════════════════════════════════════════════════
   Documents, after sign-up.

   The same five rows the onboarding flow ends on, reachable for the rest of
   the account's life — because a licence expires, an insurance certificate is
   renewed, and a document an approver refused has to be replaceable without
   signing out and starting again.

   This screen and the documents step of `onboarding.tsx` are deliberately the
   same control over the same endpoints. What differs is only the frame around
   them: there, a step in a flow with a Continue button; here, a list a rider
   opens from their profile. A separate "resubmit" path would be a second
   implementation of the one thing this app cannot get wrong.
   ══════════════════════════════════════════════════════════════════════════ */
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, Input, Notice, PhotoSlot, Text, Toast, TopBar } from "@/components/ui";
import { useFlowStore } from "@/store/flowStore";
import { useDriverStore, type DocumentKind, type DriverDocument } from "@/store/driverStore";
import { ApiError } from "@/utils/api";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

const TONE = {
  verified: "success",
  pending: "warning",
  rejected: "danger",
  missing: "muted",
} as const;

const LABEL = {
  verified: "Verified",
  pending: "Under review",
  rejected: "Needs a new photo",
  missing: "Not sent",
} as const;

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();

  const profile = useDriverStore((s) => s.profile);
  const uploadImage = useDriverStore((s) => s.uploadImage);
  const submitDocument = useDriverStore((s) => s.submitDocument);
  const refreshProfile = useDriverStore((s) => s.refreshProfile);

  const [uploading, setUploading] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const documents = profile?.documents ?? [];
  const rejected = documents.filter((doc) => doc.status === "rejected");

  /* Re-read on open. A decision made in the console while the app was in the
     background is the whole reason a rider comes to this screen. */
  useEffect(() => {
    refreshProfile().catch(() => {});
  }, [refreshProfile]);

  const attach = async (kind: DocumentKind, side: "front" | "back") => {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("We need access to your photos to attach a document.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      /* The bytes, rather than a URI the store would have to read back — see
         `uploadImage`. */
      base64: true,
    });
    const asset = picked.canceled ? null : picked.assets?.[0];
    if (!asset?.base64) return;

    setUploading(`${kind}:${side}`);
    try {
      const url = await uploadImage(kind, asset.base64);
      const existing = documents.find((doc) => doc.kind === kind);
      await submitDocument({
        kind,
        number: existing?.number || "",
        frontUrl: side === "front" ? url : existing?.frontUrl || "",
        backUrl: side === "back" ? url : existing?.backUrl || "",
      });
      say("Sent for review.");
    } catch (err) {
      setError(readError(err, "That photo did not upload. Please try again."));
    } finally {
      setUploading("");
    }
  };

  const saveNumber = async (kind: DocumentKind, value: string) => {
    const existing = documents.find((doc) => doc.kind === kind);
    if (!existing?.frontUrl || value.trim().toUpperCase() === existing.number) return;
    try {
      await submitDocument({ kind, number: value.trim(), frontUrl: existing.frontUrl });
      say("Saved.");
    } catch (err) {
      setError(readError(err, "We could not save that number."));
    }
  };

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Documents" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refreshProfile().catch(() => {});
              setRefreshing(false);
            }}
          />
        }
      >
        <Text variant="caption" color="tertiary">
          Keep the required three valid to stay online. We check uploads within 24 hours.
        </Text>

        {!!rejected.length && (
          <Notice
            tone="danger"
            glyph="alert"
            title={`${rejected.map((d) => d.label).join(" and ")} needs a new photo`}
            body="The reason is on the card below. Tap the photo to replace it."
          />
        )}
        {!!error && <Notice tone="danger" glyph="alert" title={error} />}

        <View style={{ gap: space[3] }}>
          {documents.map((doc) => (
            <DocumentCard
              key={doc.kind}
              doc={doc}
              uploading={uploading}
              onAttach={(side) => attach(doc.kind, side)}
              onNumber={(value) => saveNumber(doc.kind, value)}
            />
          ))}
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
    </View>
  );
}

function DocumentCard({
  doc,
  uploading,
  onAttach,
  onNumber,
}: {
  doc: DriverDocument;
  uploading: string;
  onAttach: (side: "front" | "back") => void;
  onNumber: (value: string) => void;
}) {
  const [number, setNumber] = useState(doc.number);
  const t = resolveTone(TONE[doc.status]);
  const failing = doc.status === "rejected";

  useEffect(() => setNumber(doc.number), [doc.number]);

  return (
    <View style={[styles.card, failing && { borderColor: t.border, backgroundColor: t.tint }]}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text variant="title1" numberOfLines={2}>
            {doc.label}
          </Text>
          <Text variant="numMeta" color="tertiary">
            {doc.required ? "Required" : "Optional"}
            {doc.number ? ` · ${doc.number}` : ""}
            {doc.reviewedAt ? ` · reviewed ${new Date(doc.reviewedAt).toLocaleDateString("en-IN")}` : ""}
          </Text>
        </View>
        <Chip label={LABEL[doc.status]} tone={TONE[doc.status]} />
      </View>

      {/*
        The reason is the whole point of a rejected document, so it sits in its
        own tinted well rather than as a red line of text — a rider who cannot
        see red still gets a distinct block.
      */}
      {failing && !!doc.reason && (
        <View style={[styles.reason, { backgroundColor: colors.surface, borderColor: t.border }]}>
          <Text variant="caption" style={{ color: t.ink }}>
            {doc.reason}
          </Text>
        </View>
      )}

      <View style={styles.slots}>
        <PhotoSlot
          label="Front"
          uri={doc.frontUrl}
          busy={uploading === `${doc.kind}:front`}
          onPress={() => onAttach("front")}
        />
        <PhotoSlot
          label="Back"
          uri={doc.backUrl}
          busy={uploading === `${doc.kind}:back`}
          onPress={() => onAttach("back")}
        />
      </View>

      {/* Saved on blur, not per keystroke — each save puts the document back in
          the approver's queue, and doing that per character would file the same
          document fourteen times. */}
      <Input
        label="Number on the document"
        value={number}
        onChangeText={setNumber}
        onBlur={() => onNumber(number)}
        required={false}
        placeholder={doc.frontUrl ? "As printed" : "Add a photo first"}
        editable={!!doc.frontUrl}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={32}
        mono
      />
    </View>
  );
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
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
    backgroundColor: colors.surface,
    gap: space[3],
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space[3],
  },
  reason: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.chip,
    padding: space[3],
  },
  slots: { flexDirection: "row", gap: space[3] },
});
