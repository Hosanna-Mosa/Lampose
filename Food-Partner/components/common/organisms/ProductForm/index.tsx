/* ══════════════════════════════════════════════════════════════════════════
   One product, edited.

   Its own component because the dashboard's product screen renders the same
   editor as the onboarding step — one definition of what a product is, rather
   than two that drift the first time a field is added.

   Sectioned rather than a flat list of fifteen fields: Basics, Pricing,
   Options, Details, Tags. Only a name and a price are required; everything
   else improves the listing and none of it should block a partner adding a
   dish at speed.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CheckRow } from "@/components/common/molecules/CheckRow";
import { ChoiceChips } from "@/components/common/molecules/ChoiceChips";
import { Field } from "@/components/common/molecules/Field";
import { ImagePick } from "@/components/common/organisms/ImagePick";
import { Note } from "@/components/common/molecules/Note";
import { NumberField } from "@/components/common/molecules/NumberField";
import { TextField } from "@/components/common/molecules/TextField";
import { Btn } from "@/components/common/atoms/Btn";
import { Icon } from "@/components/common/atoms/Icon";
import { IconBtn } from "@/components/common/atoms/IconBtn";
import { Rule } from "@/components/common/atoms/Rule";
import { Seg } from "@/components/common/molecules/Seg";
import { Text } from "@/components/common/atoms/Text";
import { ALLERGENS, PRODUCT_TAGS, SPICE_LEVELS, VEG_LABELS, VEG_TYPES } from "@/constants/partner";
import { uid } from "@/lib/uid";
import type { AddOn, MenuItem, SpiceLevel, VegType, Variant } from "@/store/partnerStore";
import { colors, radius, space, touch } from "@/theme";

export const emptyItem = (category: string): MenuItem => ({
  id: uid(),
  productName: "",
  productImage: null,
  galleryImages: [],
  description: "",
  category,
  isVeg: "veg",
  price: "",
  discountedPrice: "",
  isAvailable: true,
  variants: [],
  addOns: [],
  spiceLevel: "none",
  serves: "",
  tags: [],
  allergenInfo: [],
  calories: "",
  preparationTime: "",
  displayOrder: 0,
});

export function ProductForm({
  item,
  categories,
  onSave,
  onCancel,
  onDelete,
}: {
  item: MenuItem;
  /** Offered as chips so a product can be moved between categories. */
  categories: string[];
  onSave: (next: MenuItem) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<MenuItem>(item);
  const set = <K extends keyof MenuItem>(key: K, value: MenuItem[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const toggle = (key: "tags" | "allergenInfo", value: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value],
    }));

  const price = parseFloat(draft.price || "0");
  const discounted = parseFloat(draft.discountedPrice || "0");
  const discountBad = !!draft.discountedPrice && discounted >= price;

  const ready = draft.productName.trim().length > 0 && !!draft.price && !!draft.category && !discountBad;

  /* An empty row is dropped rather than saved: a partner who taps "add" and
     changes their mind should not create a nameless variant. */
  const save = () =>
    onSave({
      ...draft,
      productName: draft.productName.trim(),
      variants: draft.variants.filter((v) => v.name.trim() && v.price),
      addOns: draft.addOns.filter((a) => a.name.trim() && a.price),
    });

  return (
    <>
      <Section title="Basics">
        <Field label="Item name" required>
          <TextField
            value={draft.productName}
            onChangeText={(v) => set("productName", v)}
            placeholder="e.g. Hyderabadi Chicken Biryani"
          />
        </Field>

        <Field label="Category" required>
          <ChoiceChips
            options={categories}
            selected={[draft.category]}
            onToggle={(v) => set("category", v)}
          />
          {/* The chips above are the restaurant's own existing categories —
              once there is a first dish, that list replaces the starter
              suggestions entirely, and neither ever let a partner introduce a
              name that is not already on it. A new section (e.g. "Beverages",
              the first time this menu sells one) had no way to be created
              from this screen. Blank whenever the chip selection matches a
              real option, so typing here and tapping a chip do not fight —
              whichever happened last is what `draft.category` holds. */}
          <TextField
            value={categories.includes(draft.category) ? "" : draft.category}
            onChangeText={(v) => set("category", v)}
            placeholder="Or type a new category"
            style={{ marginTop: space[2] }}
          />
        </Field>

        <Field label="Description" optional>
          <TextField
            value={draft.description}
            onChangeText={(v) => set("description", v)}
            placeholder="e.g. Dum-cooked with long grain rice, served with raita"
            multiline
          />
        </Field>

        <ImagePick
          label="Item photo"
          desc="The single biggest thing that decides whether a dish is ordered."
          aspect="wide"
          value={draft.productImage}
          onChange={(v) => set("productImage", v)}
        />
      </Section>

      <Section title="Pricing">
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <Field label="Price" required>
              <NumberField value={draft.price} onChangeText={(v) => set("price", v)} placeholder="320" prefix="₹" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Offer price" optional>
              <NumberField
                value={draft.discountedPrice}
                onChangeText={(v) => set("discountedPrice", v)}
                placeholder="289"
                prefix="₹"
              />
            </Field>
          </View>
        </View>
        {discountBad && <Note tone="bad">The offer price has to be below the full price.</Note>}

        <CheckRow
          checked={draft.isAvailable}
          onChange={(v) => set("isAvailable", v)}
          label="Available to order"
          sub="Turn off to keep it on the menu but out of stock"
        />
      </Section>

      <Section title="Options">
        <RepeatRows
          label="Portions"
          hint="Half and full, or small / medium / large"
          rows={draft.variants}
          onChange={(rows) => set("variants", rows as Variant[])}
          namePlaceholder="Half"
          pricePlaceholder="220"
        />
        <RepeatRows
          label="Add-ons"
          hint="Extra cheese, extra raita — charged on top"
          rows={draft.addOns}
          onChange={(rows) => set("addOns", rows as AddOn[])}
          namePlaceholder="Extra raita"
          pricePlaceholder="40"
        />
      </Section>

      <Section title="Details">
        <Field label="Type" required>
          <Seg options={VEG_TYPES} value={draft.isVeg} onChange={(v) => set("isVeg", v as VegType)} labels={VEG_LABELS} />
        </Field>

        <Field label="Spice level" optional>
          <Seg
            options={SPICE_LEVELS}
            value={draft.spiceLevel}
            onChange={(v) => set("spiceLevel", v as SpiceLevel)}
            labels={{ none: "None", mild: "Mild", medium: "Medium", hot: "Hot" }}
          />
        </Field>

        <View style={{ flexDirection: "row", gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <Field label="Serves" optional>
              <NumberField value={draft.serves} onChangeText={(v) => set("serves", v)} placeholder="2" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Calories" optional>
              <NumberField value={draft.calories} onChangeText={(v) => set("calories", v)} placeholder="310" />
            </Field>
          </View>
        </View>

        <Field label="Preparation time" optional hint="Only if this dish takes longer than your kitchen average.">
          <NumberField
            value={draft.preparationTime}
            onChangeText={(v) => set("preparationTime", v)}
            placeholder="35"
            suffix="min"
          />
        </Field>
      </Section>

      <Section title="Tags & allergens">
        <Field label="Badges" optional hint="Shown on the item card in the app">
          <ChoiceChips options={PRODUCT_TAGS} selected={draft.tags} onToggle={(v) => toggle("tags", v)} />
        </Field>
        <Field label="Contains" optional hint="Declared to diners with allergies">
          <ChoiceChips options={ALLERGENS} selected={draft.allergenInfo} onToggle={(v) => toggle("allergenInfo", v)} />
        </Field>
      </Section>

      <View style={{ gap: space[2] }}>
        <Btn label={item.productName ? "Save item" : "Add to menu"} onPress={save} disabled={!ready} />
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <Btn label="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
          {onDelete ? <Btn label="Delete" variant="danger" onPress={onDelete} style={{ flex: 1 }} /> : null}
        </View>
      </View>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space[3] }}>
      <Text variant="eyebrow" color="tertiary">
        {title}
      </Text>
      {children}
      <Rule subtle />
    </View>
  );
}

/** A repeatable name + price list — portions and add-ons are the same shape. */
function RepeatRows({
  label,
  hint,
  rows,
  onChange,
  namePlaceholder,
  pricePlaceholder,
}: {
  label: string;
  hint: string;
  rows: { id: string; name: string; price: string }[];
  onChange: (rows: { id: string; name: string; price: string }[]) => void;
  namePlaceholder: string;
  pricePlaceholder: string;
}) {
  return (
    <Field label={label} hint={hint} optional>
      <View style={{ gap: space[2] }}>
        {rows.map((row, i) => (
          <View key={row.id} style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
            <View style={{ flex: 1.6 }}>
              <TextField
                value={row.name}
                onChangeText={(v) => onChange(rows.map((r, idx) => (idx === i ? { ...r, name: v } : r)))}
                placeholder={namePlaceholder}
              />
            </View>
            <View style={{ flex: 1 }}>
              <NumberField
                value={row.price}
                onChangeText={(v) => onChange(rows.map((r, idx) => (idx === i ? { ...r, price: v } : r)))}
                placeholder={pricePlaceholder}
                prefix="₹"
              />
            </View>
            <IconBtn
              glyph="trash"
              accessibilityLabel={`Remove ${row.name || label}`}
              onPress={() => onChange(rows.filter((_, idx) => idx !== i))}
            />
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => onChange([...rows, { id: uid(), name: "", price: "" }])}
        style={styles.add}
      >
        <Icon name="plus" size={14} color={colors.brandInk} />
        <Text variant="title3" color="brand">
          Add {label.toLowerCase().replace(/s$/, "")}
        </Text>
      </Pressable>
    </Field>
  );
}

const styles = StyleSheet.create({
  add: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[1],
    minHeight: touch.min,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: colors.brandOnDark,
    borderRadius: radius.button,
    marginTop: space[2],
  },
});
