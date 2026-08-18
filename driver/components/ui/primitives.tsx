import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextStyle, View, ViewStyle } from "react-native";
import { colors, elevation, radius, space, tone as resolveTone, touch, type ToneName } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

// ─── Rules & eyebrows ─────────────────────────────────────────────────────────

export function Rule({ style, subtle }: { style?: ViewStyle; subtle?: boolean }) {
  return (
    <View
      style={[{ height: StyleSheet.hairlineWidth, backgroundColor: subtle ? colors.borderSubtle : colors.border }, style]}
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

/** Section heading: a title on the left, an optional count or link on the right. */
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
 * A white card on the grey ground — the food module's one container.
 *
 * Hairline border rather than a heavy shadow: on a grey ground a 1px edge
 * separates the card without the drop shadow that would make every list look
 * like it is floating.
 */
export function Card({
  children,
  style,
  tone,
  raised,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Overrides the hairline with a status colour (expired docs, errors). */
  tone?: string;
  /** Lifts the card off another card — used where a card nests. */
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
 * A tinted notice — the food module's one way of saying something that is not
 * a row of content. Always a glyph and a word, never colour alone.
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
    <View
      style={[
        styles.notice,
        { backgroundColor: t.tint, borderColor: t.border },
        style,
      ]}
    >
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

/** Label on the left, value on the right, separated by a hairline above. */
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
        style={valueTone ? { color: valueTone } : undefined}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

export type BtnVariant = "ink" | "ghost" | "accent" | "quiet" | "danger";

/**
 * The button set.
 *
 * `ink` keeps its name and loses its colour: the primary action is the brand
 * green with a NEAR-BLACK label, because white on this green measures 3.26:1
 * and a 13pt semibold label is not large text. That is also why the pressed
 * state goes lighter — darkening it would squeeze the very label that has to
 * stay readable under a thumb.
 */
const BTN: Record<
  BtnVariant,
  { bg: string; bgPressed: string; fg: string; border?: string; height: number }
> = {
  ink: {
    bg: colors.brand,
    bgPressed: colors.brandPressed,
    fg: colors.onBrand,
    height: touch.primaryCta,
  },
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
  /** The oversized "Go online" treatment — taller, one step up the scale. */
  large?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Optional leading glyph. Never the only thing carrying the meaning. */
  glyph?: IconName;
  style?: ViewStyle | ViewStyle[];
}) {
  const v = BTN[variant];
  const inert = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
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
 * A square icon button.
 *
 * 36pt visually, 44pt to a thumb — the visual size is a layout decision and
 * the touch target is not negotiable, so `hitSlop` makes up the difference
 * rather than the box growing.
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
        {
          width: size,
          height: size,
          borderColor: tone,
          backgroundColor: pressed ? colors.surfaceSunken : bg,
        },
        style,
      ]}
    >
      {glyph ? <Icon name={glyph} size={Math.round(size * 0.52)} color={fg} /> : children}
    </Pressable>
  );
}

// ─── Chips ────────────────────────────────────────────────────────────────────

/**
 * A status chip: tint fill, ink label, hairline in the same family.
 *
 * The old chip was an outline in one colour, because a single colour string
 * cannot paint a tinted surface. Naming a tone instead gets all four steps,
 * which is what makes these read as chips rather than as tiny buttons.
 */
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

export function Dot({ tone = colors.textTertiary, size = 8 }: { tone?: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: tone }} />;
}

// ─── Segmented control ────────────────────────────────────────────────────────

/**
 * Segmented control — a sunken track with a white pill on the selected option.
 *
 * The old control filled the selection with ink, which made a period picker
 * look like four primary buttons with three of them switched off. A raised
 * white pill says "this one" without claiming to be an action.
 */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
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
              active && {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                ...elevation.raised,
              },
            ]}
          >
            <Text variant="title3" color={active ? "primary" : "tertiary"} numberOfLines={1}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

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
  /** 0–100. */
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

/** The stepped rail used by onboarding and the delivery stages. */
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
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: radius.pill },
      ]}
    >
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
    paddingHorizontal: space[2],
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

  avatar: {
    backgroundColor: colors.brandTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    alignItems: "center",
    justifyContent: "center",
  },
});
