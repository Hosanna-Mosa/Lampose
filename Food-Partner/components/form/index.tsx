/* ══════════════════════════════════════════════════════════════════════════
   Form atoms for the onboarding flow.

   The website's contact form is eight fields and styles them inline; this
   application is well over a hundred across five steps, so the
   label / hint / control trio lives here once. Everything wears the same
   tokens as the rest of the app and nothing here knows which step it is on.

   These live in one file on purpose: they are always read together, and a
   directory of eleven twenty-line files is harder to hold in your head than
   one that can be scrolled.
   ══════════════════════════════════════════════════════════════════════════ */
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { router } from "expo-router";

import {
  Btn,
  ChoiceChip,
  Icon,
  IconBtn,
  Notice,
  StepBars,
  Text,
  Toggle,
  TopBar,
  type IconName,
} from "@/components/ui";
import { STEPS, TOTAL_STEPS } from "@/constants/partner";
import { humanList } from "@/lib/gates";
import type { Attachment, Slot } from "@/store/partnerStore";
import { colors, layout, radius, space, tone as resolveTone, touch, typeStyle } from "@/theme";

// ─── Label / hint / control ───────────────────────────────────────────────────

export function Field({
  label,
  required,
  optional,
  hint,
  children,
}: {
  label?: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: space[2] }}>
      {!!label && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], flexWrap: "wrap" }}>
          <Text variant="label" color="secondary">
            {label}
          </Text>
          {required && (
            <Text variant="label" style={{ color: colors.danger.base }}>
              *
            </Text>
          )}
          {optional && (
            <Text variant="caption" color="tertiary">
              (optional)
            </Text>
          )}
        </View>
      )}
      {!!hint && (
        <Text variant="caption" color="tertiary">
          {hint}
        </Text>
      )}
      {children}
    </View>
  );
}

/** A section inside a step: an icon tile, a title, and a card of fields. */
export function Block({
  glyph,
  title,
  subtitle,
  children,
}: {
  glyph: IconName;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <View style={styles.blockIco}>
          <Icon name={glyph} size={18} color={colors.brandInk} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title1">{title}</Text>
          {!!subtitle && (
            <Text variant="caption" color="tertiary">
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.blockCard}>{children}</View>
    </View>
  );
}

/** tone: ok | bad | info | warn — mapped onto the theme's semantic set. */
export function Note({
  tone = "info",
  glyph,
  children,
}: {
  tone?: "ok" | "bad" | "info" | "warn";
  glyph?: IconName;
  children: React.ReactNode;
}) {
  const name = tone === "ok" ? "success" : tone === "bad" ? "danger" : tone === "warn" ? "warning" : "info";
  const t = resolveTone(name);
  const fallback: IconName = tone === "ok" ? "check" : tone === "info" ? "info" : "alert";

  return (
    <View style={[styles.note, { backgroundColor: t.tint, borderColor: t.border }]}>
      <Icon name={glyph ?? fallback} size={15} color={t.ink} />
      <Text variant="caption" style={{ color: t.ink, flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

// ─── Text inputs ──────────────────────────────────────────────────────────────

/**
 * A token-styled TextInput.
 *
 * This is the ONE sanctioned place a size is set outside the theme: React
 * Native's TextInput cannot render a <Text> child, so it has to carry the type
 * itself. It reads the `body` variant through `typeStyle` rather than naming a
 * number, which keeps it on the scale.
 */
export function TextField({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = "sentences",
  secureTextEntry,
  maxLength,
  multiline,
  editable = true,
  state,
  prefix,
  right,
  style,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  secureTextEntry?: boolean;
  maxLength?: number;
  multiline?: boolean;
  editable?: boolean;
  state?: "ok" | "bad";
  prefix?: string;
  right?: React.ReactNode;
  style?: ViewStyle;
}) {
  const [focused, setFocused] = useState(false);

  const borderColor =
    state === "bad"
      ? colors.danger.base
      : state === "ok"
        ? colors.success.base
        : focused
          ? colors.brand
          : colors.borderInput;

  return (
    <View
      style={[
        styles.inputWrap,
        { borderColor, backgroundColor: editable ? colors.surface : colors.surfaceSunken },
        multiline && { minHeight: 88, alignItems: "flex-start", paddingVertical: space[2] },
        style,
      ]}
    >
      {!!prefix && (
        <Text variant="bodyStrong" color="secondary">
          {prefix}
        </Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        multiline={multiline}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, typeStyle("body"), { color: editable ? colors.textPrimary : colors.textSecondary }]}
      />
      {right}
    </View>
  );
}

/** Digits (and one decimal point when allowed), with a unit either side. */
export function NumberField({
  value,
  onChangeText,
  placeholder,
  prefix,
  suffix,
  decimals,
  maxLength,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  decimals?: boolean;
  maxLength?: number;
}) {
  const clean = (raw: string) => {
    const stripped = decimals ? raw.replace(/[^0-9.]/g, "") : raw.replace(/\D/g, "");
    if (!decimals) return stripped;
    // Keep only the first decimal point; "12.3.4" is not a number.
    const [head, ...rest] = stripped.split(".");
    return rest.length ? `${head}.${rest.join("")}` : head;
  };

  return (
    <TextField
      value={value}
      onChangeText={(raw) => onChangeText(clean(raw))}
      placeholder={placeholder}
      keyboardType={decimals ? "decimal-pad" : "number-pad"}
      maxLength={maxLength}
      prefix={prefix}
      right={
        suffix ? (
          <Text variant="caption" color="tertiary">
            {suffix}
          </Text>
        ) : undefined
      }
    />
  );
}

// ─── Choices ──────────────────────────────────────────────────────────────────

export function ChoiceChips({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.chipWrap}>
      {options.map((opt) => (
        <ChoiceChip key={opt} label={opt} selected={selected.includes(opt)} onPress={() => onToggle(opt)} />
      ))}
    </View>
  );
}

export function CheckRow({
  checked,
  onChange,
  label,
  sub,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  sub?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.checkRow}
    >
      <View
        style={[
          styles.checkBox,
          checked
            ? { backgroundColor: colors.brand, borderColor: colors.brand }
            : { backgroundColor: colors.surface, borderColor: colors.borderInput },
        ]}
      >
        {checked ? <Icon name="check" size={13} color={colors.onBrand} strokeWidth={2.5} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {!!sub && (
          <Text variant="caption" color="tertiary">
            {sub}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function SwitchRow({
  value,
  onChange,
  label,
  sub,
  glyph,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  sub?: string;
  glyph?: IconName;
}) {
  return (
    <View style={styles.switchRow}>
      {glyph ? <Icon name={glyph} size={18} color={colors.textSecondary} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {!!sub && (
          <Text variant="caption" color="tertiary">
            {sub}
          </Text>
        )}
      </View>
      <Toggle value={value} onChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

// ─── Files & images ───────────────────────────────────────────────────────────

/**
 * Sample attachments.
 *
 * Nothing is uploaded from this form yet — only the file's name travels with
 * the application — so these let the whole flow be walked end to end without
 * hunting for a scan of an FSSAI licence. The sheet sample is real CSV that
 * `readMenuSheet` parses, so the upload path can be tested too.
 */
const SAMPLE_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

const SAMPLE_CSV =
  "category,itemName,price,description,type,isBestseller\n" +
  "Starters,Paneer Tikka,220,Char-grilled cottage cheese,Veg,yes\n" +
  "Main Course,Chicken Biryani,320,Dum-cooked with long grain rice,Non-Veg,yes\n";

const sampleFor = (label: string, kind: PickKind): Attachment => {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (kind === "sheet") {
    return {
      name: `${slug}_sample.csv`,
      uri: `data:text/csv;base64,${globalThis.btoa?.(SAMPLE_CSV) ?? ""}`,
      mimeType: "text/csv",
      size: SAMPLE_CSV.length,
    };
  }
  /* Real image bytes, not a placeholder path: a sample has to survive the
     Cloudinary upload exactly as a real photograph does, or "use a sample"
     would test a route the product never takes. */
  return { name: `${slug}_sample.jpg`, uri: SAMPLE_JPEG, mimeType: "image/jpeg", size: 160 };
};

type PickKind = "image" | "document" | "sheet";

export function FilePick({
  label,
  desc,
  value,
  onChange,
  kind = "document",
}: {
  label: string;
  desc?: string;
  value: Attachment | null;
  onChange: (next: Attachment | null) => void;
  kind?: PickKind;
}) {
  const [error, setError] = useState("");

  const pick = async () => {
    setError("");
    try {
      if (kind === "image") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError("Photo access was declined. You can use a sample instead.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
        if (result.canceled || !result.assets?.length) return;
        const a = result.assets[0];
        onChange({
          name: a.fileName || `${label}.jpg`,
          uri: a.uri,
          size: a.fileSize,
          mimeType: a.mimeType || "image/jpeg",
        });
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: kind === "sheet" ? ["text/csv", "text/comma-separated-values", "*/*"] : ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      onChange({ name: a.name, uri: a.uri, size: a.size ?? undefined, mimeType: a.mimeType ?? undefined });
    } catch {
      // A picker that fails must not take the step down with it.
      setError("That did not work. Try again, or use a sample.");
    }
  };

  if (value) {
    return (
      <View style={styles.fileSet}>
        <Icon name={kind === "sheet" ? "sheet" : "doc"} size={20} color={colors.brandInk} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {value.name}
          </Text>
          {!!value.size && (
            <Text variant="numMeta" color="tertiary">
              {(value.size / 1024).toFixed(0)} KB
            </Text>
          )}
        </View>
        <IconBtn glyph="close" accessibilityLabel={`Remove ${value.name}`} onPress={() => onChange(null)} />
      </View>
    );
  }

  return (
    <View style={styles.drop}>
      <View style={styles.dropIco}>
        <Icon name="upload" size={18} color={colors.brandInk} />
      </View>
      <Text variant="title3">{label}</Text>
      {!!desc && (
        <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
          {desc}
        </Text>
      )}
      {!!error && <Note tone="bad">{error}</Note>}
      <View style={{ flexDirection: "row", gap: space[2], marginTop: space[1] }}>
        <Pressable accessibilityRole="button" onPress={pick} style={styles.dropBtn}>
          <Icon name="upload" size={14} color={colors.textPrimary} />
          <Text variant="title3">Choose a file</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(sampleFor(label, kind))}
          style={styles.dropBtn}
        >
          <Icon name="sparkle" size={14} color={colors.brandInk} />
          <Text variant="title3" color="brand">
            Use a sample
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The logo / cover-banner picker. Shows a real preview of what was chosen. */
export function ImagePick({
  label,
  desc,
  value,
  onChange,
  aspect = "square",
  allowSample = true,
}: {
  label: string;
  desc?: string;
  value: Attachment | null;
  onChange: (next: Attachment | null) => void;
  aspect?: "square" | "wide";
  /**
   * The "Sample" shortcut fills a stock photo in one tap — built for
   * onboarding, where the account is not live yet and dummy data is exactly
   * what a demo or a QA pass wants. A screen editing an ALREADY-APPROVED
   * restaurant's real public image must not offer it: a partner reaching for
   * "Choose" and tapping the wrong button next to it would put a stock photo
   * in front of real diners.
   */
  allowSample?: boolean;
}) {
  const pick = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.85,
        allowsEditing: true,
        aspect: aspect === "square" ? [1, 1] : [16, 9],
      });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      onChange({ name: a.fileName || `${label}.jpg`, uri: a.uri, size: a.fileSize, mimeType: "image/jpeg" });
    } catch {
      /* Declining the picker is a normal outcome, not an error worth a banner. */
    }
  };

  /* Every attachment now carries something an <Image> can render: a picked
     file's local uri, a sample's data uri, or a Cloudinary link once it has
     been uploaded. */
  const showable = !!value?.uri;

  return (
    <Field label={label} hint={desc}>
      <View style={{ flexDirection: "row", gap: space[3], alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose ${label}`}
          onPress={pick}
          style={[styles.imageTile, aspect === "wide" && { width: 132 }]}
        >
          {showable ? (
            <Image source={{ uri: value!.uri }} style={styles.imagePreview} resizeMode="cover" />
          ) : value ? (
            <Icon name="image" size={22} color={colors.brandInk} />
          ) : (
            <Icon name="camera" size={22} color={colors.textTertiary} />
          )}
        </Pressable>

        <View style={{ flex: 1, minWidth: 0, gap: space[2] }}>
          {value ? (
            <>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {value.name}
              </Text>
              <View style={{ flexDirection: "row", gap: space[2] }}>
                <Pressable accessibilityRole="button" onPress={pick} style={styles.dropBtn}>
                  <Text variant="title3">Replace</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => onChange(null)} style={styles.dropBtn}>
                  <Text variant="title3" color="danger">
                    Remove
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={{ flexDirection: "row", gap: space[2] }}>
              <Pressable accessibilityRole="button" onPress={pick} style={styles.dropBtn}>
                <Icon name="image" size={14} color={colors.textPrimary} />
                <Text variant="title3">Choose</Text>
              </Pressable>
              {allowSample && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    onChange({ name: `${label}.jpg`, uri: SAMPLE_JPEG, mimeType: "image/jpeg", size: 160 })
                  }
                  style={styles.dropBtn}
                >
                  <Icon name="sparkle" size={14} color={colors.brandInk} />
                  <Text variant="title3" color="brand">
                    Sample
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </Field>
  );
}

// ─── Time & date ──────────────────────────────────────────────────────────────

const toDate = (hhmm: string): Date => {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
};

const toHHMM = (d: Date): string =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * Two time buttons and the OS picker behind them.
 *
 * Android's picker is a one-shot dialog that must be UNMOUNTED once it fires,
 * and it reports a cancel as `event.type === "dismissed"` rather than by
 * returning nothing. iOS renders inline. Both are handled here so no screen
 * has to think about it.
 */
export function TimeRange({
  slot,
  onChange,
  onRemove,
}: {
  slot: Slot;
  onChange: (next: Slot) => void;
  onRemove?: () => void;
}) {
  const [editing, setEditing] = useState<"open" | "close" | null>(null);

  const onPicked = (event: DateTimePickerEvent, picked?: Date) => {
    const which = editing;
    setEditing(null);
    if (event.type === "dismissed" || !picked || !which) return;
    onChange({ ...slot, [which]: toHHMM(picked) });
  };

  return (
    <View style={styles.timeRow}>
      <Pressable accessibilityRole="button" onPress={() => setEditing("open")} style={styles.timeBtn}>
        <Text variant="numMeta" color="tertiary">
          Opens
        </Text>
        <Text variant="priceMd">{slot.open}</Text>
      </Pressable>

      <Text variant="body" color="tertiary">
        —
      </Text>

      <Pressable accessibilityRole="button" onPress={() => setEditing("close")} style={styles.timeBtn}>
        <Text variant="numMeta" color="tertiary">
          Closes
        </Text>
        <Text variant="priceMd">{slot.close}</Text>
      </Pressable>

      {onRemove ? <IconBtn glyph="trash" accessibilityLabel="Remove this slot" onPress={onRemove} /> : null}

      {editing !== null && (
        <DateTimePicker
          value={toDate(editing === "open" ? slot.open : slot.close)}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onPicked}
        />
      )}
    </View>
  );
}

export function DateField({
  value,
  onChange,
  placeholder = "Select a date",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const onPicked = (event: DateTimePickerEvent, picked?: Date) => {
    setOpen(false);
    if (event.type === "dismissed" || !picked) return;
    onChange(picked.toISOString().slice(0, 10));
  };

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.dateBtn}>
        <Icon name="calendar" size={16} color={colors.textSecondary} />
        <Text variant="body" color={value ? "primary" : "tertiary"} style={{ flex: 1 }}>
          {value || placeholder}
        </Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onPicked}
        />
      )}
    </>
  );
}

// ─── The step frame ───────────────────────────────────────────────────────────

/**
 * The frame all five steps render inside.
 *
 * The counter and its rail are PINNED, not scrolled. This is the one flow
 * where a partner fills long fields with the keyboard up, and "how much of
 * this is left" has to stay answerable without dismissing the keyboard and
 * scrolling back. The footer is pinned for the same reason.
 */
export function StepScaffold({
  step,
  intro,
  children,
  footer,
  onSample,
  onExit,
}: {
  step: number;
  intro?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** Fills this step with sample content. A testing affordance — see the store. */
  onSample?: () => void;
  onExit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const spec = STEPS[step - 1];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        back="the previous step"
        title={`Step ${step} of ${TOTAL_STEPS}`}
        subtitle={spec?.label}
        action="Save & exit"
        onAction={onExit}
      />
      <View style={styles.rail}>
        <StepBars total={TOTAL_STEPS} current={step - 1} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          /* Without this the first tap on a chip only dismisses the keyboard,
             which reads as the control being broken. */
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!!intro && (
            <Text variant="bodyLg" color="secondary">
              {intro}
            </Text>
          )}

          {!!onSample && (
            <Pressable accessibilityRole="button" onPress={onSample} style={styles.sampleBtn}>
              <Icon name="sparkle" size={15} color={colors.brandInk} />
              <Text variant="title3" color="brand">
                Fill this step with sample data
              </Text>
            </Pressable>
          )}

          {children}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>{footer}</View>
    </View>
  );
}

/**
 * A step, wired up: the scaffold, the gate line, and the two footer buttons.
 *
 * Every step needs exactly this arrangement, and the gate line has to sit
 * directly above the disabled button it explains — so the two are assembled
 * here once rather than five times, where they could drift apart.
 */
export function StepFrame({
  step,
  intro,
  children,
  missing,
  onNext,
  onBack,
  onSample,
  nextLabel = "Next step",
  backLabel = "Back",
  gatePrefix = "Still to fill in: ",
  nextLoading,
}: {
  step: number;
  intro?: string;
  children: React.ReactNode;
  /** From `missingFor`. Empty means the step is done. */
  missing: string[];
  onNext: () => void;
  onBack: () => void;
  onSample?: () => void;
  nextLabel?: string;
  backLabel?: string;
  gatePrefix?: string;
  nextLoading?: boolean;
}) {
  return (
    <StepScaffold
      step={step}
      intro={intro}
      onSample={onSample}
      onExit={() => router.replace("/")}
      footer={
        <>
          <Btn label={backLabel} variant="ghost" onPress={onBack} style={{ flex: 1 }} />
          <Btn
            label={nextLabel}
            onPress={onNext}
            disabled={missing.length > 0}
            loading={nextLoading}
            style={{ flex: 1.4 }}
          />
        </>
      }
    >
      {children}
      {missing.length > 0 && <Notice tone="info" glyph="info" title={`${gatePrefix}${humanList(missing)}.`} />}
    </StepScaffold>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  blockIco: {
    width: 36,
    height: 36,
    borderRadius: radius.button,
    backgroundColor: colors.brandTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    alignItems: "center",
    justifyContent: "center",
  },
  blockCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
    gap: space[4],
  },

  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.chip,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: 1.5,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    minHeight: touch.min,
  },
  input: { flex: 1, paddingVertical: space[2], minHeight: touch.min - 4 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },

  checkRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: touch.min },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: radius.chip - 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: touch.min },

  fileSet: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    backgroundColor: colors.brandTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    borderRadius: radius.button,
    padding: space[3],
  },
  drop: {
    alignItems: "center",
    gap: space[2],
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
  },
  dropIco: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  dropBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    minHeight: touch.min - 6,
    justifyContent: "center",
  },

  imageTile: {
    width: 76,
    height: 76,
    borderRadius: radius.button,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  imagePreview: { width: "100%", height: "100%" },

  timeRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  timeBtn: {
    flex: 1,
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderInput,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    minHeight: touch.min,
    justifyContent: "center",
  },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    minHeight: touch.min,
  },

  rail: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[3],
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  body: { padding: layout.gutter, paddingBottom: space[8], gap: space[5] },
  sampleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    backgroundColor: colors.brandTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    borderRadius: radius.button,
    minHeight: touch.min,
  },
  footer: {
    flexDirection: "row",
    gap: space[2],
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
