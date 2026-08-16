/**
 * LAMPOSE design tokens — Batch 0 foundation.
 *
 * Source of truth: `Designs/Lampose Foundation.dc.html` (Batch 0), with every
 * correction from `Designs/Lampose Handoff.dc.html` (Batch 12) already applied.
 * Where the two batches disagree, Batch 12 wins — it is the audit that came
 * after all eleven screen batches were drawn.
 *
 * Corrections folded in here, so they never have to be made again downstream:
 *   - Radius collapsed from the nine ad-hoc values found across Batches 1-11
 *     down to the four sanctioned ones (plus `pill`). 9, 10, 11, 13, 14 and 18
 *     are gone. A radius is chosen by what the element *is*, not by its size.
 *   - `textTertiary` lifted #7C8794 -> #6B7684. The old value failed contrast
 *     wherever tertiary text was set small.
 *   - `brandOnDark` (#8F76FF) promoted to a real token. Brand ink is the one
 *     colour that cannot be shared across modes: #4B2BE0 measures ~1.9:1 on
 *     graphite and is unusable for text, icons or small UI.
 *
 * Nothing in the app should hardcode a colour, size, radius or spacing value.
 * Read them from here through `useTheme()`.
 */

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */

/** A semantic colour role: a mark/base for solid fills, ink for text on tint. */
export type SemanticColor = {
  /** Solid fill, icon strokes, progress fills. */
  base: string;
  /** Text and glyphs sitting on `tint`. Always the darkest of the set. */
  ink: string;
  /** Background wash behind `ink`. */
  tint: string;
  /** Hairline around a `tint` surface. */
  border: string;
  /**
   * Ink for a glyph or label sitting **on `base`** — the filled disc, not the
   * tinted card.
   *
   * It is a separate token because it is not white and it is not `ink`, and
   * both of those guesses were being made at six call sites. `ink` is for text
   * on `tint`, which is a pale wash in light mode and a dark one in dark mode;
   * `base` is a saturated fill whose luminance flips between the two palettes.
   *
   * In dark mode every `base` here is a *light* colour — #22A355, #FFC93C,
   * #FF7A7F, #B6BDC2 — so a white glyph on any of them lands between 1.6:1 and
   * 3.3:1 and effectively disappears. In light mode three of the four are dark
   * enough for white, and amber is not.
   *
   * Every value below clears 4.5:1 against its own `base`.
   */
  on: string;
};

export type CategoryColor = {
  /** Solid fill / icon. */
  mark: string;
  /** Text on `tint`. */
  ink: string;
  /** Background wash. */
  tint: string;
  /** Two-letter shorthand used where a full category name will not fit. */
  code: string;
};

export type StayCategory = 'PG_HOSTEL' | 'BACHELOR' | 'COLIVE' | 'HOTEL';

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
  /**
   * The edge of an **empty interactive field** — a dropdown nobody has answered
   * yet, an input awaiting text.
   *
   * `border` is a decorative hairline and is deliberately faint: at 1.25:1 on
   * white it separates a card from the page without drawing attention, which is
   * right for a card. It is wrong for a control. WCAG 1.4.11 asks 3:1 for the
   * boundary of an interactive component, and an unanswered dropdown has
   * nothing else to identify it — the fill is the same white as the card behind
   * it, so the edge is the whole affordance.
   *
   * This was visible rather than theoretical: the three fields in "Are you
   * looking for" read as flat white space until one was answered and picked up
   * the brand edge.
   *
   * Only for the resting, unanswered state. Once a field carries a value it
   * takes the brand border, which is louder still and says something different.
   */
  borderInput: string;

  brand: string;
  brandPressed: string;
  /**
   * Ink for anything sitting ON `brand` — a primary button's label, a selected
   * chip's text, a filled mark.
   *
   * This exists because it flips between modes and white does not. Light mode
   * puts white on #17803D (5.01:1). Dark mode's brand is the lighter #22A355,
   * where white measures 3.26:1 and fails — so the label there is near-black
   * at 5.73:1. Any component that hardcodes '#FFFFFF' on a brand surface is
   * legible in one mode and not the other.
   */
  onBrand: string;
  /**
   * The green used as INK — a ghost button's label, a link, an active icon.
   *
   * Separate from `brand` because the two have opposite constraints. `brand` is
   * a fill and wants to be light; ink sits on a light surface and must stay
   * dark enough to read. The lightened fill measures 3.26:1 as text on white,
   * which is unusable, so anything drawing green *type* uses this instead.
   */
  brandInk: string;
  brandTint: string;
  /** Brand ink for use on `graphite`, in either mode. Never use `brand` there. */
  brandOnDark: string;

  /** The near-black used for inverted surfaces — snackbars, push previews. */
  graphite: string;
  graphiteRaised: string;
  onGraphite: string;
  onGraphiteMuted: string;

  /** Modal and sheet backdrop. */
  scrim: string;

  success: SemanticColor;
  warning: SemanticColor & {
    /** A heavier border for warning surfaces that carry a deadline. */
    borderStrong: string;
  };
  danger: SemanticColor;
  info: SemanticColor;

  category: Record<StayCategory, CategoryColor>;
};

const lightColors: ThemeColors = {
  /*
   * The brand palette, adopted 14 Aug 2026 so the app matches the web product.
   *
   * "Ground is a soft grey, content sits on white cards, and the only saturated
   * colour is a single green. Black carries the primary actions; the yellow is
   * reserved for the logo mark."
   *
   * Every hex below is the supplied token unless a comment says otherwise.
   * There are four deviations and two additions, and each one is a measured
   * contrast failure rather than a preference — see the notes inline. The
   * Batch 12 accessibility pass is not something to undo by repainting.
   */
  bg: '#F1F2F4',
  surface: '#FFFFFF',
  // --surface2. Used where a card sits on another card and pure white would
  // vanish into it.
  surfaceRaised: '#FAFBFC',
  // --bg2.
  surfaceSunken: '#E9EBEE',

  textPrimary: '#101214',
  textSecondary: '#3D4247',
  /*
   * DEVIATION 1 — --ink-light #6B7280 measures 4.83:1 on white but only
   * 4.32:1 on the grey ground, and tertiary text is where meta lines,
   * timestamps and price sources live. Batch 12 fixed this exact failure once
   * already. #5F6670 keeps the same grey family at 5.18:1 on the ground and
   * 5.80:1 on a card.
   *
   * --ink-ghost #9CA3AF (2.54:1) is placeholder-only and is not a text token:
   * it lives on TextField, where a permanent visible label carries the meaning.
   */
  textTertiary: '#5F6670',

  border: '#E3E6EA',
  borderSubtle: '#EEF0F3',
  /* 3.3:1 on the white field fill, 3.0:1 on the page ground behind it. */
  borderInput: '#878E99',

  /*
   * The fill is --green-m, the lighter of the two greens (lightened 14 Aug
   * 2026 on request).
   *
   * Going lighter forced the label to flip. White on #22A355 is 3.26:1, and a
   * button label at 15px/600 is not "large text" under WCAG, so 3:1 does not
   * buy it. A near-black label measures 5.73:1 — and it is what the brand note
   * describes anyway: "Black carries the primary actions."
   *
   * Because the label is dark, the press goes LIGHTER rather than darker. A
   * darker press would squeeze the very label that has to stay readable while
   * a thumb is on it.
   */
  brand: '#22A355',
  brandPressed: '#2BB25F',
  onBrand: '#101312',
  // --green, kept for type. 5.01:1 on a white card.
  brandInk: '#17803D',
  // --green-t.
  brandTint: '#E9F5ED',
  // --green-p. 12.13:1 on the near-black band.
  brandOnDark: '#B7D8C4',

  // --forest. Near-black despite the name.
  graphite: '#101312',
  graphiteRaised: '#1C201F',
  onGraphite: '#FFFFFF',
  onGraphiteMuted: '#A8B0B8',

  scrim: 'rgba(16,19,18,0.45)',

  /*
   * Success shares the brand green, and that is a deliberate acceptance rather
   * than an oversight. In this product "confirmed" *is* the good outcome, so
   * one green for both is coherent — and it is only survivable because of the
   * standing rule that status is never carried by colour alone. Every status
   * chip has a glyph and a word; a solid green button and a green Confirmed
   * chip are told apart by shape and content, not hue.
   *
   * DEVIATION 3 — success ink darkened from the brand green to #125C2E, which
   * measures 7.22:1 on the tint instead of 4.47:1.
   */
  success: { base: '#17803D', ink: '#125C2E', tint: '#E9F5ED', border: '#B7D8C4', on: '#FFFFFF' },
  /*
   * Amber is "reserved for the logo mark & small accents" — and the deposit's
   * dotted underline is exactly a small accent, so it stays.
   *
   * DEVIATION 4 — --amber #B8860B is 3.25:1 on white, too weak for the deposit
   * *figure*, which is the number a student checks hardest. The stroke and
   * glyph use #B8860B as given; the text ink is #6E4700 at 8.19:1.
   *
   * --amber-l #FFC93C is 1.54:1 on white and must never carry text on a light
   * surface. It is 12.16:1 on the near-black band, which is where it belongs.
   */
  warning: {
    base: '#B8860B',
    ink: '#6E4700',
    tint: '#FFF8E6',
    border: '#EBD9A8',
    borderStrong: '#B8860B',
    // Amber is the one light-mode base white cannot sit on: 3.3:1. Dark ink
    // gives 5.8:1 on the same fill.
    on: '#241900',
  },
  /*
   * ADDITION 1 — the supplied palette has no danger colour, and this product
   * cannot do without one. A failed payment, "Cancel this booking" and the
   * safety report cannot be rendered in the same green as the primary action;
   * that is not a style choice, it is the difference between two opposite
   * outcomes. Carried over unchanged at 5.95:1 both ways.
   */
  danger: { base: '#C0242B', ink: '#8E1B21', tint: '#FBE9E9', border: '#E3ABAE', on: '#FFFFFF' },
  /*
   * ADDITION 2 — likewise no info colour. Rather than introduce a second
   * saturated hue against the palette's whole intent, info is neutral: it
   * reads as "a note", which is what it is. Making it green would dress a
   * caveat up as good news.
   */
  info: { base: '#3D4247', ink: '#101214', tint: '#E9EBEE', border: '#DEE1E6', on: '#FFFFFF' },

  /*
   * Category marks are outside the supplied palette and are left as they are.
   * They are a taxonomy rather than brand expression, they always ship beside
   * a two-letter code, and four categories that differ only by code would cost
   * the feed its scannability. Flagged for review — if the web product already
   * has category colours, these should match those instead.
   */
  category: {
    PG_HOSTEL: { mark: '#A85B00', ink: '#5A3200', tint: '#FBEEDC', code: 'PG' },
    BACHELOR: { mark: '#9B2C86', ink: '#5E1A50', tint: '#F6E4F1', code: 'BR' },
    COLIVE: { mark: '#0F6E6E', ink: '#0A4444', tint: '#DDEEEE', code: 'HC' },
    HOTEL: { mark: '#2F6B2A', ink: '#1D4419', tint: '#E3F0DF', code: 'HT' },
  },
};

/**
 * Dark palette.
 *
 * Batch 0 defined the dark grounds, brand and category solids; the semantic
 * `ink` and `border` steps are derived here to complete the same shape as
 * light, so no component can reference a token that exists in only one mode.
 *
 * Two rules that are inverted relative to light, and are deliberate:
 *   - `brandPressed` goes *lighter* than `brand`, not darker.
 *   - `ink` is the lightest step of a semantic set, not the darkest, because
 *     it sits on a dark `tint`.
 */
const darkColors: ThemeColors = {
  /*
   * Derived, not supplied — the brand palette is light-only.
   *
   * The rule followed here: keep the *relationships*, invert the ground. Grey
   * ground and white cards become near-black ground and lifted near-black
   * cards; the single green stays the only saturated colour; amber stays
   * reserved. Every pair below was measured, and none is under 5:1.
   */
  bg: '#0C0E0E',
  surface: '#161A19',
  surfaceRaised: '#1E2322',
  surfaceSunken: '#101312',

  textPrimary: '#F1F2F4',
  textSecondary: '#B6BDC2',
  // 5.65:1 on a card. The light-mode tertiary correction applies here too.
  textTertiary: '#8B939C',

  border: '#2A302E',
  borderSubtle: '#1D2221',
  /* 3.6:1 on the dark surface. The dark hairline was 1.31:1 — the same
     invisible-field problem, one palette over. */
  borderInput: '#69736E',

  /*
   * --green #17803D is too dark to read on a near-black ground, so dark mode
   * takes --green-m #22A355 (5.38:1 on a card). A solid green button in dark
   * mode therefore carries a NEAR-BLACK label, not a white one: white on
   * #22A355 is 3.26:1, near-black is 5.73:1. That inversion is exactly why
   * `onGraphite` and `brandOnDark` exist as separate tokens.
   */
  brand: '#22A355',
  brandPressed: '#3FBF6E',
  // Near-black, not white — see the note on the token.
  onBrand: '#101312',
  // Green type on a dark ground goes the other way — light, not dark.
  brandInk: '#5FCF8E',
  brandTint: '#10241A',
  brandOnDark: '#B7D8C4',

  graphite: '#1E2322',
  graphiteRaised: '#2A302E',
  onGraphite: '#F1F2F4',
  onGraphiteMuted: '#A8B0B8',

  scrim: 'rgba(0,0,0,0.62)',

  // Same acceptance as light mode: success shares the brand green, and the
  // glyph-and-word rule is what keeps a chip distinct from a button.
  success: { base: '#22A355', ink: '#7FCF9C', tint: '#10241A', border: '#245C3A', on: '#101312' },
  // --amber-l, 11.43:1 on a card. The light-mode amber would vanish here.
  warning: {
    base: '#FFC93C',
    ink: '#F5D68A',
    tint: '#2B2409',
    border: '#5C4B16',
    borderStrong: '#8A701F',
    on: '#101312',
  },
  danger: { base: '#FF7A7F', ink: '#FF9DA1', tint: '#2E1416', border: '#5E2428', on: '#101312' },
  // Neutral, matching light mode — a caveat is not good news.
  info: { base: '#B6BDC2', ink: '#F1F2F4', tint: '#1E2322', border: '#2A302E', on: '#101312' },

  category: {
    PG_HOSTEL: { mark: '#E39A3C', ink: '#F2C88A', tint: '#33220C', code: 'PG' },
    BACHELOR: { mark: '#DF74C4', ink: '#EDAEDD', tint: '#31122A', code: 'BR' },
    COLIVE: { mark: '#3FBFBF', ink: '#8FDCDC', tint: '#0C2C2C', code: 'HC' },
    HOTEL: { mark: '#6FBF62', ink: '#A8DC9E', tint: '#14290F', code: 'HT' },
  },
};

export const palettes = { light: lightColors, dark: darkColors };

/* ------------------------------------------------------------------ *
 * Typography
 * ------------------------------------------------------------------ */

export type TypeFace = 'display' | 'body' | 'numeric';

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
  /** Opt out of OS font scaling entirely — only the check-in code does this. */
  noScale?: boolean;
};

/**
 * The type scale. This is the whole scale — a screen may not invent a size,
 * a weight or a family outside it.
 *
 * The `numeric` face is not decorative: it is load-bearing. Every rupee
 * figure, timer, distance, date, booking id and verification code is set in
 * it, so that digits stay column-aligned and a changing number never shifts
 * the layout around it.
 */
export const typeScale = {
  /*
   * Fourth reduction. The display tier comes down hardest, as asked — but not
   * alone.
   *
   * Reducing only the Archivo tier inverts the scale: title3 would land at 11
   * against body copy at 12, so a section heading would render *smaller* than
   * the paragraph beneath it, and title2 would tie with bodyLg. So the body
   * tier moves a little too, just enough to stay under its own headings.
   *
   * Display and price tiers: about −12%. Body tier: about −5%. Caption, label,
   * eyebrow and numMeta hold at 10, which is the floor — see the note on the
   * previous pass for why 10 is defensible on contrast and what it costs.
   *
   * `codeHero` is untouched at 50 and still `noScale`.
   */
  display1: { face: 'display', size: 21, weight: 700, lineHeight: 23, letterSpacing: -0.63 },
  display2: { face: 'display', size: 15, weight: 700, lineHeight: 19, letterSpacing: -0.38 },
  title1: { face: 'display', size: 14, weight: 700, lineHeight: 17, letterSpacing: -0.28 },
  title2: { face: 'display', size: 13, weight: 700, lineHeight: 16, letterSpacing: -0.2 },
  title3: { face: 'display', size: 12, weight: 600, lineHeight: 15, letterSpacing: -0.12 },

  bodyLg: { face: 'body', size: 12, weight: 400, lineHeight: 18, letterSpacing: 0 },
  body: { face: 'body', size: 11.5, weight: 400, lineHeight: 17, letterSpacing: 0 },
  bodyStrong: { face: 'body', size: 11.5, weight: 600, lineHeight: 15, letterSpacing: 0 },
  caption: { face: 'body', size: 10, weight: 400, lineHeight: 14, letterSpacing: 0 },
  label: { face: 'body', size: 10, weight: 600, lineHeight: 13, letterSpacing: 1, upper: true },
  eyebrow: { face: 'body', size: 10, weight: 600, lineHeight: 13, letterSpacing: 1.4, upper: true },

  priceHero: { face: 'numeric', size: 19, weight: 700, lineHeight: 19, letterSpacing: -0.76, tabular: true },
  priceLg: { face: 'numeric', size: 15, weight: 700, lineHeight: 15, letterSpacing: -0.6, tabular: true },
  priceMd: { face: 'numeric', size: 12.5, weight: 700, lineHeight: 13, letterSpacing: -0.5, tabular: true },
  priceSm: { face: 'numeric', size: 10.5, weight: 600, lineHeight: 14, letterSpacing: 0, tabular: true },
  numMeta: { face: 'numeric', size: 10, weight: 500, lineHeight: 14, letterSpacing: 0, tabular: true },
  codeHero: { face: 'numeric', size: 50, weight: 700, lineHeight: 50, letterSpacing: 0, tabular: true, noScale: true },
} as const satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof typeScale;

/**
 * Loaded font family names, keyed by face and weight.
 *
 * React Native cannot synthesise a weight from a single family, so every
 * weight is a separately registered family. `resolveFontFamily` below is the
 * only place allowed to do this lookup.
 */
export const fontFamilies: Record<TypeFace, Record<400 | 500 | 600 | 700, string>> = {
  display: {
    400: 'Archivo_400Regular',
    500: 'Archivo_500Medium',
    600: 'Archivo_600SemiBold',
    700: 'Archivo_700Bold',
  },
  body: {
    400: 'InstrumentSans_400Regular',
    500: 'InstrumentSans_500Medium',
    600: 'InstrumentSans_600SemiBold',
    700: 'InstrumentSans_700Bold',
  },
  numeric: {
    400: 'MartianMono_400Regular',
    500: 'MartianMono_500Medium',
    600: 'MartianMono_600SemiBold',
    700: 'MartianMono_700Bold',
  },
};

export function resolveFontFamily(face: TypeFace, weight: 400 | 500 | 600 | 700): string {
  return fontFamilies[face][weight];
}

/**
 * How far each face is allowed to grow under the OS font-size setting.
 *
 * Body text takes the largest multiplier because it is the text a parent
 * reading over a student's shoulder most needs enlarged. Display is capped
 * tighter so headings cannot push the content they title off screen, and the
 * verification code does not scale at all — it has a fixed six-character
 * layout that breaks the moment it wraps.
 */
/**
 * ONE cap for every face, not three.
 *
 * It used to be display 1.3, body 1.8, numeric 1.5 — chosen per face, on the
 * reasoning that display type is already large and body type is the one that
 * must scale. The consequence was never checked, and it is that **the scale
 * inverts**: at an OS font scale of 1.8, `body` renders at 24.3 while its own
 * heading `title2` is capped at 20.8, and `bodyLg` at 27 overtakes `title1` at
 * 26. Body copy ends up bigger than the headings above it, and a caption ends
 * up the same size as a section title.
 *
 * A type scale only means anything as a set of relationships. Scaling its
 * members at different rates does not enlarge the scale, it destroys it.
 *
 * 1.3 is the old display cap, now applied to everything: the relationships
 * hold at every setting, and body text at the largest OS setting drops from
 * 24.3 to 17.6 — which is the "text is too big" complaint, and it was never
 * about the base sizes.
 *
 * This does reduce how far the app follows a user who has set very large
 * system text, and that is a real trade rather than a free win. It is a single
 * number if it needs revisiting.
 */
export const MAX_FONT_SCALE = 1.3;

export const maxFontSizeMultiplier: Record<TypeFace, number> = {
  display: MAX_FONT_SCALE,
  body: MAX_FONT_SCALE,
  numeric: MAX_FONT_SCALE,
};

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/**
 * Money is the product's actual content, so its typesetting is a contract,
 * not a style choice.
 *
 * The load-bearing rule: rent and deposit must never be typeset identically.
 * Rent is the heaviest numeral on any surface. Deposit is lighter and always
 * carries the dotted amber underline, because it is money that comes back.
 * An estimate is weight 500 and always carries a range, a `≈` or a source —
 * it is never allowed to look like a fixed charge.
 */
export const money = {
  symbol: '₹',
  /** The symbol is smaller and lighter than the number. The number is the fact. */
  symbolSizeRatio: 0.6,
  symbolWeight: 500 as const,
  symbolGap: 2,
  /** Indian digit grouping: 1,20,000 — not 120,000. */
  locale: 'en-IN',
  /**
   * Two lengths of the same suffix.
   *
   * The long form is the default everywhere a card, a detail screen or the CTA
   * bar has room for it. The short form exists only for the compact map
   * preview, where the card is 300pt wide and shares a row with a distance and
   * an availability chip. Batch 3's sheet is explicit that `/month` is never
   * abbreviated on detail.
   */
  rentSuffix: '/mo',
  rentSuffixLong: '/month',
  perBedSuffix: '/bed',
  perBedSuffixLong: '/bed/month',
  perNightSuffix: '/night',
  estimatePrefix: '≈',
  estimateWeight: 500 as const,
  depositUnderline: { width: 2, style: 'dotted' as const, offset: 2 },
  /** A quoted price older than this must be re-fetched before it is acted on. */
  freshnessMaxAgeMinutes: 15,
};

/* ------------------------------------------------------------------ *
 * Space, radius, elevation, touch
 * ------------------------------------------------------------------ */

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40 } as const;

/**
 * Four radii and a pill. This is the Batch 12 correction: eleven batches had
 * drifted to nine different values, which is a habit rather than a scale.
 *
 * Pick by what the element *is*:
 *   chip   anything sitting inside another surface
 *   button anything tappable that is its own object
 *   card   anything holding other elements
 *   sheet  anything meeting a screen edge
 *   pill   true pills only — segments, avatars, status dots, timer rings
 */
export const radius = { chip: 8, button: 12, card: 16, sheet: 24, pill: 999 } as const;

/**
 * Elevation, pre-shaped for React Native so no caller hand-writes shadow
 * props. Shadows are never animated — the Batch 12 motion rules forbid it.
 */
export const elevation = {
  flat: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  raised: {
    shadowColor: '#10151C',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  card: {
    shadowColor: '#10151C',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sheet: {
    shadowColor: '#10151C',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 6,
  },
  float: {
    shadowColor: '#10151C',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

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
  /** Six glyphs the icon library does not have and that this market needs. */
  custom: ['mess', 'powerBackup', 'waterSupply', 'warden', 'curfew', 'attachedBath'] as const,
  /** Money and status are never labelled by icon alone. */
  minSize: 16,
} as const;

/* ------------------------------------------------------------------ *
 * Booking status
 * ------------------------------------------------------------------ */

/**
 * The booking state machine, straight from the developer flow spec, mapped to
 * its visual phase.
 *
 * The rule that matters for accessibility: `phase` drives colour, but the
 * glyph, the label and the actor carry the meaning on their own. A user who
 * cannot separate the amber from the green still knows what happened, because
 * "Requested · owner replies within 4h" says it in words.
 */
export type StatusPhase = 'waiting' | 'good' | 'closed' | 'stopped' | 'info';

export type BookingStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'PAYMENT_PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'COMPLETED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED_BY_CUSTOMER'
  | 'CANCELLED_BY_OWNER'
  | 'PAYMENT_FAILED'
  | 'DISPUTED';

export type StatusDescriptor = {
  phase: StatusPhase;
  label: string;
  glyph: string;
  /** Which clock, if any, this state runs. Only one may be visible per screen. */
  timer?: 'ownerResponse' | 'payment';
  /** The user can do something about this right now. */
  actionable?: boolean;
  /** Who ended it. Shown next to the label so blame is never ambiguous. */
  actor?: string;
  /** A closed state that should read as neutral, not as a failure. */
  neutral?: boolean;
};

export const bookingStatus: Record<BookingStatus, StatusDescriptor> = {
  REQUESTED: { phase: 'waiting', label: 'Requested', glyph: 'clock', timer: 'ownerResponse' },
  ACCEPTED: { phase: 'good', label: 'Accepted', glyph: 'check' },
  PAYMENT_PENDING: { phase: 'waiting', label: 'Payment pending', glyph: 'clock', timer: 'payment', actionable: true },
  CONFIRMED: { phase: 'good', label: 'Confirmed', glyph: 'check' },
  CHECKED_IN: { phase: 'good', label: 'Checked in', glyph: 'arrow-right-to-line' },
  CHECKED_OUT: { phase: 'closed', label: 'Checked out', glyph: 'arrow-left-from-line' },
  COMPLETED: { phase: 'closed', label: 'Completed', glyph: 'circle' },
  REJECTED: { phase: 'stopped', label: 'Rejected', glyph: 'x' },
  EXPIRED: { phase: 'closed', label: 'Expired', glyph: 'slash', neutral: true },
  CANCELLED_BY_CUSTOMER: { phase: 'closed', label: 'Cancelled', glyph: 'x', actor: 'by you', neutral: true },
  CANCELLED_BY_OWNER: { phase: 'stopped', label: 'Cancelled', glyph: 'x', actor: 'by owner' },
  PAYMENT_FAILED: { phase: 'stopped', label: 'Payment failed', glyph: 'rotate-ccw', timer: 'payment', actionable: true },
  DISPUTED: { phase: 'info', label: 'Disputed', glyph: 'alert-triangle' },
};

/** Resolve a phase to its colour set in the active palette. */
export function phaseColors(colors: ThemeColors, phase: StatusPhase) {
  switch (phase) {
    case 'waiting':
      return { ink: colors.warning.ink, tint: colors.warning.tint, border: colors.warning.border };
    case 'good':
      return { ink: colors.success.ink, tint: colors.success.tint, border: colors.success.border };
    case 'stopped':
      return { ink: colors.danger.ink, tint: colors.danger.tint, border: colors.danger.border };
    case 'info':
      return { ink: colors.info.ink, tint: colors.info.tint, border: colors.info.border };
    case 'closed':
    default:
      return { ink: colors.textSecondary, tint: colors.surfaceSunken, border: colors.border };
  }
}

/* ------------------------------------------------------------------ *
 * Clocks
 * ------------------------------------------------------------------ */

/**
 * The three clocks, in the order they can run.
 *
 * Two rules, both of which are state-machine rules wearing layout clothing:
 *   - Exactly one timer may be visible on a screen. Two means the booking is
 *     in an impossible state, and the fix is upstream, not in the layout.
 *   - A timer is always given an absolute server deadline, never a duration.
 *     A device clock that is ten minutes fast must not be able to tell a
 *     student their payment window closed when it has not.
 */
export const clocks = {
  quoteValidity: { id: 'QUOTE_VALIDITY', label: 'Price held for' },
  ownerResponse: { id: 'OWNER_RESPONSE', label: 'Owner replies within' },
  paymentDeadline: { id: 'PAYMENT_DEADLINE', label: 'Pay within' },
  /** Under this many seconds the timer switches to its critical treatment. */
  criticalThresholdSeconds: 60,
  visibleAtOnce: 1,
} as const;

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

/** Layout constants for a 390 x 844pt Android-first frame. */
export const layout = {
  /** Screen gutter, both edges. Carousels bleed past it but start on it. */
  gutter: 16,
  sectionGap: space[4],
  groupGap: space[3],
  cardPadding: space[4],
  listRowPadding: space[3],
  /** Thumb territory. Every primary action lives in the bottom of the screen. */
  reachZone: 280,
  /** Tab bars and sticky footers add this to the bottom safe-area inset. */
  bottomInsetExtra: 10,
  /** FlatList tuning for the 3GB Android devices this audience actually holds. */
  list: { initialNumToRender: 6, windowSize: 5 },
  /** Request images at twice their layout size — never at full resolution. */
  imageScale: 2,
} as const;
