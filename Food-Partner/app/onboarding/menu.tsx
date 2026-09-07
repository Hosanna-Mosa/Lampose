/* ══════════════════════════════════════════════════════════════════════════
   Step 3 — Menu & Products.

   Categories hold items; an item is everything the field spec asks for, edited
   in a sheet by `ProductForm`. The website's spreadsheet route is kept, minus
   XLSX: that format is a zip inflated with DecompressionStream, which React
   Native does not have, so the app asks for CSV and says so.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Block, Field, FilePick, Note, StepFrame, TextField } from "@/components/form";
import { ProductForm, emptyItem } from "@/components/onboarding/ProductForm";
import { Btn, Card, Chip, Icon, IconBtn, ModalSheet, Seg, Text } from "@/components/ui";
import { COPY, MENU_CATEGORY_SUGGESTIONS, MENU_COLUMNS } from "@/constants/partner";
import { missingFor } from "@/lib/gates";
import { readMenuSheet } from "@/lib/menuSheet";
import { usePartnerStore, type MenuItem } from "@/store/partnerStore";
import { colors, radius, space, touch } from "@/theme";

type Editing = { categoryId: string; item: MenuItem; isNew: boolean } | null;

export default function StepMenu() {
  const data = usePartnerStore((s) => s.data);
  const set = usePartnerStore((s) => s.set);
  const patch = usePartnerStore((s) => s.patch);
  const addCategory = usePartnerStore((s) => s.addCategory);
  const removeCategory = usePartnerStore((s) => s.removeCategory);
  const saveItem = usePartnerStore((s) => s.saveItem);
  const removeItem = usePartnerStore((s) => s.removeItem);
  const setRowImage = usePartnerStore((s) => s.setRowImage);
  const fillSample = usePartnerStore((s) => s.fillSample);

  const [editing, setEditing] = useState<Editing>(null);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");

  const missing = missingFor(3, data, COPY);
  const categoryNames = data.menuCategories.map((c) => c.name);
  const items = data.menuCategories.flatMap((c) => c.items);
  const noPhoto = items.filter((i) => !i.productImage).length;

  /**
   * A `data:` URI — what "Use a sample" hands back, see `sampleFor` in
   * `components/form` — never touches the network, and React Native's
   * `fetch` cannot read that scheme at all: it throws the same generic
   * "Network request failed" a real dropped connection would, which is what
   * sent us looking here rather than at a parsing bug. Decode it directly and
   * reserve `fetch()` for what it is actually for — a real picked file's
   * `file://`/`content://` cache path.
   */
  const readAttachmentText = async (uri: string): Promise<string> => {
    const dataUri = /^data:[^,]*,(.*)$/s.exec(uri);
    if (dataUri) return decodeURIComponent(dataUri[1]);
    const res = await fetch(uri);
    return res.text();
  };

  const readSheet = async (file: typeof data.menuFile) => {
    patch({ menuFile: file, menuValid: false, menuError: "", menuRows: [] });
    if (!file) return;
    try {
      const text = await readAttachmentText(file.uri);
      patch({ menuRows: readMenuSheet(text), menuValid: true });
    } catch (err) {
      patch({ menuError: (err as Error)?.message || "Unable to read the uploaded menu sheet." });
    }
  };

  return (
    <StepFrame
      step={3}
      intro={COPY.menuHelp}
      onSample={() => fillSample(3)}
      missing={missing}
      onNext={() => router.push("/onboarding/documents")}
      onBack={() => router.back()}
    >
      {items.length > 0 && (
        <Card style={styles.summary}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="priceLg">{items.length}</Text>
            <Text variant="caption" color="tertiary">
              items across {data.menuCategories.length} categor{data.menuCategories.length === 1 ? "y" : "ies"}
            </Text>
          </View>
          {noPhoto > 0 && <Chip label={`${noPhoto} without a photo`} tone="warning" glyph="alert" />}
        </Card>
      )}

      <Field label="How would you like to set the menu up?">
        <Seg
          options={["manual", "upload"] as const}
          value={data.menuMode}
          onChange={(v) => set("menuMode", v)}
          labels={{ manual: "Type them in", upload: "Upload a sheet" }}
        />
      </Field>

      {data.menuMode === "upload" ? (
        <Block glyph="sheet" title="Upload your menu">
          <Note tone="info">Columns required: {MENU_COLUMNS.join(", ")}. CSV only.</Note>

          <FilePick
            label="Menu sheet"
            desc="Your completed CSV menu"
            kind="sheet"
            value={data.menuFile}
            onChange={readSheet}
          />

          {!!data.menuError && <Note tone="bad">{data.menuError}</Note>}
          {data.menuValid && !!data.menuFile && (
            <Note tone="ok">
              Sheet read — {data.menuRows.length} item{data.menuRows.length === 1 ? "" : "s"} found. Add a
              photo for each below.
            </Note>
          )}

          {/* A five-column table does not survive a 390pt frame, so the
              website's table becomes one card per row. This is the only place
              the partner can see which item each photo belongs to. */}
          {data.menuRows.map((row) => (
            <Card key={row.id} raised style={{ gap: space[2] }}>
              <Text variant="eyebrow" color="tertiary">
                {row.category || "Uncategorised"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                <Text variant="title2" style={{ flex: 1 }} numberOfLines={1}>
                  {row.itemName || "—"}
                </Text>
                <Text variant="priceMd">₹{row.price || "—"}</Text>
              </View>
              <FilePick
                label="Photo"
                kind="image"
                value={row.image}
                onChange={(img) => setRowImage(row.id, img)}
              />
            </Card>
          ))}

          {data.menuRows.length > 0 && (
            <Note tone="info">
              Once you submit, our onboarding team checks the sheet and the photos, confirms the prices
              with you, and sets the menu up within 24 hours.
            </Note>
          )}
        </Block>
      ) : (
        <Block glyph="menu" title="Categories & items" subtitle={COPY.manualCategoryHelp}>
          {data.menuCategories.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="menu" size={26} color={colors.textTertiary} />
              <Text variant="title1">{COPY.manualEmptyTitle}</Text>
              <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
                {COPY.manualEmptyHelp}
              </Text>
              <View style={styles.chipWrap}>
                {MENU_CATEGORY_SUGGESTIONS.map((s) => (
                  <Pressable key={s} accessibilityRole="button" onPress={() => addCategory(s)} style={styles.suggest}>
                    <Icon name="plus" size={12} color={colors.brandInk} />
                    <Text variant="title3" color="brand">
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            data.menuCategories.map((category) => (
              <View key={category.id} style={styles.category}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="title1">{category.name}</Text>
                    <Text variant="caption" color="tertiary">
                      {category.items.length} item{category.items.length === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <IconBtn
                    glyph="trash"
                    accessibilityLabel={`Remove ${category.name}`}
                    onPress={() => removeCategory(category.id)}
                  />
                </View>

                {category.items.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${item.productName}`}
                    onPress={() => setEditing({ categoryId: category.id, item, isNew: false })}
                    style={styles.itemRow}
                  >
                    <View style={[styles.veg, { borderColor: item.isVeg === "veg" ? colors.success.base : colors.danger.base }]}>
                      <View
                        style={[
                          styles.vegDot,
                          { backgroundColor: item.isVeg === "veg" ? colors.success.base : colors.danger.base },
                        ]}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text variant="title2" numberOfLines={1}>
                        {item.productName}
                      </Text>
                      {!!item.tags.length && (
                        <Text variant="caption" color="brand">
                          {item.tags.join(" · ")}
                        </Text>
                      )}
                    </View>
                    <Text variant="priceMd">₹{item.discountedPrice || item.price}</Text>
                    <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                  </Pressable>
                ))}

                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setEditing({ categoryId: category.id, item: emptyItem(category.name), isNew: true })
                  }
                  style={styles.addItem}
                >
                  <Icon name="plus" size={14} color={colors.brandInk} />
                  <Text variant="title3" color="brand">
                    Add an item
                  </Text>
                </Pressable>
              </View>
            ))
          )}

          <Btn label="Add a category" variant="ghost" glyph="plus" onPress={() => setNaming(true)} />
        </Block>
      )}

      {/* ── Naming a category ─────────────────────────────────────────── */}
      <ModalSheet
        visible={naming}
        title="Add a category"
        onClose={() => {
          setNaming(false);
          setNewName("");
        }}
        footer={
          <Btn
            label="Add category"
            disabled={!newName.trim()}
            onPress={() => {
              addCategory(newName.trim());
              setNewName("");
              setNaming(false);
            }}
          />
        }
      >
        <Field label="Category name" required>
          <TextField value={newName} onChangeText={setNewName} placeholder="e.g. Starters" />
        </Field>
        <View style={styles.chipWrap}>
          {MENU_CATEGORY_SUGGESTIONS.filter((s) => !categoryNames.includes(s)).map((s) => (
            <Pressable key={s} accessibilityRole="button" onPress={() => setNewName(s)} style={styles.suggest}>
              <Text variant="title3" color="brand">
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      </ModalSheet>

      {/* ── Editing an item ───────────────────────────────────────────── */}
      <ModalSheet
        visible={editing !== null}
        title={editing?.isNew ? "Add an item" : "Edit item"}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <ProductForm
            item={editing.item}
            categories={categoryNames}
            onSave={(next) => {
              saveItem(editing.categoryId, next);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
            onDelete={
              editing.isNew
                ? undefined
                : () => {
                    removeItem(editing.categoryId, editing.item.id);
                    setEditing(null);
                  }
            }
          />
        )}
      </ModalSheet>
    </StepFrame>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: space[3] },
  empty: { alignItems: "center", gap: space[2], paddingVertical: space[4] },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2], justifyContent: "center" },
  suggest: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    backgroundColor: colors.brandTint,
    borderRadius: radius.chip,
    paddingHorizontal: space[3],
    minHeight: 36,
  },
  category: {
    gap: space[2],
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.card,
    padding: space[3],
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    padding: space[3],
    minHeight: touch.listRow,
  },
  veg: { width: 14, height: 14, borderWidth: 1.5, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  vegDot: { width: 6, height: 6, borderRadius: radius.pill },
  addItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[1],
    minHeight: touch.min,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: colors.brandOnDark,
    borderRadius: radius.button,
  },
});
