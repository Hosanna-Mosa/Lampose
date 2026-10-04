/* ══════════════════════════════════════════════════════════════════════════
   Add or edit one dish, against the real menu.

   `/product/new` creates; `/product/<productId>` edits the row loaded from
   `GET /me/products`. The editor is `DishEditor` — the same fields and rules
   as the onboarding step's `ProductForm`, drawn in the dashboard's layout.

   Every field the schema stores is editable here, images included. A delete
   is behind a confirmation: it is permanent, and the row it removes is one
   diners may be looking at.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";

import { emptyItem } from "@/components/common";
import { AlertDialog, Header, InfoNote, ScreenShell } from "@/components/ui";
import { MENU_CATEGORY_SUGGESTIONS } from "@/constants/partner";
import { uid } from "@/lib/uid";
import {
  createProduct,
  deleteProduct as deleteProductRequest,
  listMyProducts,
  productBody,
  updateProduct,
  type ServerProduct,
} from "@/services/foodPartner";
import { uploadMany, uploadOne } from "@/services/uploads";
import { usePartnerStore, type MenuItem, type SpiceLevel } from "@/store/partnerStore";
import { ui } from "@/theme/ui";
import { DishEditor } from "./DishEditor";

/** A stored row, back into the shape the shared editor works in. */
const toMenuItem = (p: ServerProduct): MenuItem => ({
  id: p.productId,
  productName: p.productName ?? "",
  productImage: p.productImage?.url
    ? { name: "photo", uri: p.productImage.url, url: p.productImage.url, publicId: p.productImage.publicId }
    : null,
  galleryImages: (p.galleryImages ?? [])
    .filter((g) => !!g.url)
    .map((g) => ({ name: "photo", uri: g.url as string, url: g.url, publicId: g.publicId })),
  description: p.description ?? "",
  category: p.category ?? "",
  isVeg: p.isVeg ?? "veg",
  price: p.price != null ? String(p.price) : "",
  discountedPrice: p.discountedPrice != null ? String(p.discountedPrice) : "",
  isAvailable: p.isAvailable ?? true,
  variants: (p.variants ?? []).map((v) => ({ id: uid(), name: v.name, price: String(v.price) })),
  addOns: (p.addOns ?? []).map((a) => ({ id: uid(), name: a.name, price: String(a.price) })),
  spiceLevel: ((p.spiceLevel as SpiceLevel) ?? "none") || "none",
  serves: p.serves != null ? String(p.serves) : "",
  tags: p.tags ?? [],
  allergenInfo: p.allergenInfo ?? [],
  calories: p.calories != null ? String(p.calories) : "",
  preparationTime: p.preparationTime != null ? String(p.preparationTime) : "",
  displayOrder: p.displayOrder ?? 0,
});

export function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = usePartnerStore((s) => s.session);
  const isNew = id === "new";

  const [item, setItem] = useState<MenuItem | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState("");

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
      const menu = await listMyProducts(session.token);
      /* The category list comes from the menu that exists, plus the standard
         suggestions, so a new dish can join an existing section or start one. */
      const existing = Array.from(new Set(menu.map((p) => p.category).filter(Boolean)));
      setCategories(existing.length ? existing : [...MENU_CATEGORY_SUGGESTIONS]);

      if (isNew) {
        setItem(emptyItem(existing[0] ?? MENU_CATEGORY_SUGGESTIONS[0]));
      } else {
        const found = menu.find((p) => p.productId === id);
        if (!found) {
          setError("That dish is no longer on your menu.");
          setItem(null);
        } else {
          setItem(toMenuItem(found));
        }
      }
    } catch (err) {
      setError((err as Error)?.message || "We could not load that dish.");
    } finally {
      setLoading(false);
    }
  }, [session?.token, id, isNew]);

  useEffect(() => {
    void load();
  }, [load]);

  /* One write per tap: `uploading` is state and lands a render late, so a
     double tap reached `createProduct` twice and made two dishes. */
  const saving = useRef(false);
  const save = async (next: MenuItem) => {
    if (!session?.token || saving.current) return;
    saving.current = true;
    setError("");
    try {
      /* The photograph goes to Cloudinary before the dish is written, so the
         row stores a link everyone can read rather than a path that only means
         something on this handset. Already-uploaded images are skipped. */
      let ready = next;
      if (next.productImage && !next.productImage.url?.startsWith("http")) {
        setUploading("Uploading the photo…");
        ready = { ...ready, productImage: await uploadOne(next.productImage, "product", session.token) };
      }
      if (next.galleryImages.some((g) => !g.url?.startsWith("http"))) {
        setUploading("Uploading the gallery…");
        ready = { ...ready, galleryImages: await uploadMany(next.galleryImages, "gallery", session.token) };
      }
      setUploading("Saving…");

      const body = productBody(ready, ready.category);
      if (isNew) await createProduct(session.token, body);
      else await updateProduct(session.token, String(id), body);
      router.back();
    } catch (err) {
      setError((err as Error)?.message || "That did not save.");
    } finally {
      setUploading("");
      saving.current = false;
    }
  };

  const remove = async () => {
    if (!session?.token || isNew) return;
    setConfirmDelete(false);
    try {
      await deleteProductRequest(session.token, String(id));
      router.back();
    } catch (err) {
      setError((err as Error)?.message || "That did not delete.");
    }
  };

  const title = useMemo(
    () => (isNew ? "Add a dish" : item?.productName || "Edit dish"),
    [isNew, item?.productName],
  );

  return (
    <ScreenShell
      keyboardAvoiding
      header={<Header title={title} onBack={() => router.back()} backLabel="Back to the menu" />}
      scroll
      contentStyle={styles.body}
    >
      {!!error && <InfoNote tone="danger" text={error} />}
      {!!uploading && <InfoNote tone="info" icon="cloud-upload-outline" text={uploading} />}

      {loading ? (
        <ActivityIndicator size="large" color={ui.brand} style={styles.loader} />
      ) : item ? (
        <DishEditor
          item={item}
          categories={categories}
          onSave={save}
          busy={!!uploading}
          onCancel={() => router.back()}
          onDelete={isNew ? undefined : () => setConfirmDelete(true)}
        />
      ) : null}

      <AlertDialog
        visible={confirmDelete}
        tone="danger"
        kicker="Cannot be undone"
        title={`Delete ${item?.productName || "this dish"}?`}
        message="It is removed from your menu immediately, including for anybody looking at it right now."
        onDismiss={() => setConfirmDelete(false)}
        actions={[
          { text: "Delete it", style: "destructive", onPress: remove },
          { text: "Keep it", style: "cancel", onPress: () => setConfirmDelete(false) },
        ]}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 20 },
  loader: { marginTop: 40 },
});
