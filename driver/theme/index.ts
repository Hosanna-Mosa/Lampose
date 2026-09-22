/**
 * Lampose Driver — design tokens.
 *
 * Layout, spacing, radius and type were ported wholesale from the customer
 * app's Food module (`User App/constants/tokens.ts`). The PALETTE below was
 * re-pointed on 30 Aug 2026 to the "Dock" palette the Stay Partner app runs
 * on (`Stay Partner/constants/colors.ts`), so a driver, a property partner
 * and a guest are looking at one product family rather than apps that happen
 * to share a name. The supplied roles, verbatim:
 *
 *   GROUND  #EFEDE9   SURFACE #FFFFFF   INK     #1A1917
 *   ACCENT  #0E6E5C   CONFIRM #0E6E5C   CAUTION #A85A1E
 *
 * What changed, and why:
 *   - Ground moved from a cool grey (#F1F2F4) to Dock's warm bone (#EFEDE9),
 *     and every neutral — text, hairlines, wells — was re-picked off the same
 *     warm ramp so nothing reads as a leftover cool grey next to it.
 *   - The saturated colour moved from a light, whitish-mint green (#22A355,
 *     3.26:1 for white) to Dock's deep teal ACCENT (#0E6E5C, 6.25:1 for
 *     white). That is a second-order change, not just a hue swap: the old
 *     green could not carry a white label, which is why primary buttons here
 *     used a near-black label and lightened on press. Dock's teal can, so
 *     `onBrand` is now white and the pressed state goes DARKER — the
 *     ordinary direction — matching how Stay Partner's own `Button` behaves.
 *   - `success` is the same hex as `brand`, exactly as Dock specifies: a
 *     confirmed delivery IS the good outcome. Survivable only because status
 *     is never carried by colour alone in this app either — every status
 *     chip already ships a glyph or a word beside the tint.
 *   - `warning` moved to Dock's CAUTION (#A85A1E), which — unlike the old
 *     amber — clears 4.5:1 for a white label (5.06:1), so it no longer needs
 *     a separate near-black `on` colour in light mode.
 *   - `danger` has no Dock equivalent (Dock has no error role); it was
 *     re-picked as a warm red in the same desaturated register as CAUTION,
 *     the same reasoning Stay Partner used for its own `error` token.
 *   - `info` stopped being a cool blue-grey and became Dock's own neutral
 *     `textSecondary` tone — a completed order is a note, not an event, so it
 *     gets no colour of its own.
 *
 * Every token name is unchanged, so no call site moved. Ratios noted below
 * are measured (relative luminance), not estimated.
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
  /** Ink for anything sitting ON `brand`. White — `brand` is dark enough to
      carry it in both palettes; see the file header. */
  onBrand: string;
  /** The teal used as INK — a ghost button's label, a link, an active icon. */
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
   * A deliberate departure from Dock's own "warm bone" ground here — this
   * app was reading, on an actual device, as a light brown wash across every
   * gap between cards, and that reads as unfinished on this app's own
   * screens (a map, food-delivery photography, a bright green accent)
   * whatever it looks like on Stay Partner's. Ground, the two raised/sunken
   * surface tiers and both hairlines are re-picked neutral (true white or
   * true grey, no warm cast); the saturated ACCENT/CONFIRM/CAUTION roles
   * below and the text colours are untouched — this app and Stay Partner
   * now agree on those, just not on the ground colour. `borderInput` is also
   * untouched: its contrast was measured against the white field fill it
   * actually sits on, which has not changed.
   */
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceSunken: "#F0F0F0",

  textPrimary: "#1A1917",
  textSecondary: "#55524C",
  textTertiary: "#837D72",

  /* Hairline around cards and between rows. */
  border: "#E5E7EB",
  /* Quieter hairline for dividers inside a card. */
  borderSubtle: "#F0F0F1",
  /* The one border that is not decorative — 3:1 on the white field fill it
     sits on, unaffected by the ground colour above it. Re-picked neutral
     (equal R/G/B) rather than the warm grey-brown Dock specifies, at a
     luminance close enough to the original that the ratio barely moves
     (~3.45:1 vs ~3.48:1) — this removes the tan cast from every input
     border and every empty photo slot without weakening the one border in
     this palette that actually has to clear a number. */
  borderInput: "#8A8A8A",

  /*
   * Dock's ACCENT. White on it is 6.17:1, so — unlike the old whitish
   * green — the label stays white and the press goes DARKER, the ordinary
   * direction for a button that no longer has to protect a dark label.
   */
  brand: "#0E6E5C",
  brandPressed: "#0A5748",
  onBrand: "#FFFFFF",
  brandInk: "#0E6E5C",
  brandTint: "#E3F0EB",
  brandOnDark: "#B7D4CE",

  graphite: "#1A1917",
  graphiteRaised: "#252320",
  onGraphite: "#FFFFFF",
  onGraphiteMuted: "#BFBAB1",

  scrim: "rgba(26,25,23,0.45)",

  /*
   * Success shares ACCENT, exactly as Dock specifies: a delivered order IS
   * the good outcome. Survivable only because status is never carried by
   * colour alone — every status chip ships a glyph or a word beside it.
   */
  success: { base: "#0E6E5C", ink: "#0B5245", tint: "#E3F0EB", border: "#B7D4CE", on: "#FFFFFF" },
  /* Re-picked off Dock's CAUTION for the same reason as `borderInput` above:
     `#A85A1E` reads as rust/brown on an actual screen, not as an amber
     "pending" caution — and this is the colour behind every "Under review"
     pill in the app, so it was the least neutral, most visible instance of
     the same cast. A proper amber instead, at the same ~5:1 white-on-`base`
     contrast the original measured (5.02:1 here), so nothing that relied on
     that ratio regresses. */
  warning: {
    base: "#B45309",
    ink: "#78350F",
    tint: "#FEF3C7",
    border: "#FDE68A",
    borderStrong: "#B45309",
    on: "#FFFFFF",
  },
  /* Dock has no danger role; re-picked as a warm red in the same
     desaturated register as CAUTION, the way Stay Partner's own `error`
     token was chosen. White on it is 6.54:1. */
  danger: { base: "#B3261E", ink: "#8C1D17", tint: "#FBEAE8", border: "#E4B3B0", on: "#FFFFFF" },
  /* Neutral rather than a second saturated hue: a note is a note, and
     making it green would dress a caveat up as good news. `tint`/`border`
     follow the same neutral re-pick as `border`/`borderSubtle` above, rather
     than the warm-bone family they used to share — otherwise an info notice
     would be the one thing left with a tan cast. */
  info: { base: "#55524C", ink: "#1A1917", tint: "#ECECEC", border: "#E5E7EB", on: "#FFFFFF" },
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
  bg: "#131211",
  surface: "#1C1B19",
  surfaceRaised: "#211F1D",
  surfaceSunken: "#252320",

  textPrimary: "#F2F0EC",
  textSecondary: "#BFBAB1",
  textTertiary: "#8A8479",

  border: "#302E2A",
  borderSubtle: "#232220",
  borderInput: "#736E64",

  /* One value carries both the button fill (white on it, 4.84:1) and, via
     `brandInk`, accent-coloured prose — Dock's own dark ACCENT split. */
  brand: "#18806A",
  brandPressed: "#126957",
  onBrand: "#FFFFFF",
  brandInk: "#5FC9AF",
  brandTint: "#0F2721",
  brandOnDark: "#B7D4CE",

  graphite: "#252320",
  graphiteRaised: "#302E2A",
  onGraphite: "#F2F0EC",
  onGraphiteMuted: "#BFBAB1",

  scrim: "rgba(0,0,0,0.62)",

  success: { base: "#18806A", ink: "#7FD3BE", tint: "#0F2721", border: "#145446", on: "#FFFFFF" },
  /* Split from `warning.base`, unlike light mode: the brightened caution
     above is right for an icon on the dark ground but cannot carry white
     (Dock's own dark palette makes the same split). `borderStrong` is the
     value that does, at 5.89:1. */
  warning: {
    base: "#E0954A",
    ink: "#EEBC85",
    tint: "#2C1E0E",
    border: "#624220",
    borderStrong: "#8A5A22",
    on: "#131211",
  },
  danger: { base: "#C0392F", ink: "#F5A49E", tint: "#2C1513", border: "#762721", on: "#FFFFFF" },
  info: { base: "#BFBAB1", ink: "#F2F0EC", tint: "#252320", border: "#302E2A", on: "#131211" },
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

  /** @deprecated the gold accent is gone; teal carries emphasis now. */
  accent: lightColors.brand,
  /** @deprecated */
  accent2: lightColors.brandInk,
  /** @deprecated use `brandTint`. */
  accent100: lightColors.brandTint,
  /** @deprecated */
  accent200: lightColors.brandOnDark,
  /** @deprecated */
  accent300: "#7AAFA5",
  /** @deprecated */
  accent400: "#438E80",
  /** @deprecated use `brand`. */
  accent500: lightColors.brand,
  /** @deprecated use `brandInk`. */
  accent600: lightColors.brandInk,
  /** @deprecated use `brandInk`. */
  accent700: lightColors.brandInk,
  /** @deprecated */
  accent800: "#0A4F42",
  /** @deprecated */
  accent900: "#07372E",

  // Neutral ramp, remapped onto the Dock greys.
  neutral100: lightColors.surfaceRaised,
  neutral200: lightColors.surfaceSunken,
  neutral300: lightColors.border,
  neutral400: lightColors.borderInput,
  neutral500: lightColors.textTertiary,
  neutral600: lightColors.textTertiary,
  neutral700: lightColors.textSecondary,
  neutral800: "#2B2822",
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
 *
 * Shadow colour is Dock's own INK (`#1A1917`), not a cool near-black — Stay
 * Partner shadows off the same value (`constants/layout.ts`), and a neutral
 * grey shadow under a warm bone ground reads as a mismatched sticker.
 */
const shade = (
  opacity: number,
  shadowRadius: number,
  y: number,
  elev: number,
): ViewStyle =>
  Platform.select<ViewStyle>({
    android: { elevation: elev, shadowColor: "#1A1917" },
    default: {
      shadowColor: "#1A1917",
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
