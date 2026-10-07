/* ══════════════════════════════════════════════════════════════════════════
   One way to add a photograph, everywhere in the app.

   Logo, cover, a dish, the restaurant's own photos: each asks the same
   question first — the camera, or a picture already on the phone? — because a
   kitchen photographs a plate where it stands far more often than it finds one
   in the gallery. `usePhotoPicker()` returns `open(request)` and the `sheet` to
   render; the caller gets back real files from this phone, and nothing else.
   There is no sample or stock picture behind any of it.

   ## Permission is asked while the sheet is up

   The system's own prompt can sit over the sheet. If it is refused the sheet
   stays and says so, with a way to Settings — a picker that silently did
   nothing was the old behaviour, and reads as a broken button.

   ## The sheet closes before the picker opens

   iOS cannot present the camera or the photo library while a modal is still
   on screen, so a granted request closes the sheet and waits for it to go.
   ══════════════════════════════════════════════════════════════════════════ */
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useState } from "react";
import { Linking, Platform, View } from "react-native";

import type { Attachment } from "@/store/partnerStore";
import { ui } from "@/theme/ui";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { InfoNote } from "./InfoNote";
import { ListRow } from "./ListRow";

export type PhotoRequest = {
  /** The sheet's title — "Restaurant logo", "Dish photo". */
  title: string;
  /** Crop to this shape. Ignored when several are being picked at once. */
  aspect?: [number, number];
  /** How many may be chosen from the gallery in one go. 1 unless set. */
  limit?: number;
  onPicked: (photos: Attachment[]) => void;
};

type Source = "camera" | "library";

/** Long enough for iOS to finish dismissing the sheet's modal. */
const SHEET_CLOSE_MS = Platform.OS === "ios" ? 450 : 0;
const QUALITY = 0.85;

const toAttachment = (asset: ImagePicker.ImagePickerAsset, title: string, index: number): Attachment => ({
  name: asset.fileName || `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${index}.jpg`,
  uri: asset.uri,
  size: asset.fileSize,
  mimeType: asset.mimeType || "image/jpeg",
});

async function ask(source: Source): Promise<boolean> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  return permission.granted;
}

async function launch(source: Source, request: PhotoRequest): Promise<Attachment[]> {
  const limit = Math.max(1, request.limit ?? 1);
  const crop = limit === 1 && !!request.aspect;
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: QUALITY,
        allowsEditing: !!request.aspect,
        aspect: request.aspect,
      })
      : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: QUALITY,
        allowsEditing: crop,
        aspect: crop ? request.aspect : undefined,
        allowsMultipleSelection: limit > 1,
        selectionLimit: limit > 1 ? limit : undefined,
      });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.slice(0, limit).map((asset, index) => toAttachment(asset, request.title, index));
}

export function usePhotoPicker() {
  const [request, setRequest] = useState<PhotoRequest | null>(null);
  const [denied, setDenied] = useState<Source | null>(null);
  const [failed, setFailed] = useState(false);

  const open = useCallback((next: PhotoRequest) => {
    setDenied(null);
    setFailed(false);
    setRequest(next);
  }, []);

  const close = () => setRequest(null);

  const choose = async (source: Source) => {
    if (!request) return;
    const current = request;
    setDenied(null);
    setFailed(false);
    try {
      if (!(await ask(source))) {
        setDenied(source);
        return;
      }
      setRequest(null);
      await new Promise((resolve) => setTimeout(resolve, SHEET_CLOSE_MS));
      const photos = await launch(source, current);
      if (photos.length) current.onPicked(photos);
    } catch {
      /* A camera that will not open (a simulator has none) is said, not
         swallowed — the sheet comes back with the gallery still on it. */
      setFailed(true);
      setRequest(current);
    }
  };

  const limit = Math.max(1, request?.limit ?? 1);

  const sheet = (
    <BottomSheet
      visible={!!request}
      onClose={close}
      title={request?.title ?? "Add a photo"}
      subtitle="Use a real photo of your food or your restaurant."
      closeButton
    >
      <View style={{ gap: 10 }}>
        <ListRow
          card
          icon="camera-outline"
          iconColor={ui.brandInk}
          iconBackground={ui.brandSkin}
          label="Take a photo"
          description="Open the camera now"
          onPress={() => void choose("camera")}
        />
        <ListRow
          card
          icon="images-outline"
          iconColor={ui.brandInk}
          iconBackground={ui.brandSkin}
          label="Choose from gallery"
          description={limit > 1 ? `Pick up to ${limit} photos from this phone` : "A photo already on this phone"}
          onPress={() => void choose("library")}
        />
        {denied ? (
          <>
            <InfoNote
              tone="warning"
              text={
                denied === "camera"
                  ? "Camera access is off for Lampose Partner. Turn it on in Settings to take photos."
                  : "Photo access is off for Lampose Partner. Turn it on in Settings to choose photos."
              }
            />
            <Button title="Open Settings" variant="secondary" fullWidth onPress={() => void Linking.openSettings()} />
          </>
        ) : null}
        {failed ? <InfoNote tone="danger" text="That did not open. Try again, or choose from the gallery." /> : null}
      </View>
    </BottomSheet>
  );

  return { open, sheet };
}
