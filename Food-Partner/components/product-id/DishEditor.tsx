/* ══════════════════════════════════════════════════════════════════════════
   One dish, edited — the dashboard's editor.

   The same fields, the same rules and the same save as
   `components/common/organisms/ProductForm`, which onboarding's menu step
   still renders; this copy is drawn in the Adios dish-form layout (cards of
   labelled fields, chips, a photo tile) for the signed-in app. If a field is
   added to a dish, add it to both.

   Sectioned rather than a flat list of fifteen fields: Basics, Pricing,
   Options, Details, Tags. Only a name and a price are required; everything
   else improves the listing and none of it should block a partner adding a
   dish at speed.
   ══════════════════════════════════════════════════════════════════════════ */
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";

import { SAMPLE_JPEG } from "@/components/common/utils/formStyles";
import {
  ActionTile,
  Button,
  Card,
  Chip,
  Field,
  IconButton,
  InfoNote,
  ListRow,
  SectionHeader,
  SegmentedControl,
  TextField,
  ToggleSwitch,
  Txt,
} from "@/components/ui";
import { ALLERGENS, PRODUCT_TAGS, SPICE_LEVELS, VEG_LABELS, VEG_TYPES } from "@/constants/partner";
import { dietColor } from "@/lib/diet";
import { uid } from "@/lib/uid";
import type { AddOn, Attachment, MenuItem, SpiceLevel, VegType, Variant } from "@/store/partnerStore";
import { font, ms, radius, size, ui } from "@/theme/ui";

/** Digits only — the same cleaning `NumberField` does for a price or a count. */
const digits = (raw: string) => raw.replace(/\D/g, "");

const SPICE_LABELS: Record<(typeof SPICE_LEVELS)[number], string> = {
  none: "None",
  mild: "Mild",
  medium: "Medium",
  hot: "Hot",
};

export function DishEditor({
  item,
  categories,
  onSave,
  onCancel,
  onDelete,
  busy = false,
}: {
  item: MenuItem;
  /** A save is in flight — Save is disabled so a second tap cannot write a second dish. */
  busy?: boolean;
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
        <TextField
          label="Item name"
          required
          value={draft.productName}
          onChangeText={(v) => set("productName", v)}
          placeholder="e.g. Hyderabadi Chicken Biryani"
          autoCapitalize="sentences"
        />

        <Field label="Category" required>
          <View style={styles.chips}>
            {categories.map((c) => (
              <Chip key={c} label={c} selected={draft.category === c} onPress={() => set("category", c)} />
            ))}
          </View>
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
            autoCapitalize="sentences"
            containerStyle={styles.gapTop}
          />
        </Field>

        <TextField
          label="Description"
          optional
          value={draft.description}
          onChangeText={(v) => set("description", v)}
          placeholder="e.g. Dum-cooked with long grain rice, served with raita"
          autoCapitalize="sentences"
          multiline
        />

        <DishPhoto value={draft.productImage} onChange={(v) => set("productImage", v)} />
      </Section>

      <Section title="Pricing">
        <View style={styles.pair}>
          <TextField
            label="Price"
            required
            value={draft.price}
            onChangeText={(v) => set("price", digits(v))}
            placeholder="320"
            prefix="₹"
            keyboardType="number-pad"
            containerStyle={styles.flex}
          />
          <TextField
            label="Offer price"
            optional
            value={draft.discountedPrice}
            onChangeText={(v) => set("discountedPrice", digits(v))}
            placeholder="289"
            prefix="₹"
            keyboardType="number-pad"
            containerStyle={styles.flex}
          />
        </View>
        {discountBad && <InfoNote tone="danger" text="The offer price has to be below the full price." />}

        <ListRow
          card
          icon={draft.isAvailable ? "checkmark-circle" : "pause-circle-outline"}
          iconColor={draft.isAvailable ? ui.success : ui.sec}
          iconBackground={draft.isAvailable ? ui.successSkin : ui.sunken}
          label="Available to order"
          description="Turn off to keep it on the menu but out of stock"
          right={
            <ToggleSwitch
              value={draft.isAvailable}
              onValueChange={(v) => set("isAvailable", v)}
              accessibilityLabel="Available to order"
            />
          }
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
          <View style={styles.chips}>
            {VEG_TYPES.map((value) => {
              const selected = draft.isVeg === value;
              const color = dietColor(value);
              return (
                <Chip
                  key={value}
                  label={VEG_LABELS[value]}
                  selected={selected}
                  accent={{ accent: color, on: ui.white }}
                  onPress={() => set("isVeg", value as VegType)}
                  icon={<View style={[styles.dietDot, { backgroundColor: selected ? ui.white : color }]} />}
                />
              );
            })}
          </View>
        </Field>

        <Field label="Spice level" optional>
          <SegmentedControl
            segments={SPICE_LEVELS.map((key) => ({ key, label: SPICE_LABELS[key] }))}
            value={draft.spiceLevel}
            onChange={(v) => set("spiceLevel", v as SpiceLevel)}
          />
        </Field>

        <View style={styles.pair}>
          <TextField
            label="Serves"
            optional
            value={draft.serves}
            onChangeText={(v) => set("serves", digits(v))}
            placeholder="2"
            keyboardType="number-pad"
            containerStyle={styles.flex}
          />
          <TextField
            label="Calories"
            optional
            value={draft.calories}
            onChangeText={(v) => set("calories", digits(v))}
            placeholder="310"
            keyboardType="number-pad"
            containerStyle={styles.flex}
          />
        </View>

        <TextField
          label="Preparation time"
          optional
          hint="Only if this dish takes longer than your kitchen average."
          value={draft.preparationTime}
          onChangeText={(v) => set("preparationTime", digits(v))}
          placeholder="35"
          keyboardType="number-pad"
          right={<Txt style={styles.unit}>min</Txt>}
        />
      </Section>

      <Section title="Tags & allergens">
        <Field label="Badges" optional hint="Shown on the item card in the app">
          <View style={styles.chips}>
            {PRODUCT_TAGS.map((tag) => (
              <Chip key={tag} label={tag} selected={draft.tags.includes(tag)} onPress={() => toggle("tags", tag)} />
            ))}
          </View>
        </Field>
        <Field label="Contains" optional hint="Declared to diners with allergies">
          <View style={styles.chips}>
            {ALLERGENS.map((allergen) => (
              <Chip
                key={allergen}
                label={allergen}
                selected={draft.allergenInfo.includes(allergen)}
                onPress={() => toggle("allergenInfo", allergen)}
              />
            ))}
          </View>
        </Field>
      </Section>

      <View style={styles.buttons}>
        <Button
          title={item.productName ? "Save item" : "Add to menu"}
          onPress={save}
          disabled={!ready || busy}
          loading={busy}
          fullWidth
        />
        <View style={styles.pair}>
          <Button title="Cancel" variant="secondary" onPress={onCancel} style={styles.flex} />
          {onDelete ? (
            <Button
              title="Delete"
              variant="danger"
              onPress={onDelete}
              style={styles.flex}
              icon={<Ionicons name="trash-outline" size={18} color={ui.white} />}
            />
          ) : null}
        </View>
      </View>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <SectionHeader title={title} />
      <Card bordered elevationLevel="none" style={styles.card}>
        {children}
      </Card>
    </View>
  );
}

/** The dish photo: a dashed "Add photo" tile, or the photo with Replace and Remove. */
function DishPhoto({ value, onChange }: { value: Attachment | null; onChange: (next: Attachment | null) => void }) {
  const label = "Item photo";
  const pick = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.85,
        allowsEditing: true,
        aspect: [16, 9],
      });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      onChange({ name: a.fileName || `${label}.jpg`, uri: a.uri, size: a.fileSize, mimeType: "image/jpeg" });
    } catch {
      /* Declining the picker is a normal outcome, not an error worth a banner. */
    }
  };

  return (
    <Field label={label} hint="The single biggest thing that decides whether a dish is ordered.">
      <View style={styles.photoRow}>
        {value?.uri ? (
          <TouchableOpacity onPress={pick} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Choose ${label}`}>
            <Image source={{ uri: value.uri }} style={styles.photo} resizeMode="cover" />
          </TouchableOpacity>
        ) : (
          <ActionTile dashed icon="camera-outline" label="Add photo" onPress={pick} />
        )}

        <View style={styles.photoActions}>
          {value ? (
            <>
              <Txt style={styles.fileName} numberOfLines={1}>
                {value.name}
              </Txt>
              <View style={styles.pair}>
                <Button title="Replace" variant="secondary" size="sm" onPress={pick} />
                <Button title="Remove" variant="secondary" size="sm" onPress={() => onChange(null)} />
              </View>
            </>
          ) : (
            <View style={styles.pair}>
              <Button
                title="Choose"
                variant="secondary"
                size="sm"
                onPress={pick}
                icon={<Ionicons name="image-outline" size={16} color={ui.text} />}
              />
              {__DEV__ && (
                <Button
                  title="Sample"
                  variant="secondary"
                  size="sm"
                  onPress={() => onChange({ name: `${label}.jpg`, uri: SAMPLE_JPEG, mimeType: "image/jpeg", size: 160 })}
                  icon={<Ionicons name="sparkles-outline" size={16} color={ui.brandInk} />}
                />
              )}
            </View>
          )}
        </View>
      </View>
    </Field>
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
      <View style={styles.rows}>
        {rows.map((row, i) => (
          <View key={row.id} style={styles.repeatRow}>
            <TextField
              value={row.name}
              onChangeText={(v) => onChange(rows.map((r, idx) => (idx === i ? { ...r, name: v } : r)))}
              placeholder={namePlaceholder}
              autoCapitalize="sentences"
              containerStyle={{ flex: 1.6 }}
            />
            <TextField
              value={row.price}
              onChangeText={(v) => onChange(rows.map((r, idx) => (idx === i ? { ...r, price: digits(v) } : r)))}
              placeholder={pricePlaceholder}
              prefix="₹"
              keyboardType="number-pad"
              containerStyle={styles.flex}
            />
            <IconButton
              icon="trash-outline"
              size={36}
              color={ui.error}
              background={ui.errorSkin}
              accessibilityLabel={`Remove ${row.name || label}`}
              onPress={() => onChange(rows.filter((_, idx) => idx !== i))}
            />
          </View>
        ))}
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => onChange([...rows, { id: uid(), name: "", price: "" }])}
        style={styles.add}
      >
        <Ionicons name="add" size={16} color={ui.brandInk} />
        <Txt style={styles.addText}>Add {label.toLowerCase().replace(/s$/, "")}</Txt>
      </TouchableOpacity>
    </Field>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gapTop: { marginTop: 4 },
  pair: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  unit: { fontFamily: font.body.semibold, fontSize: size.small, color: ui.muted },
  dietDot: { width: 9, height: 9, borderRadius: 5 },

  photoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  photo: { width: ms(132), height: ms(104), borderRadius: radius.md, backgroundColor: ui.sunken },
  photoActions: { flex: 1, minWidth: 0, gap: 8 },
  fileName: { fontFamily: font.body.medium, fontSize: size.small, color: ui.sec },

  rows: { gap: 10 },
  repeatRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  add: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 44,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: ui.brand,
    backgroundColor: ui.brandSkin,
    borderRadius: radius.md,
    marginTop: 4,
  },
  addText: { fontFamily: font.body.semibold, fontSize: size.medium, color: ui.brandInk },

  buttons: { gap: 10, marginTop: 4 },
});
