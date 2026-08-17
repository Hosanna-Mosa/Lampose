import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { colors, font, ms, radius, space, typography as t } from "@/theme";

// ─── Rules & eyebrows ─────────────────────────────────────────────────────────

export function Rule({ style }: { style?: ViewStyle }) {
  return <View style={[styles.rule, style]} />;
}

export function Kicker({ children, style }: { children: string; style?: TextStyle }) {
  return <Text style={[t.kicker, style]}>{children}</Text>;
}

// ─── Surfaces ─────────────────────────────────────────────────────────────────

/** Hairline-bordered panel on the page ground. */
export function Card({
  children,
  style,
  tone,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Overrides the hairline with a status colour (expired docs, errors). */
  tone?: string;
}) {
  return (
    <View style={[styles.card, tone ? { borderColor: tone } : null, style as ViewStyle]}>
      {children}
    </View>
  );
}

/** Same frame, but filled with the pale well colour. */
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
      style={[styles.card, styles.well, tone ? { borderColor: tone } : null, style as ViewStyle]}
    >
      {children}
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
      <Text style={[t.bodySm, { color: colors.neutral700, flex: 1 }]}>{label}</Text>
      <Text
        style={[
          t.bodySm,
          { color: valueTone ?? colors.text },
          tabular ? { fontVariant: ["tabular-nums"] } : null,
          { ...font.bodyMedium },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

export type BtnVariant = "ink" | "ghost" | "accent" | "quiet" | "danger";

const BTN: Record<
  BtnVariant,
  { bg: string; fg: string; border?: string; padV: number; label: TextStyle }
> = {
  ink: { bg: colors.ink, fg: colors.bg, padV: ms(18), label: t.ctaInk },
  ghost: {
    bg: "transparent",
    fg: colors.text,
    border: colors.divider,
    padV: ms(14),
    label: t.ctaGhost,
  },
  accent: {
    bg: "transparent",
    fg: colors.accent700,
    border: colors.accent,
    padV: ms(15),
    label: { ...t.ctaSmall, fontSize: ms(12), letterSpacing: ms(12) * 0.1 },
  },
  quiet: {
    bg: "transparent",
    fg: colors.text,
    border: colors.divider,
    padV: ms(14),
    label: { ...t.ctaSmall, fontSize: ms(11.5), letterSpacing: ms(11.5) * 0.09 },
  },
  danger: {
    bg: "transparent",
    fg: colors.err,
    border: colors.err,
    padV: ms(14),
    label: { ...t.ctaSmall, fontSize: ms(11.5), letterSpacing: ms(11.5) * 0.09 },
  },
};

export function Btn({
  label,
  onPress,
  variant = "ink",
  large,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  /** The oversized "Go online" treatment — taller, larger type. */
  large?: boolean;
  disabled?: boolean;
  loading?: boolean;
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
          backgroundColor: v.bg,
          borderColor: v.border ?? "transparent",
          borderWidth: v.border ? 1 : 0,
          paddingVertical: large ? ms(22) : v.padV,
        },
        pressed && styles.pressed,
        inert && styles.disabled,
        style as ViewStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <Text
          style={[
            v.label,
            { color: v.fg },
            large ? { fontSize: ms(17), letterSpacing: ms(17) * 0.1 } : null,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** 38pt square, accent hairline — call / message / navigate. */
export function IconBtn({
  children,
  onPress,
  size = ms(38),
  tone = colors.accent,
  fg = colors.accent700,
  bg = "transparent",
  accessibilityLabel,
  style,
}: {
  children: React.ReactNode;
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
      style={({ pressed }) => [
        styles.iconBtn,
        { width: size, height: size, borderColor: tone, backgroundColor: bg },
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={{ opacity: 1 }}>
        {typeof children === "string" ? (
          <Text style={{ color: fg, ...font.body, fontSize: ms(15) }}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </Pressable>
  );
}

// ─── Chips ────────────────────────────────────────────────────────────────────

/** Outlined status pill — the tone colours both border and label. */
export function Chip({ label, tone, style }: { label: string; tone: string; style?: ViewStyle }) {
  return (
    <View style={[styles.chip, { borderColor: tone }, style]}>
      <Text style={[t.chip, { color: tone }]}>{label}</Text>
    </View>
  );
}

export function Dot({ tone, size = ms(7) }: { tone: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: tone }}
    />
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

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
            style={[styles.segOpt, active && { backgroundColor: colors.ink }]}
          >
            <Text style={[t.seg, { color: active ? colors.bg : colors.neutral700 }]}>{opt}</Text>
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
      onPress={() => onChange(!value)}
      style={[
        styles.track,
        {
          backgroundColor: value ? colors.ink : colors.neutral300,
          justifyContent: value ? "flex-end" : "flex-start",
        },
      ]}
    >
      <View style={styles.knob} />
    </Pressable>
  );
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export function Bar({
  pct,
  tone = colors.ink,
  height = ms(6),
  track = colors.neutral200,
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
    <View style={[{ height, backgroundColor: track, borderRadius: radius.sm, overflow: "hidden" }, style]}>
      <View style={{ height: "100%", width: `${clamped}%`, backgroundColor: tone }} />
    </View>
  );
}

/** The stepped rail used by onboarding and the delivery stages. */
export function StepBars({
  total,
  current,
  height = ms(4),
  activeTone = colors.accent,
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
    <View style={[{ flexDirection: "row", gap: ms(5) }, style]}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height,
            borderRadius: radius.sm,
            backgroundColor: i <= current ? activeTone : colors.neutral300,
          }}
        />
      ))}
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({ name, size = ms(44) }: { name?: string | null; size?: number }) {
  const initials = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ ...font.heading, fontSize: size * 0.41, color: colors.neutral700 }}>
        {initials || "?"}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rule: { height: 1, backgroundColor: colors.divider },
  card: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    padding: space[3],
  },
  well: { backgroundColor: colors.neutral100 },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    paddingVertical: ms(11),
  },
  dataRowDivided: { borderTopWidth: 1, borderTopColor: colors.divider },
  btn: {
    width: "100%",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  iconBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: ms(20),
    paddingHorizontal: ms(9),
    paddingVertical: ms(5),
  },
  seg: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  segOpt: {
    flex: 1,
    paddingVertical: ms(9),
    paddingHorizontal: ms(10),
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    width: ms(44),
    height: ms(26),
    borderRadius: ms(14),
    padding: ms(3),
    flexDirection: "row",
    alignItems: "center",
  },
  knob: {
    width: ms(20),
    height: ms(20),
    borderRadius: ms(10),
    backgroundColor: colors.bg,
  },
  avatar: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
  },
});
