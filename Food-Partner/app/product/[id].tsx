/* ══════════════════════════════════════════════════════════════════════════
   Add or edit one dish, against the real menu.

   `/product/new` creates; `/product/<productId>` edits the row loaded from
   `GET /me/products`. It renders the SAME `ProductForm` the onboarding step
   uses, so there is one definition of what a dish is rather than two that
   drift the first time a field is added.

   Every field the schema stores is editable here, images included. A delete
   is behind a confirm sheet: it is permanent, and the row it removes is one
   diners may be looking at.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Note } from "@/components/form";
import { ProductForm, emptyItem } from "@/components/onboarding/ProductForm";
import { ConfirmSheet, Text, TopBar } from "@/components/ui";
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
import { colors, layout, space } from "@/theme";

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

export default function ProductScreen() {
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
    if (!session?.token) return;
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

  const save = async (next: MenuItem) => {
    if (!session?.token) return;
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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar back="the menu" title={title} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!!error && <Note tone="bad">{error}</Note>}
        {!!uploading && <Note tone="info">{uploading}</Note>}

        {loading ? (
          <Text variant="body" color="tertiary">
            Loading…
          </Text>
        ) : item ? (
          <ProductForm
            item={item}
            categories={categories}
            onSave={save}
            onCancel={() => router.back()}
            onDelete={isNew ? undefined : () => setConfirmDelete(true)}
          />
        ) : null}
      </ScrollView>

      <ConfirmSheet
        visible={confirmDelete}
        onDismiss={() => setConfirmDelete(false)}
        onPrimary={remove}
        spec={{
          kicker: "Cannot be undone",
          tone: "danger",
          title: `Delete ${item?.productName || "this dish"}?`,
          body: "It is removed from your menu immediately, including for anybody looking at it right now.",
          primary: "Delete it",
          secondary: "Keep it",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: layout.gutter, gap: space[4], paddingBottom: space[10] },
});
