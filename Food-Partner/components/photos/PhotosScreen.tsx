/* ══════════════════════════════════════════════════════════════════════════
   Photos — everything a diner sees of this restaurant before the menu.

     logo                the square on the listing card     PATCH /me logoImage
     cover               the wide picture across the top    PATCH /me coverBannerImage
     restaurant photos   food, the room, the counter        PATCH /me galleryImages

   Dish photos are not here: each is on its dish, in the Menu tab, so a photo
   is never separated from the dish it shows.

   ## Only real photographs

   Every picture comes from this phone's camera or gallery and is uploaded to
   `POST /uploads/images` before it is saved — the server refuses anything
   that is not an uploaded link, so a local file or a stand-in cannot reach a
   diner's screen. There is no sample button anywhere on this screen.

   ## One save, uploads first

   Nothing is uploaded until Save, and only what changed: a new logo, a new
   cover, the photos added since the last save. The photo list is sent whole,
   in its order — removing one is saving the list without it.

   A logo or cover can be REPLACED but not removed: the server will not blank
   the listing card's picture. "Remove" on a new pick undoes it, back to the
   one that is live.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ImagePick } from "@/components/common";
import {
  Button,
  Card,
  CardSkeleton,
  Header,
  InfoNote,
  ListGroup,
  ListRow,
  PhotoGrid,
  ScreenShell,
  Txt,
} from "@/components/ui";
import { getMe, updateMe, type ServerImage, type ServerRestaurant } from "@/services/foodPartner";
import { isUploaded, uploadOne } from "@/services/uploads";
import { usePartnerStore, type Attachment } from "@/store/partnerStore";
import { font, line, size, ui } from "@/theme/ui";

/** The server's own cap — `MAX_RESTAURANT_PHOTOS` in `foodRestaurant.model.js`. */
export const MAX_RESTAURANT_PHOTOS = 12;

const asAttachment = (image: ServerImage | undefined, name: string): Attachment | null =>
  image?.url ? { name, uri: image.url, url: image.url, publicId: image.publicId ?? "" } : null;

const storedPhotos = (restaurant: ServerRestaurant | null): Attachment[] =>
  (restaurant?.galleryImages ?? [])
    .filter((image) => !!image.url)
    .map((image, index) => ({
      name: `Photo ${index + 1}`,
      uri: image.url as string,
      url: image.url,
      publicId: image.publicId ?? "",
    }));

const sameList = (a: Attachment[], b: Attachment[]) =>
  a.length === b.length && a.every((photo, index) => photo.uri === b[index].uri);

export function PhotosScreen() {
  const insets = useSafeAreaInsets();
  const session = usePartnerStore((s) => s.session);

  const [me, setMe] = useState<ServerRestaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [logo, setLogo] = useState<Attachment | null>(null);
  const [cover, setCover] = useState<Attachment | null>(null);
  const [photos, setPhotos] = useState<Attachment[]>([]);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const adopt = (restaurant: ServerRestaurant) => {
    setMe(restaurant);
    setLogo(asAttachment(restaurant.logoImage, "Logo"));
    setCover(asAttachment(restaurant.coverBannerImage, "Cover"));
    setPhotos(storedPhotos(restaurant));
  };

  const load = useCallback(async () => {
    if (!session?.token) {
      setLoading(false);
      setLoadError("You are signed out. Sign in again to continue.");
      return;
    }
    setLoadError("");
    try {
      adopt(await getMe(session.token));
    } catch (err) {
      setLoadError((err as Error)?.message || "Your photos did not load. Pull down to try again.");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    void load();
  }, [load]);

  const pull = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const logoChanged = !!logo && logo.uri !== me?.logoImage?.url;
  const coverChanged = !!cover && cover.uri !== me?.coverBannerImage?.url;
  const photosChanged = !sameList(photos, storedPhotos(me));
  const dirty = logoChanged || coverChanged || photosChanged;

  const edited = () => {
    setNote("");
    setError("");
  };

  const save = async () => {
    if (!session?.token || !me || !dirty) return;
    setSaving(true);
    edited();
    try {
      /* Everything new goes up first, one at a time and counted — a dozen
         photos from a phone camera is the slowest thing this screen does. */
      const pending = [logoChanged, coverChanged].filter(Boolean).length
        + (photosChanged ? photos.filter((photo) => !isUploaded(photo)).length : 0);
      let done = 0;
      const upload = async (file: Attachment, kind: "logo" | "cover" | "gallery") => {
        if (isUploaded(file)) return file;
        done += 1;
        setProgress(`Uploading photo ${done} of ${pending}…`);
        return uploadOne(file, kind, session.token);
      };

      const body: Record<string, unknown> = {};
      if (logoChanged && logo) {
        const up = await upload(logo, "logo");
        body.logoImage = { url: up.url, publicId: up.publicId };
      }
      if (coverChanged && cover) {
        const up = await upload(cover, "cover");
        body.coverBannerImage = { url: up.url, publicId: up.publicId };
      }
      if (photosChanged) {
        const uploaded: Attachment[] = [];
        for (const photo of photos) uploaded.push(await upload(photo, "gallery"));
        body.galleryImages = uploaded.map((photo) => ({ url: photo.url, publicId: photo.publicId }));
      }

      setProgress("Saving…");
      adopt(await updateMe(session.token, body));
      setNote("Saved. Diners see these photos in the Lampose app now.");
    } catch (err) {
      setError((err as Error)?.message || "The photos did not save. Check your connection and try again.");
    } finally {
      setSaving(false);
      setProgress("");
    }
  };

  return (
    <ScreenShell
      header={<Header title="Photos" onBack={() => router.back()} />}
      scroll
      refreshing={refreshing}
      onRefresh={pull}
      contentStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
      footer={
        me ? (
          <Button
            title={saving ? progress || "Saving…" : dirty ? "Save photos" : "No changes to save"}
            onPress={save}
            loading={saving}
            disabled={!dirty || saving}
            fullWidth
          />
        ) : undefined
      }
    >
      {!!loadError && <InfoNote tone="danger" text={loadError} />}
      {loading && !me && <CardSkeleton count={2} />}

      {me && (
        <>
          <InfoNote
            tone="info"
            text="Diners see these on your restaurant in the Lampose app. Use real photos of your own food and place — take them now, or choose them from your gallery."
          />

          <ListGroup title="Logo and cover" grouped={false} delay={40}>
            <Card bordered elevationLevel="none" style={styles.form}>
              <ImagePick
                label="Logo"
                desc="Square. Shown beside your name."
                value={logo}
                allowRemove={logoChanged}
                onChange={(next) => {
                  setLogo(next ?? asAttachment(me.logoImage, "Logo"));
                  edited();
                }}
              />
              <ImagePick
                label="Cover photo"
                desc="Wide. The picture on your listing card and across the top of your page."
                aspect="wide"
                value={cover}
                allowRemove={coverChanged}
                onChange={(next) => {
                  setCover(next ?? asAttachment(me.coverBannerImage, "Cover"));
                  edited();
                }}
              />
            </Card>
          </ListGroup>

          <ListGroup title="Restaurant photos" grouped={false} delay={80}>
            <Card bordered elevationLevel="none" style={styles.form}>
              <Txt style={styles.hint}>
                Your best dishes, the dining area, the counter. They are shown on your restaurant page — and help
                diners choose a table for dine-in.
              </Txt>
              <PhotoGrid
                title="Restaurant photos"
                photos={photos}
                max={MAX_RESTAURANT_PHOTOS}
                onChange={(next) => {
                  setPhotos(next);
                  edited();
                }}
              />
            </Card>
          </ListGroup>

          <ListGroup title="Dish photos" delay={120}>
            <ListRow
              icon="restaurant-outline"
              iconColor={ui.warning}
              iconBackground={ui.warningSkin}
              label="Add photos to your dishes"
              description="Each dish has its own photos. Open a dish in the Menu tab to add them."
              onPress={() => router.navigate("/(dash)/menu")}
            />
          </ListGroup>

          {!!error && <InfoNote tone="danger" text={error} style={styles.note} />}
          {!!note && <InfoNote tone="success" text={note} style={styles.note} />}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8 },
  form: { gap: 16 },
  hint: { fontFamily: font.body.medium, fontSize: size.medium, lineHeight: line.medium, color: ui.sec },
  note: { marginTop: 16 },
});
