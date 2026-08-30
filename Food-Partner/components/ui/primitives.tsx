/* ══════════════════════════════════════════════════════════════════════════
   The shared primitives.

   Ported from the driver app, which is itself a port of the customer app's
   Food module: a grey ground, white cards separated by hairlines rather than
   drop shadows, one saturated green, and near-black labels on that green.

   The rule these encode is that a screen names WHAT something is — a tone, a
   variant, a radius role — and never picks the colours. That is what stopped
   the earlier apps drifting: a single colour string can only paint a border,
   so every status chip became an outline. Naming a tone gets all five steps.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextStyle,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import { colors, elevation, radius, space, tone as resolveTone, touch, type ToneName } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

// ─── Rules & headings ─────────────────────────────────────────────────────────

export function Rule({ style, subtle }: { style?: ViewStyle; subtle?: boolean }) {
  return (
    <View
      style={[
        { height: StyleSheet.hairlineWidth, backgroundColor: subtle ? colors.borderSubtle : colors.border },
        style,
      ]}
    />
  );
}

export function Kicker({ children, style }: { children: string; style?: TextStyle }) {
  return (
    <Text variant="eyebrow" color="tertiary" style={style}>
      {children}
    </Text>
  );
}

export function SectionHeader({
  title,
  trailing,
  onPressTrailing,
}: {
  title: string;
  trailing?: string;
  onPressTrailing?: () => void;
}) {
  const right = trailing ? (
    <Text variant="numMeta" color={onPressTrailing ? "brand" : "tertiary"}>
      {trailing}
    </Text>
  ) : null;

  return (
    <View style={styles.sectionHeader}>
      <Text variant="title2" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </Text>
      {onPressTrailing ? (
        <Pressable onPress={onPressTrailing} hitSlop={8} accessibilityRole="button">
          {right}
        </Pressable>
      ) : (
        right
      )}
    </View>
  );
}

// ─── Surfaces ─────────────────────────────────────────────────────────────────

/**
 * A white card on the grey ground — this system's one container.
 *
 * Hairline border rather than a heavy shadow: on a grey ground a 1px edge
 * separates the card without making every list look like it is floating.
 */
export function Card({
  children,
  style,
  tone,
  raised,
  ...rest
}: Omit<ViewProps, "style"> & {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Overrides the hairline with a status colour (an expired licence, an error). */
  tone?: string;
  raised?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: raised ? colors.surfaceRaised : colors.surface },
        tone ? { borderColor: tone } : null,
        style as ViewStyle,
      ]}
      /* Passed through so a purely decorative card can hide itself from screen
         readers — the pitch screen's order ticket is one. */
      {...rest}
    >
      {children}
    </View>
  );
}

/** The same frame, sunk into the ground rather than lifted off it. */
export function Well({
  children,
  style,
  tone,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  tone?: string;
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surfaceSunken, borderColor: colors.borderSubtle },
        tone ? { borderColor: tone } : null,
        style as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A tinted notice — the one way of saying something that is not a row of
 * content. Always a glyph and a word, never colour alone.
 */
export function Notice({
  tone = "info",
  title,
  body,
  glyph,
  style,
}: {
  tone?: ToneName;
  title: string;
  body?: string;
  glyph?: IconName;
  style?: ViewStyle;
}) {
  const t = resolveTone(tone);
  const fallback: IconName = tone === "danger" || tone === "warning" ? "alert" : "info";

  return (
    <View style={[styles.notice, { backgroundColor: t.tint, borderColor: t.border }, style]}>
      <Icon name={glyph ?? fallback} size={18} color={t.ink} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="title3" style={{ color: t.ink }}>
          {title}
        </Text>
        {!!body && (
          <Text variant="caption" style={{ color: t.ink, opacity: 0.85 }}>
            {body}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Label on the left, value on the right, hairline above. */
export function DataRow({
  label,
  value,
  valueTone,
  tabular = true,
  first,
}: {
  label: string;
  value: string;
  valueTone?: string;
  tabular?: boolean;
  first?: boolean;
}) {
  return (
    <View style={[styles.dataRow, !first && styles.dataRowDivided]}>
      <Text variant="body" color="secondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text
        variant={tabular ? "priceMd" : "bodyStrong"}
        color={valueTone ? "inherit" : "primary"}
        style={[{ flexShrink: 1, textAlign: "right" }, valueTone ? { color: valueTone } : null]}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

export type BtnVariant = "ink" | "ghost" | "accent" | "quiet" | "danger";

/**
 * `ink` keeps its name and loses its colour: the primary action is the brand
 * green with a NEAR-BLACK label, because white on this green measures 3.26:1
 * and a 13pt semibold label is not large text. That is also why the pressed
 * state goes lighter — darkening it would squeeze the label that has to stay
 * readable under a thumb.
 */
const BTN: Record<BtnVariant, { bg: string; bgPressed: string; fg: string; border?: string; height: number }> = {
  ink: { bg: colors.brand, bgPressed: colors.brandPressed, fg: colors.onBrand, height: touch.primaryCta },
  ghost: {
    bg: colors.surface,
    bgPressed: colors.surfaceSunken,
    fg: colors.textPrimary,
    border: colors.border,
    height: touch.min,
  },
  accent: {
    bg: colors.brandTint,
    bgPressed: colors.brandOnDark,
    fg: colors.brandInk,
    border: colors.brandOnDark,
    height: touch.min,
  },
  quiet: {
    bg: "transparent",
    bgPressed: colors.surfaceSunken,
    fg: colors.textSecondary,
    border: colors.border,
    height: touch.min,
  },
  danger: {
    bg: colors.danger.tint,
    bgPressed: colors.danger.border,
    fg: colors.danger.ink,
    border: colors.danger.border,
    height: touch.min,
  },
};

export function Btn({
  label,
  onPress,
  variant = "ink",
  large,
  disabled,
  loading,
  glyph,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  large?: boolean;
  disabled?: boolean;
  loading?: boolean;
  glyph?: IconName;
  style?: ViewStyle | ViewStyle[];
}) {
  const v = BTN[variant];
  const inert = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      onPress={inert ? undefined : onPress}
      disabled={inert}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: pressed && !inert ? v.bgPressed : v.bg,
          borderColor: v.border ?? "transparent",
          borderWidth: v.border ? StyleSheet.hairlineWidth : 0,
          minHeight: large ? 60 : v.height,
        },
        inert && styles.disabled,
        style as ViewStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <>
          {glyph ? <Icon name={glyph} size={18} color={v.fg} /> : null}
          <Text variant={large ? "display2" : "title2"} style={{ color: v.fg }} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * A square icon button: 36pt visually, 44pt to a thumb. The visual size is a
 * layout decision and the touch target is not negotiable, so `hitSlop` makes
 * up the difference rather than the box growing.
 */
export function IconBtn({
  children,
  glyph,
  onPress,
  size = touch.iconButtonVisual,
  tone = colors.border,
  fg = colors.textPrimary,
  bg = colors.surface,
  accessibilityLabel,
  style,
}: {
  children?: React.ReactNode;
  glyph?: IconName;
  onPress?: () => void;
  size?: number;
  tone?: string;
  fg?: string;
  bg?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={touch.iconButtonHitSlop}
      style={({ pressed }) => [
        styles.iconBtn,
        { width: size, height: size, borderColor: tone, backgroundColor: pressed ? colors.surfaceSunken : bg },
        style,
      ]}
    >
      {glyph ? <Icon name={glyph} size={Math.round(size * 0.52)} color={fg} /> : children}
    </Pressable>
  );
}

// ─── Chips ────────────────────────────────────────────────────────────────────

/** A STATUS chip: tint fill, ink label, hairline in the same family. Not tappable. */
export function Chip({
  label,
  tone = "muted",
  glyph,
  style,
}: {
  label: string;
  tone?: ToneName;
  glyph?: IconName;
  style?: ViewStyle;
}) {
  const t = resolveTone(tone);
  return (
    <View style={[styles.chip, { backgroundColor: t.tint, borderColor: t.border }, style]}>
      {glyph ? <Icon name={glyph} size={12} color={t.ink} /> : null}
      <Text variant="label" style={{ color: t.ink }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A TAPPABLE multi-select chip — cuisines, days, tags, allergens.
 *
 * Separate from `Chip` because they look similar and behave nothing alike:
 * one reports a state, the other changes it. Merging them is how a status
 * chip ends up with an onPress nobody expected.
 */
export function ChoiceChip({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceChip,
        selected
          ? { backgroundColor: colors.brandTint, borderColor: colors.brandOnDark }
          : { backgroundColor: pressed ? colors.surfaceSunken : colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {selected ? <Icon name="check" size={13} color={colors.brandInk} /> : null}
      <Text variant="title3" style={{ color: selected ? colors.brandInk : colors.textSecondary }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Dot({ tone = colors.textTertiary, size = 8 }: { tone?: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: tone }} />;
}

// ─── Segmented control ────────────────────────────────────────────────────────

/**
 * A sunken track with a white pill on the selection. Filling the selection
 * with ink instead would make a three-option picker look like three primary
 * buttons with two switched off.
 */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  labels,
  style,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  /** Display text per option, when the stored value is not what to show. */
  labels?: Partial<Record<T, string>>;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.seg, style]}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt)}
            style={[
              styles.segOpt,
              active && { backgroundColor: colors.surface, borderColor: colors.border, ...elevation.raised },
            ]}
          >
            <Text variant="title3" color={active ? "primary" : "tertiary"} numberOfLines={1}>
              {labels?.[opt] ?? opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

export function Toggle({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={() => onChange(!value)}
      style={[
        styles.track,
        {
          backgroundColor: value ? colors.brand : colors.surfaceSunken,
          borderColor: value ? colors.brand : colors.border,
          justifyContent: value ? "flex-end" : "flex-start",
        },
      ]}
    >
      <View style={[styles.knob, { backgroundColor: value ? colors.onBrand : colors.surface }]} />
    </Pressable>
  );
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export function Bar({
  pct,
  tone = colors.brand,
  height = 6,
  track = colors.surfaceSunken,
  style,
}: {
  pct: number;
  tone?: string;
  height?: number;
  track?: string;
  style?: ViewStyle;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <View style={[{ height, backgroundColor: track, borderRadius: radius.pill, overflow: "hidden" }, style]}>
      <View style={{ height: "100%", width: `${clamped}%`, backgroundColor: tone, borderRadius: radius.pill }} />
    </View>
  );
}

/** The stepped rail the onboarding flow pins under its header. */
export function StepBars({
  total,
  current,
  height = 4,
  activeTone = colors.brand,
  style,
}: {
  total: number;
  /** Bars at index <= current are filled. */
  current: number;
  height?: number;
  activeTone?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ flexDirection: "row", gap: space[1] + 1 }, style]}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height,
            borderRadius: radius.pill,
            backgroundColor: i <= current ? activeTone : colors.surfaceSunken,
          }}
        />
      ))}
    </View>
  );
}

// ─── Numeric stepper ──────────────────────────────────────────────────────────

/**
 * A minus / value / plus row for the operations numbers — preparation time,
 * delivery radius, order minimums.
 *
 * Holding a button repeats rather than firing once: setting a 45-minute prep
 * time in five-minute steps is nine taps otherwise, on a form that already
 * has a hundred fields.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
  prefix,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  prefix?: string;
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /* The repeat reads the value through a ref: the interval closes over the
     render that started it, so without this it would add one step forever. */
  const latest = useRef(value);
  latest.current = value;

  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const bump = (dir: 1 | -1) => onChange(clamp(latest.current + dir * step));

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  // A component unmounted mid-hold would otherwise leave the interval running.
  useEffect(() => stop, []);

  const hold = (dir: 1 | -1) => {
    stop();
    timer.current = setInterval(() => bump(dir), 110);
  };

  return (
    <View style={styles.stepper}>
      <IconBtn
        glyph="minus"
        accessibilityLabel="Decrease"
        onPress={() => bump(-1)}
        tone="transparent"
        bg="transparent"
        fg={value <= min ? colors.textTertiary : colors.textPrimary}
      />
      <Pressable onLongPress={() => hold(-1)} onPressOut={stop} style={styles.stepperHold} />
      <View style={styles.stepperValue}>
        <Text variant="priceMd">
          {prefix ?? ""}
          {value}
          {suffix ? ` ${suffix}` : ""}
        </Text>
      </View>
      <Pressable onLongPress={() => hold(1)} onPressOut={stop} style={styles.stepperHold} />
      <IconBtn
        glyph="plus"
        accessibilityLabel="Increase"
        onPress={() => bump(1)}
        tone="transparent"
        bg="transparent"
        fg={value >= max ? colors.textTertiary : colors.textPrimary}
      />
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({ name, size = 44 }: { name?: string | null; size?: number }) {
  const initials = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: radius.pill }]}>
      <Text variant="title2" style={{ color: colors.brandInk }}>
        {initials || "?"}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: space[2] },

  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
  },
  notice: {
    flexDirection: "row",
    gap: space[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: space[3],
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    paddingVertical: space[3],
  },
  dataRowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },

  btn: {
    width: "100%",
    flexDirection: "row",
    gap: space[2],
    borderRadius: radius.button,
    paddingHorizontal: space[4],
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
  iconBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.button,
    alignItems: "center",
    justifyContent: "center",
  },

  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.chip,
    paddingHorizontal: space[2],
    paddingVertical: 4,
  },
  choiceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.chip,
    paddingHorizontal: space[3],
    minHeight: 38,
    justifyContent: "center",
  },

  seg: {
    flexDirection: "row",
    gap: space[1],
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.button,
    padding: space[1],
  },
  segOpt: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    borderRadius: radius.chip,
    paddingVertical: space[2],
    paddingHorizontal: space[1],
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
  },

  track: {
    width: 48,
    height: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    padding: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  knob: { width: 20, height: 20, borderRadius: radius.pill },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderInput,
    borderRadius: radius.button,
    paddingHorizontal: space[1],
    minHeight: touch.min,
  },
  /* An invisible sibling that owns the long-press, so the tap target and the
     repeat target do not fight over the same gesture. */
  stepperHold: { position: "absolute", width: 0, height: 0 },
  stepperValue: { flex: 1, alignItems: "center" },

  avatar: {
    backgroundColor: colors.brandTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    alignItems: "center",
    justifyContent: "center",
  },
});
