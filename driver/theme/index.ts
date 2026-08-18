/**
 * Lampose Driver — design tokens.
 *
 * Ported wholesale from the customer app's Food module
 * (`User App/constants/tokens.ts`), so the rider app and the Food surface a
 * student sees are visibly the same product: grey ground, white cards, one
 * saturated green, near-black primary actions, and the Archivo / Instrument
 * Sans / Martian Mono type trio.
 *
 * What replaced what:
 *   - The "Classical" warm neutrals and the single gold accent are gone. Gold
 *     survives only as `warning`, which is what an accent that means "check
 *     this" actually is.
 *   - Corner radius is chosen by what an element *is* (chip / button / card /
 *     sheet), not by its size. The old sm-2 / md-4 / lg-7 ramp is aliased onto
 *     the new values so nothing that still reads it breaks.
 *   - Type comes from `type` (the food scale) via the `Text` component. The
 *     old `typography` presets remain as a thin compatibility layer.
 *
 * Two departures from the source, both forced by React Native and both already
 * present in the customer app:
 *   - `color-mix(...)` becomes a literal rgba().
 *   - Every weight is a separately registered font family; RN cannot synthesise
 *     one from a single face.
 *
 * `ms()` is gone. The old app ran every size through `moderateScale`, which
 * meant a card's padding and a font's size both drifted with device width and
 * neither matched the customer app on any real handset. The food scale is
 * literal points, so a 16pt gutter is 16pt everywhere — and a design system
 * that exports two competing ways to size things is exactly what these tokens
 * exist to prevent. `react-native-size-matters` is now unused.
 */
import { Platform, TextStyle, ViewStyle } from "react-native";

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */

/** A semantic colour role: a base for solid fills, ink for text on tint. */
export type SemanticColor = {
  /** Solid fill, icon strokes, progress fills. */
  base: string;
  /** Text and glyphs sitting on `tint`. Always the darkest of the set. */
  ink: string;
  /** Background wash behind `ink`. */
  tint: string;
  /** Hairline around a `tint` surface. */
  border: string;
  /** Ink for a glyph or label sitting **on `base`** — the filled disc. */
  on: string;
};

export type ThemeColors = {
  /** App ground. Scroll containers sit on this. */
  bg: string;
  /** Cards, sheets, headers — anything holding content above the ground. */
  surface: string;
  /** A surface that needs to read as lifted off another surface. */
  surfaceRaised: string;
  /** An inset well: skeletons, disabled fields, image placeholders. */
  surfaceSunken: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;

  /** Hairline between rows and around cards. */
  border: string;
  /** A quieter hairline for dividers inside a single card. */
  borderSubtle: string;
  /** The edge of an empty interactive field. 3:1, per WCAG 1.4.11. */
  borderInput: string;

  brand: string;
  brandPressed: string;
  /** Ink for anything sitting ON `brand`. Near-black, not white — see note. */
  onBrand: string;
  /** The green used as INK — a ghost button's label, a link, an active icon. */
  brandInk: string;
  brandTint: string;
  /** Brand ink for use on `graphite`. Never use `brand` there. */
  brandOnDark: string;

  /** The near-black used for inverted surfaces — toasts, headers, map cards. */
  graphite: string;
  graphiteRaised: string;
  onGraphite: string;
  onGraphiteMuted: string;

  /** Modal and sheet backdrop. */
  scrim: string;

  success: SemanticColor;
  warning: SemanticColor & { borderStrong: string };
  danger: SemanticColor;
  info: SemanticColor;
};

const lightColors: ThemeColors = {
  /*
   * The brand palette, as adopted by the customer app on 14 Aug 2026:
   * "Ground is a soft grey, content sits on white cards, and the only
   * saturated colour is a single green. Black carries the primary actions;
   * the yellow is reserved for the logo mark."
   *
   * Every deviation below is a measured contrast failure rather than a
   * preference, and each is carried over from the customer app's own
   * accessibility pass — do not undo them by repainting.
   */
  bg: "#F1F2F4",
  surface: "#FFFFFF",
  surfaceRaised: "#FAFBFC",
  surfaceSunken: "#E9EBEE",

  textPrimary: "#101214",
  textSecondary: "#3D4247",
  /* #6B7280 measures 4.32:1 on the grey ground; this holds 5.18:1. */
  textTertiary: "#5F6670",

  border: "#E3E6EA",
  borderSubtle: "#EEF0F3",
  /* 3.3:1 on the white field fill, 3.0:1 on the ground behind it. */
  borderInput: "#878E99",

  /*
   * The fill is the lighter green. White on it is 3.26:1 and a 15px/600
   * button label is not "large text", so the label flips to near-black at
   * 5.73:1 — which is what the brand note describes anyway. Because the
   * label is dark, the press goes LIGHTER, not darker.
   */
  brand: "#22A355",
  brandPressed: "#2BB25F",
  onBrand: "#101312",
  brandInk: "#17803D",
  brandTint: "#E9F5ED",
  brandOnDark: "#B7D8C4",

  graphite: "#101312",
  graphiteRaised: "#1C201F",
  onGraphite: "#FFFFFF",
  onGraphiteMuted: "#A8B0B8",

  scrim: "rgba(16,19,18,0.45)",

  /*
   * Success shares the brand green. Survivable only because of the standing
   * rule that status is never carried by colour alone — every status chip
   * has a glyph or a word beside it.
   */
  success: { base: "#17803D", ink: "#125C2E", tint: "#E9F5ED", border: "#B7D8C4", on: "#FFFFFF" },
  /* Amber is reserved for small accents. #B8860B is 3.25:1 on white, so the
     text ink is the darker #6E4700 at 8.19:1. */
  warning: {
    base: "#B8860B",
    ink: "#6E4700",
    tint: "#FFF8E6",
    border: "#EBD9A8",
    borderStrong: "#B8860B",
    on: "#241900",
  },
  danger: { base: "#C0242B", ink: "#8E1B21", tint: "#FBE9E9", border: "#E3ABAE", on: "#FFFFFF" },
  /* Neutral rather than a second saturated hue: a note is a note, and making
     it green would dress a caveat up as good news. */
  info: { base: "#3D4247", ink: "#101214", tint: "#E9EBEE", border: "#DEE1E6", on: "#FFFFFF" },
};

/**
 * Dark palette. Carried over from the customer app so the two stay in step.
 *
 * Nothing reads it yet — the rider app ships light-only, because it has no
 * appearance setting and flipping riders to dark on an OS preference they
 * never set for this app would be a behaviour change, not a reskin. Wiring it
 * up is a `ThemeProvider` around `colors` and nothing else.
 */
const darkColors: ThemeColors = {
  bg: "#0C0E0E",
  surface: "#161A19",
  surfaceRaised: "#1E2322",
  surfaceSunken: "#101312",

  textPrimary: "#F1F2F4",
  textSecondary: "#B6BDC2",
  textTertiary: "#8B939C",

  border: "#2A302E",
  borderSubtle: "#1D2221",
  borderInput: "#69736E",

  brand: "#22A355",
  brandPressed: "#3FBF6E",
  onBrand: "#101312",
  brandInk: "#5FCF8E",
  brandTint: "#10241A",
  brandOnDark: "#B7D8C4",

  graphite: "#1E2322",
  graphiteRaised: "#2A302E",
  onGraphite: "#F1F2F4",
  onGraphiteMuted: "#A8B0B8",

  scrim: "rgba(0,0,0,0.62)",

  success: { base: "#22A355", ink: "#7FCF9C", tint: "#10241A", border: "#245C3A", on: "#101312" },
  warning: {
    base: "#FFC93C",
    ink: "#F5D68A",
    tint: "#2B2409",
    border: "#5C4B16",
    borderStrong: "#8A701F",
    on: "#101312",
  },
  danger: { base: "#FF7A7F", ink: "#FF9DA1", tint: "#2E1416", border: "#5E2428", on: "#101312" },
  info: { base: "#B6BDC2", ink: "#F1F2F4", tint: "#1E2322", border: "#2A302E", on: "#101312" },
};

export const palettes = { light: lightColors, dark: darkColors };

/**
 * The active palette.
 *
 * Exported as a plain object rather than through a hook because every screen
 * in this app builds its styles at module scope. The legacy key names below
 * the semantic set are aliases onto the same values, kept so `constants/`
 * and anything not yet swept keeps compiling and still lands on food colours.
 */
export const colors = {
  ...lightColors,

  // ── Legacy aliases ────────────────────────────────────────────────────────
  /** @deprecated use `textPrimary`. */
  text: lightColors.textPrimary,
  /** @deprecated use `graphite` for inverted surfaces, `textPrimary` for type. */
  ink: lightColors.textPrimary,
  /** @deprecated use `surfaceSunken`. */
  well: lightColors.surfaceSunken,
  /** @deprecated use `border`. */
  divider: lightColors.border,
  /** @deprecated use `textSecondary`. */
  textMuted: lightColors.textSecondary,
  /** @deprecated use `textSecondary`. */
  textLabel: lightColors.textSecondary,

  /** @deprecated the gold accent is gone; green carries emphasis now. */
  accent: lightColors.brand,
  /** @deprecated */
  accent2: lightColors.brandInk,
  /** @deprecated use `brandTint`. */
  accent100: lightColors.brandTint,
  /** @deprecated */
  accent200: lightColors.brandOnDark,
  /** @deprecated */
  accent300: "#7FCF9C",
  /** @deprecated */
  accent400: "#3FBF6E",
  /** @deprecated use `brand`. */
  accent500: lightColors.brand,
  /** @deprecated use `brandInk`. */
  accent600: lightColors.brandInk,
  /** @deprecated use `brandInk`. */
  accent700: lightColors.brandInk,
  /** @deprecated */
  accent800: "#125C2E",
  /** @deprecated */
  accent900: "#0C3D1F",

  // Neutral ramp, remapped onto the food greys.
  neutral100: lightColors.surfaceRaised,
  neutral200: lightColors.surfaceSunken,
  neutral300: lightColors.border,
  neutral400: lightColors.borderInput,
  neutral500: lightColors.textTertiary,
  neutral600: lightColors.textTertiary,
  neutral700: lightColors.textSecondary,
  neutral800: "#22262A",
  neutral900: lightColors.textPrimary,

  /** @deprecated use `success.base`. */
  ok: lightColors.success.base,
  /** @deprecated use `warning.base`. */
  warn: lightColors.warning.base,
  /** @deprecated use `danger.base`. */
  err: lightColors.danger.base,
  /** @deprecated use `textTertiary`. */
  pending: lightColors.textTertiary,

  paper: lightColors.bg,
  white: "#FFFFFF",
} as const;

/* ------------------------------------------------------------------ *
 * Status tones
 * ------------------------------------------------------------------ */

/**
 * The five tones a status can take.
 *
 * Screens name a tone; they never pick the four colours a chip needs. That is
 * what stopped the old app from tinting chips at all — a single colour string
 * can only paint a border, so every status chip was an outline.
 */
export type ToneName = "success" | "warning" | "danger" | "info" | "muted" | "brand";

export function tone(name: ToneName): SemanticColor {
  switch (name) {
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
    case "danger":
      return colors.danger;
    case "info":
      return colors.info;
    case "brand":
      return {
        base: colors.brand,
        ink: colors.brandInk,
        tint: colors.brandTint,
        border: colors.brandOnDark,
        on: colors.onBrand,
      };
    case "muted":
    default:
      return {
        base: colors.textTertiary,
        ink: colors.textSecondary,
        tint: colors.surfaceSunken,
        border: colors.border,
        on: colors.surface,
      };
  }
}

/* ------------------------------------------------------------------ *
 * Typography
 * ------------------------------------------------------------------ */

export type TypeFace = "display" | "body" | "numeric";

export type TypeStyle = {
  face: TypeFace;
  size: number;
  weight: 400 | 500 | 600 | 700;
  lineHeight: number;
  letterSpacing: number;
  /** Render the string uppercased. Applies to `label` and `eyebrow` only. */
  upper?: boolean;
  /** Lock digit widths so a changing number never reflows its neighbours. */
  tabular?: boolean;
  /** Opt out of OS font scaling entirely — only the hand-off code does this. */
  noScale?: boolean;
};

/**
 * The type scale, identical to the customer app's.
 *
 * A screen may not invent a size, a weight or a family outside it. The
 * `numeric` face is load-bearing rather than decorative: every rupee figure,
 * distance, ETA, order id and hand-off code is set in it, so digits stay
 * column-aligned and a counting-down ETA never shifts the row around it.
 */
export const type = {
  display1: { face: "display", size: 21, weight: 700, lineHeight: 23, letterSpacing: -0.63 },
  display2: { face: "display", size: 15, weight: 700, lineHeight: 19, letterSpacing: -0.38 },
  title1: { face: "display", size: 14, weight: 700, lineHeight: 17, letterSpacing: -0.28 },
  title2: { face: "display", size: 13, weight: 700, lineHeight: 16, letterSpacing: -0.2 },
  title3: { face: "display", size: 12, weight: 600, lineHeight: 15, letterSpacing: -0.12 },

  bodyLg: { face: "body", size: 12, weight: 400, lineHeight: 18, letterSpacing: 0 },
  body: { face: "body", size: 11.5, weight: 400, lineHeight: 17, letterSpacing: 0 },
  bodyStrong: { face: "body", size: 11.5, weight: 600, lineHeight: 15, letterSpacing: 0 },
  caption: { face: "body", size: 10, weight: 400, lineHeight: 14, letterSpacing: 0 },
  label: { face: "body", size: 10, weight: 600, lineHeight: 13, letterSpacing: 1, upper: true },
  eyebrow: { face: "body", size: 10, weight: 600, lineHeight: 13, letterSpacing: 1.4, upper: true },

  priceHero: { face: "numeric", size: 19, weight: 700, lineHeight: 19, letterSpacing: -0.76, tabular: true },
  priceLg: { face: "numeric", size: 15, weight: 700, lineHeight: 15, letterSpacing: -0.6, tabular: true },
  priceMd: { face: "numeric", size: 12.5, weight: 700, lineHeight: 13, letterSpacing: -0.5, tabular: true },
  priceSm: { face: "numeric", size: 10.5, weight: 600, lineHeight: 14, letterSpacing: 0, tabular: true },
  numMeta: { face: "numeric", size: 10, weight: 500, lineHeight: 14, letterSpacing: 0, tabular: true },
  codeHero: { face: "numeric", size: 50, weight: 700, lineHeight: 50, letterSpacing: 0, tabular: true, noScale: true },
} as const satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof type;

/**
 * Loaded font family names, keyed by face and weight. React Native cannot
 * synthesise a weight from one family, so every weight is its own family.
 * `resolveFontFamily` is the only place allowed to do this lookup.
 */
export const fontFamilies: Record<TypeFace, Record<400 | 500 | 600 | 700, string>> = {
  display: {
    400: "Archivo_400Regular",
    500: "Archivo_500Medium",
    600: "Archivo_600SemiBold",
    700: "Archivo_700Bold",
  },
  body: {
    400: "InstrumentSans_400Regular",
    500: "InstrumentSans_500Medium",
    600: "InstrumentSans_600SemiBold",
    700: "InstrumentSans_700Bold",
  },
  numeric: {
    400: "MartianMono_400Regular",
    500: "MartianMono_500Medium",
    600: "MartianMono_600SemiBold",
    700: "MartianMono_700Bold",
  },
};

export function resolveFontFamily(face: TypeFace, weight: 400 | 500 | 600 | 700): string {
  return fontFamilies[face][weight];
}

/**
 * ONE cap for every face, not three.
 *
 * Scaling faces at different rates does not enlarge a type scale, it destroys
 * it: at 1.8 the body copy overtakes the heading above it. 1.3 keeps every
 * relationship intact at every OS setting.
 */
export const MAX_FONT_SCALE = 1.3;

/** Turn a scale entry into a React Native text style. */
export function typeStyle(variant: TypeVariant): TextStyle {
  const t = type[variant] as TypeStyle;
  return {
    fontFamily: resolveFontFamily(t.face, t.weight),
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
    ...(t.upper ? { textTransform: "uppercase" as const } : null),
    ...(t.tabular ? { fontVariant: ["tabular-nums" as const] } : null),
  };
}

/**
 * Family shorthands, kept because screens spread them into StyleSheets.
 *
 * These now carry a real `fontFamily`, so a screen that still spreads
 * `font.heading` lands on Archivo rather than the platform UI font. Prefer the
 * `Text` component and a `variant` — weight and family should not be picked
 * independently of a size.
 */
export const font = {
  headingLight: { fontFamily: fontFamilies.display[400] },
  heading: { fontFamily: fontFamilies.display[600] },
  headingSemi: { fontFamily: fontFamilies.display[600] },
  headingBold: { fontFamily: fontFamilies.display[700] },

  bodyRegular: { fontFamily: fontFamilies.body[400] },
  body: { fontFamily: fontFamilies.body[400] },
  bodyMedium: { fontFamily: fontFamilies.body[500] },
  bodySemi: { fontFamily: fontFamilies.body[600] },
  bodyBold: { fontFamily: fontFamilies.body[700] },

  numeric: { fontFamily: fontFamilies.numeric[500] },
  numericBold: { fontFamily: fontFamilies.numeric[700] },
} as const satisfies Record<string, TextStyle>;

/* ------------------------------------------------------------------ *
 * Space, radius, elevation, touch
 * ------------------------------------------------------------------ */

export const space = { none: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 40, 10: 48 } as const;

/**
 * Four radii and a pill. Pick by what the element *is*, never by its size:
 *   chip   anything sitting inside another surface
 *   button anything tappable that is its own object
 *   card   anything holding other elements
 *   sheet  anything meeting a screen edge
 *   pill   true pills only — segments, avatars, status dots
 */
export const radius = {
  chip: 8,
  button: 12,
  card: 16,
  sheet: 24,
  pill: 999,

  /** @deprecated use `chip`. */
  sm: 8,
  /** @deprecated use `button`. */
  md: 12,
  /** @deprecated use `card`. */
  lg: 16,
} as const;

/**
 * Elevation, pre-shaped so no caller hand-writes shadow props. Shadows are
 * never animated.
 */
const shade = (
  opacity: number,
  shadowRadius: number,
  y: number,
  elev: number,
): ViewStyle =>
  Platform.select<ViewStyle>({
    android: { elevation: elev, shadowColor: "#10151C" },
    default: {
      shadowColor: "#10151C",
      shadowOpacity: opacity,
      shadowRadius,
      shadowOffset: { width: 0, height: y },
    },
  })!;

export const elevation = {
  flat: {} as ViewStyle,
  raised: shade(0.06, 3, 1, 1),
  card: shade(0.1, 16, 6, 3),
  sheet: shade(0.12, 16, -4, 6),
  float: shade(0.28, 22, 8, 8),
} satisfies Record<string, ViewStyle>;

/** @deprecated use `elevation`. */
export const shadow = {
  none: elevation.flat,
  sm: elevation.raised,
  md: elevation.card,
  lg: elevation.float,
} satisfies Record<string, ViewStyle>;

export const touch = {
  /** Nothing tappable may be smaller than this. */
  min: 44,
  /** Primary calls to action are taller, because they carry money. */
  primaryCta: 52,
  listRow: 56,
  /** Icon buttons may *look* 36pt as long as hitSlop makes them 44pt. */
  iconButtonVisual: 36,
  iconButtonHitSlop: 4,
} as const;

export const icon = {
  grid: [16, 20, 24, 26] as const,
  strokeWidth: 1.75,
  /** Money and status are never labelled by icon alone. */
  minSize: 16,
} as const;

/** Layout constants for a 390 x 844pt Android-first frame. */
export const layout = {
  /** Screen gutter, both edges. Rails bleed past it but start on it. */
  gutter: 16,
  sectionGap: space[4],
  groupGap: space[3],
  cardPadding: space[4],
  listRowPadding: space[3],
  /** Tab bars and sticky footers add this to the bottom safe-area inset. */
  bottomInsetExtra: 10,
} as const;

/* ------------------------------------------------------------------ *
 * Compatibility layer
 * ------------------------------------------------------------------ */

/**
 * The old `typography` presets, re-pointed at the food scale.
 *
 * Kept so a screen mid-sweep still renders in the new system rather than
 * falling back to the platform font. New work should use `<Text variant>`.
 */
export const typography = {
  h1: { ...typeStyle("display1"), color: colors.textPrimary },
  h2: { ...typeStyle("display2"), color: colors.textPrimary },
  h3: { ...typeStyle("title1"), color: colors.textPrimary },
  h4: { ...typeStyle("title2"), color: colors.textPrimary },
  title: { ...typeStyle("title1"), color: colors.textPrimary },

  numeral: { ...typeStyle("priceHero"), color: colors.textPrimary },
  numeralLg: { ...typeStyle("codeHero"), color: colors.textPrimary },

  body: { ...typeStyle("body"), color: colors.textPrimary },
  bodySm: { ...typeStyle("caption"), color: colors.textPrimary },
  meta: { ...typeStyle("caption"), color: colors.textTertiary },
  metaTabular: { ...typeStyle("numMeta"), color: colors.textTertiary },
  fine: { ...typeStyle("caption"), color: colors.textTertiary },

  kicker: { ...typeStyle("eyebrow"), color: colors.textTertiary },
  eyebrow: { ...typeStyle("eyebrow"), color: colors.textTertiary },
  chip: { ...typeStyle("label") },
  ctaInk: { ...typeStyle("title2"), color: colors.onBrand },
  ctaGhost: { ...typeStyle("title2"), color: colors.textPrimary },
  ctaSmall: { ...typeStyle("title3"), color: colors.textPrimary },
  seg: { ...typeStyle("title3") },
} satisfies Record<string, TextStyle>;

export const theme = {
  colors,
  palettes,
  font,
  type,
  typography,
  space,
  radius,
  elevation,
  shadow,
  touch,
  icon,
  layout,
  tone,
};

export default theme;
