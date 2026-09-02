/**
 * The inputs the sign-up form is made of.
 *
 * Until this file existed the rider app had no text input outside `auth.tsx`,
 * and the onboarding screens rendered the values a rider was supposed to be
 * entering as `<Text>` — a form nobody could type into. These are the four
 * controls that form actually needs, built on the same tokens as everything
 * else so the sign-up flow does not look like a different app from the job
 * screen it leads to.
 *
 * ## Every field is the same 56pt row
 *
 * Text, choice, date and document all present as one bordered row at
 * `radius.button`, and the focused one is the one with a brand-coloured
 * border. A rider filling this in is standing up, one-handed, on a phone they
 * are also using to read the code we just texted them: the target has to be
 * big and the "which box am I in" has to be obvious without reading anything.
 *
 * ## The error is under the field, not in an alert
 *
 * A form that reports "something is wrong" at the top has to be scrolled to be
 * fixed. Each control takes an `error` and draws it in the danger tone
 * directly beneath itself, with the border tinted to match — and the tint is
 * never the only signal, so the sentence is always there too.
 */
import React from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { colors, radius, space, tone as resolveTone } from "@/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";

/* ── The label / error wrapper every control shares ───────────────────────── */

function FieldShell({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: space[1] }}>
      <View style={styles.labelRow}>
        <Text variant="eyebrow" color="tertiary">
          {label}
        </Text>
        {/* Marked on the OPTIONAL fields rather than the required ones. Almost
            everything a partner account needs is required, so starring those
            would star the whole form and say nothing; naming the three a rider
            may skip is the information they actually want. */}
        {!required && (
          <Text variant="eyebrow" color="tertiary">
            Optional
          </Text>
        )}
      </View>
      {children}
      {!!error && (
        <Text variant="caption" style={{ color: resolveTone("danger").ink }}>
          {error}
        </Text>
      )}
      {!error && !!hint && (
        <Text variant="caption" color="tertiary">
          {hint}
        </Text>
      )}
    </View>
  );
}

const borderFor = (error?: string, focused?: boolean) => {
  if (error) return resolveTone("danger").border;
  if (focused) return colors.brand;
  return colors.borderInput;
};

/* ── Text ─────────────────────────────────────────────────────────────────── */

export type InputProps = Omit<TextInputProps, "style"> & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** A fixed lead-in the rider does not type, like `+91` or `₹`. */
  prefix?: string;
  /** Martian Mono, for a figure. A plate, an IFSC, an account number. */
  mono?: boolean;
};

export function Input({
  label,
  hint,
  error,
  required = true,
  prefix,
  mono,
  ...rest
}: InputProps) {
  const [focused, setFocused] = React.useState(false);

  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      <View style={[styles.row, { borderColor: borderFor(error, focused) }]}>
        {!!prefix && (
          <Text variant="bodyLg" color="tertiary">
            {prefix}
          </Text>
        )}
        <TextInput
          {...rest}
          style={[styles.input, mono && styles.mono]}
          placeholderTextColor={colors.textTertiary}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
        />
      </View>
    </FieldShell>
  );
}

/* ── Choice ───────────────────────────────────────────────────────────────── */

export type Choice<T extends string> = { value: T; label: string };

/**
 * One of a handful of options, as a wrapping row of pills.
 *
 * A picker rather than a modal list because every choice this form makes has
 * four options or fewer — vehicle type, account type — and a native picker for
 * four options is two taps and a sheet where this is one tap and no
 * navigation.
 */
export function ChoiceField<T extends string>({
  label,
  hint,
  error,
  required = true,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  options: readonly Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      <View style={styles.choices}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.choice,
                selected
                  ? { borderColor: colors.brand, backgroundColor: colors.brandTint }
                  : { borderColor: borderFor(error), backgroundColor: colors.surface },
              ]}
            >
              {/* The tick, not only the tint — selection is never carried by
                  colour alone anywhere in this app. */}
              {selected && <Icon name="check" size={14} color={colors.brandInk} />}
              <Text variant="bodyStrong" color={selected ? "brand" : "secondary"}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </FieldShell>
  );
}

/* ── Date ─────────────────────────────────────────────────────────────────── */

/**
 * A date, typed as three numbers rather than spun on a wheel.
 *
 * `@react-native-community/datetimepicker` is a dependency and was the obvious
 * choice, and it is the wrong one for a date of birth: its default view opens
 * on today, and reaching 1996 from there is a lot of scrolling on the one
 * field in this form where every rider knows the answer by heart. Three number
 * boxes are three taps and typing.
 *
 * The value crossing this boundary is an ISO `YYYY-MM-DD` string or `null` —
 * the shape the backend parses — so no caller has to think about time zones.
 * A partially-typed date is `null` rather than a half-built string, which is
 * what makes "is this field filled in" answerable by the form above.
 */
export function DateField({
  label,
  hint,
  error,
  required = true,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const parts = (value || "").split("-");
  const [day, setDay] = React.useState(parts[2] || "");
  const [month, setMonth] = React.useState(parts[1] || "");
  const [year, setYear] = React.useState(parts[0] || "");
  const [focused, setFocused] = React.useState(false);

  const monthRef = React.useRef<TextInput>(null);
  const yearRef = React.useRef<TextInput>(null);

  const emit = (d: string, m: string, y: string) => {
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      const iso = `${y}-${m}-${d}`;
      /* Checked here, not only on the server: `2026-02-31` parses in
         JavaScript as 3 March and would silently store a date the rider did
         not type. Re-reading the components back off the parsed date is the
         cheapest way to catch that. */
      const parsed = new Date(`${iso}T00:00:00Z`);
      const valid = !Number.isNaN(parsed.getTime())
        && parsed.getUTCDate() === Number(d)
        && parsed.getUTCMonth() + 1 === Number(m);
      onChange(valid ? iso : null);
      return;
    }
    onChange(null);
  };

  /* `slot` rather than inferring from the placeholder: the three boxes hold
     one value between them, so each has to say which third of it it is
     writing before `emit` can assemble the other two. */
  const box = (
    slot: "day" | "month" | "year",
    ref: React.RefObject<TextInput | null> | null,
    next?: React.RefObject<TextInput | null>,
  ) => {
    const len = slot === "year" ? 4 : 2;
    const val = slot === "day" ? day : slot === "month" ? month : year;
    const set = slot === "day" ? setDay : slot === "month" ? setMonth : setYear;
    const placeholder = slot === "day" ? "DD" : slot === "month" ? "MM" : "YYYY";

    return (
      <TextInput
        ref={ref ?? undefined}
        style={[styles.dateBox, { flex: len === 4 ? 1.6 : 1 }]}
        value={val}
        onChangeText={(raw) => {
          const digits = raw.replace(/\D/g, "").slice(0, len);
          set(digits);
          /* Hop to the next box the moment this one is full — the whole reason
             three boxes beat one wheel is that it is three taps and typing,
             and a rider who has to tap between them has lost that. */
          if (digits.length === len && next) next.current?.focus();
          emit(
            slot === "day" ? digits : day,
            slot === "month" ? digits : month,
            slot === "year" ? digits : year,
          );
        }}
        keyboardType="number-pad"
        maxLength={len}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    );
  };

  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      <View style={[styles.row, styles.dateRow, { borderColor: borderFor(error, focused) }]}>
        {box("day", null, monthRef)}
        <Text variant="bodyLg" color="tertiary">
          /
        </Text>
        {box("month", monthRef, yearRef)}
        <Text variant="bodyLg" color="tertiary">
          /
        </Text>
        {box("year", yearRef)}
      </View>
    </FieldShell>
  );
}

/* ── A photograph ─────────────────────────────────────────────────────────── */

/**
 * One image slot: a thumbnail once there is one, a dashed target before that.
 *
 * The thumbnail is the whole point. A rider who cannot see what they just sent
 * cannot tell a legible photograph of a licence from a photograph of their
 * thumb, and the person who finds out is an administrator two hours later.
 * Tapping a filled slot replaces it, which is the same gesture as filling an
 * empty one — there is no separate "remove", because an empty slot is not a
 * state a submitted document is allowed to be in.
 */
export function PhotoSlot({
  label,
  uri,
  busy,
  error,
  onPress,
}: {
  label: string;
  uri?: string;
  busy?: boolean;
  error?: string;
  onPress: () => void;
}) {
  const danger = resolveTone("danger");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={uri ? `Replace ${label}` : `Add ${label}`}
      onPress={onPress}
      disabled={busy}
      style={[
        styles.slot,
        {
          borderColor: error ? danger.border : uri ? colors.border : colors.borderInput,
          borderStyle: uri ? "solid" : "dashed",
          backgroundColor: uri ? colors.surface : colors.surfaceSunken,
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.slotImage} resizeMode="cover" />
      ) : (
        <Icon name="camera" size={20} color={colors.textTertiary} />
      )}
      <Text variant="caption" color={uri ? "secondary" : "tertiary"} numberOfLines={1}>
        {busy ? "Uploading…" : uri ? `${label} ✓` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: 1.5,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: space[4],
    height: 56,
  },
  input: { flex: 1, fontSize: 17, color: colors.textPrimary, height: "100%" },
  mono: { fontFamily: "MartianMono_500Medium", fontSize: 15, letterSpacing: 0.5 },

  choices: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: space[4],
    height: 44,
  },

  dateRow: { paddingHorizontal: space[3] },
  dateBox: {
    fontSize: 17,
    color: colors.textPrimary,
    textAlign: "center",
    height: "100%",
    fontFamily: "MartianMono_500Medium",
  },

  slot: {
    flex: 1,
    minHeight: 104,
    borderWidth: 1.5,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    padding: space[2],
    overflow: "hidden",
  },
  slotImage: { width: "100%", height: 60, borderRadius: radius.chip },
});
