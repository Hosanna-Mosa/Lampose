/**
 * Lampose Driver — "Classical" design tokens.
 *
 * Ported from the design-system artifact. Warm neutral ground, a single gold
 * accent, ink-black primary actions, hairline dividers and serif type
 * throughout. Screens never hardcode a colour or size; everything comes from
 * here so the system can be retuned in one place.
 *
 * Two deliberate departures from the CSS source, both forced by React Native:
 *   - `color-mix(in srgb, X n%, transparent)` becomes a literal rgba().
 *   - `letter-spacing` in `em` becomes points, computed per text size.
 */
import { Platform, TextStyle, ViewStyle } from "react-native";
import { moderateScale } from "react-native-size-matters";

/** Scale a value against device width, damped so text stays readable. */
export const ms = (size: number, factor = 0.35) => moderateScale(size, factor);

/** `em` letter-spacing → points, the unit React Native actually wants. */
const tracking = (fontSize: number, em: number) => fontSize * em;

export const colors = {
  // ── Ground ──────────────────────────────────────────────────────────────────
  bg: "#f3f2f2",
  surface: "#eae9e9",
  /** The paler fill used for stat cards, inputs and inactive wells. */
  well: "#f8f4f4",
  ink: "#201f1d",
  text: "#201f1d",
  // Nudged up from the artifact's 16% — a 1px hairline at 16% all but
  // disappears on a physical panel, where the browser mock held together.
  divider: "rgba(32, 31, 29, 0.22)",
  /** Muted body copy. Raised from the artifact's 55% for on-device contrast. */
  textMuted: "rgba(32, 31, 29, 0.68)",
  /** Field labels. */
  textLabel: "rgba(32, 31, 29, 0.78)",

  accent: "#b68235",
  accent2: "#ac803e",

  // ── Neutral ramp ────────────────────────────────────────────────────────────
  neutral100: "#f8f4f4",
  neutral200: "#eae7e7",
  neutral300: "#d7d3d3",
  neutral400: "#bab6b6",
  // The mid ramp is darkened a step from the artifact: these carry all the
  // secondary copy, and at the original values it greyed out on device.
  neutral500: "#8b8686",
  neutral600: "#6b6767",
  neutral700: "#514e4e",
  neutral800: "#3a3737",
  neutral900: "#2d2b2b",

  // ── Accent ramp ─────────────────────────────────────────────────────────────
  accent100: "#fff3e4",
  accent200: "#ffe3bf",
  accent300: "#facb8d",
  accent400: "#e1ad66",
  accent500: "#c28d41",
  accent600: "#a06f24",
  accent700: "#7d5411",
  accent800: "#5a3b0a",
  accent900: "#3a270d",

  // ── Lampose status roles ────────────────────────────────────────────────────
  ok: "#3d6b4c",
  warn: "#a06f24",
  err: "#8f3323",
  pending: "#7d7979",

  paper: "#f3f2f2",
  white: "#ffffff",
} as const;

/**
 * Type ramp. These are style fragments, not family names — the app uses the
 * platform's own UI font (San Francisco on iOS, Roboto on Android), so weight
 * comes from `fontWeight` rather than a named face.
 *
 * Spread them rather than assigning:  `{ ...font.heading, fontSize: ms(20) }`
 *
 * To move the whole app onto a custom family later, add `fontFamily` here and
 * load the matching faces in `app/_layout.tsx` — nothing else needs to change.
 */
export const font = {
  headingLight: { fontWeight: "400" },
  heading: { fontWeight: "600" },
  headingSemi: { fontWeight: "600" },
  headingBold: { fontWeight: "700" },

  bodyRegular: { fontWeight: "400" },
  body: { fontWeight: "500" },
  bodyMedium: { fontWeight: "500" },
  bodySemi: { fontWeight: "600" },
  bodyBold: { fontWeight: "700" },
} as const satisfies Record<string, TextStyle>;

/** The artifact's 4.6px base rhythm, rounded to whole points where it lands. */
export const space = {
  none: 0,
  1: 5,
  2: 9,
  3: 14,
  4: 18,
  5: 22,
  6: 28,
  8: 37,
  10: 46,
} as const;

export const radius = {
  sm: 2,
  md: 4,
  lg: 7,
  pill: 999,
} as const;

/** Soft ink-tinted elevation, matching the light-theme shadow scale. */
const inkShadow = (y: number, blur: number, opacity: number, elevation: number): ViewStyle =>
  Platform.select<ViewStyle>({
    android: { elevation, shadowColor: colors.neutral900 },
    default: {
      shadowColor: colors.neutral900,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
    },
  })!;

export const shadow = {
  none: {} as ViewStyle,
  sm: inkShadow(1, 2, 0.14, 1),
  md: inkShadow(3, 10, 0.16, 4),
  lg: inkShadow(12, 32, 0.22, 12),
} satisfies Record<string, ViewStyle>;

/**
 * Text presets. All use the platform UI font; hierarchy comes from size and
 * weight. Anything that reads as a number carries tabular figures so columns
 * line up.
 */
export const typography = {
  // ── Display / headings ─────────────────────────────────────────────────────
  h1: {
    ...font.headingSemi,
    fontSize: ms(30),
    lineHeight: ms(34),
    letterSpacing: tracking(ms(30), -0.015),
    color: colors.text,
  },
  h2: {
    ...font.headingSemi,
    fontSize: ms(24),
    lineHeight: ms(27),
    letterSpacing: tracking(ms(24), -0.015),
    color: colors.text,
  },
  h3: {
    ...font.headingSemi,
    fontSize: ms(20),
    lineHeight: ms(23),
    letterSpacing: tracking(ms(20), -0.015),
    color: colors.text,
  },
  h4: {
    ...font.headingSemi,
    fontSize: ms(17),
    lineHeight: ms(20),
    color: colors.text,
  },
  /** The screen title inside a phone frame. */
  title: {
    ...font.heading,
    fontSize: ms(19),
    lineHeight: ms(21),
    color: colors.text,
  },
  /** Big figures: earnings totals, countdowns, OTP boxes. */
  numeral: {
    ...font.headingBold,
    fontSize: ms(27),
    lineHeight: ms(30),
    letterSpacing: tracking(ms(27), -0.01),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  numeralLg: {
    ...font.headingBold,
    fontSize: ms(42),
    lineHeight: ms(46),
    letterSpacing: tracking(ms(42), -0.01),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },

  // ── Body ───────────────────────────────────────────────────────────────────
  body: {
    ...font.body,
    fontSize: ms(14),
    lineHeight: ms(21),
    color: colors.text,
  },
  bodySm: {
    ...font.body,
    fontSize: ms(13),
    lineHeight: ms(19),
    color: colors.text,
  },
  meta: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(17),
    color: colors.neutral700,
  },
  metaTabular: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(17),
    color: colors.neutral700,
    fontVariant: ["tabular-nums"],
  },
  fine: {
    ...font.body,
    fontSize: ms(11.5),
    lineHeight: ms(16),
    color: colors.neutral600,
  },

  /** Section eyebrow — 10px, wide tracking, uppercase, grey. */
  kicker: {
    ...font.bodyBold,
    fontSize: ms(10),
    lineHeight: ms(12),
    letterSpacing: tracking(ms(10), 0.14),
    textTransform: "uppercase",
    color: colors.neutral600,
  },
  /** Rail/eyebrow variant used above groups — slightly wider still. */
  eyebrow: {
    ...font.bodyBold,
    fontSize: ms(10),
    lineHeight: ms(11),
    letterSpacing: tracking(ms(9.5), 0.16),
    textTransform: "uppercase",
    color: colors.neutral500,
  },
  /** Pill / chip label. */
  chip: {
    ...font.bodyBold,
    fontSize: ms(9.5),
    lineHeight: ms(10),
    letterSpacing: tracking(ms(9), 0.13),
    textTransform: "uppercase",
  },
  /** Ink CTA label — bold, uppercase, wide tracking. */
  ctaInk: {
    ...font.headingBold,
    fontSize: ms(15),
    lineHeight: ms(16),
    letterSpacing: tracking(ms(15), 0.1),
    textTransform: "uppercase",
    color: colors.bg,
  },
  ctaGhost: {
    ...font.headingBold,
    fontSize: ms(13),
    lineHeight: ms(14),
    letterSpacing: tracking(ms(13), 0.08),
    textTransform: "uppercase",
    color: colors.text,
  },
  ctaSmall: {
    ...font.headingBold,
    fontSize: ms(11),
    lineHeight: ms(12),
    letterSpacing: tracking(ms(11), 0.09),
    textTransform: "uppercase",
    color: colors.text,
  },
  /** Segmented-control label. */
  seg: {
    ...font.bodyBold,
    fontSize: ms(11),
    lineHeight: ms(12),
    letterSpacing: tracking(ms(11), 0.1),
    textTransform: "uppercase",
  },
} satisfies Record<string, TextStyle>;

export const theme = { colors, font, space, radius, shadow, typography, ms };

export default theme;
