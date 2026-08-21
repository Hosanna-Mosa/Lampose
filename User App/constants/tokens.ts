/**
 * LAMPOSE design tokens — the "Dock" system.
 *
 * Source of truth: the Dock reference sheet (20 Aug 2026), which supplies six
 * colour roles and three typefaces and describes the app as *sheet-native* —
 * filters, the sharing choice and the request all rise in a docked sheet over
 * the screen rather than replacing it, so a student never loses the photo they
 * were looking at.
 *
 * It replaced the earlier cool-grey/green foundation wholesale. What survived
 * that repaint, because it is structure rather than skin:
 *   - The four-radius scale plus `pill`. A radius is chosen by what the element
 *     *is*, not by its size.
 *   - Every accessibility correction the old foundation had earned. Each token
 *     below was re-measured against the new grounds rather than recoloured by
 *     eye; the ratios are in the comments.
 *   - The rule that status is never carried by colour alone — which the Dock
 *     palette needs more than its predecessor did, since ACCENT and CONFIRM are
 *     literally the same hex.
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
   * In dark mode every `base` here is a *light* colour — #2E9B84, #E0954A,
   * #F08078, #BFBAB1 — so a white glyph on any of them lands between 1.5:1 and
   * 3.4:1 and effectively disappears; the ink there is near-black. In light
   * mode all four are dark enough to carry white, which is new: the old amber
   * could not, and CAUTION #A85A1E can.
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
   * `border` is a decorative hairline and is deliberately faint: at 1.34:1 on
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
   * puts white on ACCENT #0E6E5C (6.25:1). Dark mode's accent is lightened to
   * #2E9B84 so it can sit on a near-black ground, and white on that measures
   * 3.42:1 and fails — so the label there is near-black at 5.49:1. Any
   * component that hardcodes '#FFFFFF' on a brand surface is legible in one
   * mode and not the other.
   */
  onBrand: string;
  /**
   * The accent used as INK — a ghost button's label, a link, an active icon.
   *
   * Separate from `brand` because the two have opposite constraints. `brand` is
   * a fill; ink sits on a light surface and must stay dark enough to read. In
   * light mode ACCENT is dark enough to be both, so the two tokens hold the
   * same hex — but they still diverge in dark mode, so anything drawing accent
   * *type* must keep pointing here rather than collapsing onto `brand`.
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
   * The "Dock" palette, adopted 20 Aug 2026. It replaces the cool-grey/green
   * scheme wholesale — this is a repaint of the system, not a tweak to it.
   *
   * The supplied roles, verbatim:
   *   GROUND  #EFEDE9   SURFACE #FFFFFF   INK     #1A1917
   *   ACCENT  #0E6E5C   CONFIRM #0E6E5C   CAUTION #A85A1E
   *
   * Two things changed in kind rather than in hue, and both cascade:
   *
   * 1. The ground is WARM. #EFEDE9 is a paper/bone tone, not a grey, so every
   *    neutral derived from it carries the same warmth — borders, sunken wells,
   *    the whole secondary/tertiary text ramp. A cool grey dropped into this
   *    palette reads as dirty, which is why none of the old neutrals survive.
   *
   * 2. The accent is DARK ENOUGH TO CARRY WHITE. #0E6E5C measures 6.25:1
   *    against white, so `onBrand` is finally plain #FFFFFF and a primary
   *    button is teal-with-white — exactly as drawn in the reference. The old
   *    palette's green was light enough to force a near-black label; that
   *    inversion is gone in light mode and survives only in dark, where the
   *    accent still has to be lightened to sit on a near-black ground.
   *
   * Because ACCENT and CONFIRM are the same hex in the source, `brand`,
   * `brandInk` and `success.base` are one colour here. That is the reference's
   * intent — in this product "confirmed" is the good outcome — and it stays
   * survivable only because of the standing rule that status is never carried
   * by colour alone: every status chip ships a glyph and a word.
   *
   * Every value below is either a supplied token or a measured derivation of
   * one. Contrast ratios are in the comments; none of them is a guess.
   */
  bg: '#EFEDE9',
  surface: '#FFFFFF',
  // A card sitting on another card. Warm enough to separate from pure white.
  surfaceRaised: '#F7F5F1',
  // Inset wells: skeletons, disabled fields, image placeholders, sold-out rows.
  surfaceSunken: '#E5E2DB',

  // INK, supplied. 15.1:1 on the ground, 17.6:1 on a card.
  textPrimary: '#1A1917',
  // 7.8:1 on a card, 6.7:1 on the ground.
  textSecondary: '#55524C',
  /*
   * Tertiary is the token that has to clear THREE grounds, not one: it sets
   * meta lines on cards (6.2:1), on the page ground (5.3:1), and the label of
   * a disabled button, which is drawn on `surfaceSunken` (4.8:1). The warm
   * grey was walked down to #66625A precisely so the third of those clears
   * 4.5 — the first draft at #6E6A62 passed the first two and failed that one.
   */
  textTertiary: '#66625A',

  border: '#E2DED6',
  borderSubtle: '#EDEAE4',
  /*
   * The edge of an EMPTY interactive field, per WCAG 1.4.11's 3:1 for the
   * boundary of a control. 3.5:1 on the white field fill and 3.0:1 on the
   * ground behind it. `border` above is decorative and deliberately far
   * fainter — right for a card, wrong for a control nobody has answered yet.
   */
  borderInput: '#8F897C',

  // ACCENT, supplied.
  brand: '#0E6E5C',
  // The press goes DARKER here, unlike the old palette — see the note on
  // `onBrand`. A white label only gets safer as the fill deepens.
  brandPressed: '#0A5748',
  // 6.25:1. The whole reason this palette can draw the button as reference does.
  onBrand: '#FFFFFF',
  /*
   * Accent as INK — a ghost button's label, a link, an active tab glyph.
   *
   * Identical to `brand` because at 6.25:1 on white the fill is already dark
   * enough to be read as type. The token stays separate rather than being
   * collapsed: dark mode has to split them again, and every call site that
   * draws accent *type* should keep pointing at the token that is allowed to
   * differ per mode.
   */
  brandInk: '#0E6E5C',
  // The wash behind a selected option row. 5.3:1 for accent ink on it.
  brandTint: '#E3F0EB',
  // Accent for use on `graphite`, either mode. 10.6:1 there. Never use `brand`.
  brandOnDark: '#8FD6C3',

  // INK doubles as the inverted surface — snackbars, push previews, the photo
  // counter pill. One near-black, not two.
  graphite: '#1A1917',
  graphiteRaised: '#262421',
  onGraphite: '#FFFFFF',
  onGraphiteMuted: '#A9A398',

  scrim: 'rgba(26,25,23,0.45)',

  // CONFIRM, supplied — the same hex as ACCENT. `ink` is darkened to #0B5245
  // so it measures 7.8:1 on its own tint rather than 5.3:1.
  success: { base: '#0E6E5C', ink: '#0B5245', tint: '#E3F0EB', border: '#A9D5C8', on: '#FFFFFF' },
  /*
   * CAUTION, supplied. Unlike the old amber this one is dark enough to be a
   * real semantic colour rather than a logo accent: 5.1:1 on white, so it can
   * carry white text AND set the deposit figure without a separate darker ink.
   * `ink` still steps down to #7A3D0F for text on the tint (7.4:1).
   */
  warning: {
    base: '#A85A1E',
    ink: '#7A3D0F',
    tint: '#FBEEE2',
    border: '#E6C8A6',
    borderStrong: '#A85A1E',
    on: '#FFFFFF',
  },
  /*
   * The reference sheet has no danger role, and this product cannot do without
   * one: a failed payment, "Cancel this booking" and the safety report must not
   * render in the accent. Warm red, chosen to sit in the same desaturated
   * register as CAUTION rather than beside it — 6.6:1 on white both ways.
   */
  danger: { base: '#B3261E', ink: '#8C1D17', tint: '#FBEAE8', border: '#E4B4B0', on: '#FFFFFF' },
  /*
   * Likewise no info role. It stays neutral rather than introducing a second
   * saturated hue: a caveat reads as "a note", and making it teal would dress
   * one up as good news.
   */
  info: { base: '#55524C', ink: '#1A1917', tint: '#E9E6E0', border: '#DDD9D1', on: '#FFFFFF' },

  /*
   * Category marks are a taxonomy, not brand expression, and the reference
   * draws its category chips as quiet neutrals rather than colour-coding them.
   * So these are pulled right down into the warm, desaturated register — ochre,
   * plum, slate, moss. They still differ enough to scan a feed by, and they no
   * longer shout over the single accent. Every `ink` clears 7:1 on its `tint`.
   */
  category: {
    PG_HOSTEL: { mark: '#8A6A2A', ink: '#574115', tint: '#F4EEDF', code: 'PG' },
    BACHELOR: { mark: '#7A4B72', ink: '#4E2E49', tint: '#F2E9F0', code: 'BR' },
    COLIVE: { mark: '#2F6076', ink: '#1E3D4B', tint: '#E5EEF2', code: 'HC' },
    HOTEL: { mark: '#4A6B3A', ink: '#2E4424', tint: '#E9EFE3', code: 'HT' },
  },
};

/**
 * Dark palette.
 *
 * Derived, not supplied — the Dock sheet is light-only. The rule followed:
 * keep the relationships, invert the ground, and keep it WARM. A neutral-grey
 * dark mode under a bone-and-teal light mode reads as a different product.
 *
 * Two rules inverted relative to light, both deliberate:
 *   - `brandPressed` goes lighter than `brand`, not darker.
 *   - `onBrand` is near-black, not white. The accent has to be lightened to
 *     #2E9B84 to sit on a near-black ground, and white on that is 3.4:1 —
 *     failing. Near-black on it is 5.5:1. This is the one token that cannot be
 *     shared across modes, and it is why `onBrand` exists at all.
 */
const darkColors: ThemeColors = {
  bg: '#131211',
  surface: '#1C1B19',
  surfaceRaised: '#252320',
  surfaceSunken: '#0E0D0C',

  textPrimary: '#F2F0EC',
  textSecondary: '#BFBAB1',
  // 5.4:1 on a card. The light-mode tertiary correction applies here too.
  textTertiary: '#948F87',

  border: '#302E2A',
  borderSubtle: '#232220',
  /* 3.4:1 on the dark surface — the same empty-field rule, one palette over. */
  borderInput: '#736E64',

  // ACCENT lightened until it reads on a near-black ground.
  brand: '#2E9B84',
  brandPressed: '#3FB39A',
  // Near-black, not white — see the note above.
  onBrand: '#0B1512',
  // Accent type on a dark ground goes the other way: lighter still. 8.6:1.
  brandInk: '#5FC9AF',
  brandTint: '#0F2721',
  brandOnDark: '#8FD6C3',

  graphite: '#252320',
  graphiteRaised: '#302E2A',
  onGraphite: '#F2F0EC',
  onGraphiteMuted: '#A9A398',

  scrim: 'rgba(0,0,0,0.62)',

  success: { base: '#2E9B84', ink: '#7FD3BE', tint: '#0F2721', border: '#2A5A4E', on: '#0B1512' },
  // CAUTION lightened the same way: #A85A1E is 1.9:1 on a dark card.
  warning: {
    base: '#E0954A',
    ink: '#EEBC85',
    tint: '#2C1E0E',
    border: '#5C4322',
    borderStrong: '#8A6631',
    on: '#1A1917',
  },
  danger: { base: '#F08078', ink: '#F5A49E', tint: '#2C1513', border: '#5E2A26', on: '#1A1917' },
  // Neutral, matching light mode — a caveat is not good news.
  info: { base: '#BFBAB1', ink: '#F2F0EC', tint: '#252320', border: '#302E2A', on: '#131211' },

  category: {
    PG_HOSTEL: { mark: '#D9AC5E', ink: '#E9CB96', tint: '#2E250F', code: 'PG' },
    BACHELOR: { mark: '#C98FBC', ink: '#DDB4D3', tint: '#2A1626', code: 'BR' },
    COLIVE: { mark: '#6FAAC4', ink: '#A3C9DA', tint: '#12262E', code: 'HC' },
    HOTEL: { mark: '#8FBC7C', ink: '#B4D3A6', tint: '#1A2614', code: 'HT' },
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
 * The `numeric` face is not decorative: it is load-bearing. A timer, distance,
 * date, deposit, booking id and verification code is set in it, so that digits
 * stay column-aligned and a changing number never shifts the layout around it.
 *
 * ## The two hero price tiers are DISPLAY, not numeric
 *
 * Changed 20 Aug 2026 with the Dock repaint, and it is the reference's call
 * rather than a preference: the sheet sets its DISPLAY specimen to "₹8,500" in
 * Outfit and reserves the FIGURES specimen — "17,000 · 4192 · 22 min · 3 free"
 * — for DM Mono. So the rent a student is actually deciding on is display type,
 * and everything secondary around it is mono.
 *
 * That reading is also what makes the trio work at all. DM Mono has no weight
 * above Medium (see `fontFamilies`), so a hero rent left on `numeric` would be
 * the one figure on the screen that could not be the heaviest thing on it.
 *
 * `tabular` stays true on both: Outfit's numerals are uniform-width by design,
 * so a rent that ticks between sharing options still does not reflow its row.
 */
export const typeScale = {
  /*
   * Fourth reduction. The display tier comes down hardest, as asked — but not
   * alone.
   *
   * Reducing only the display tier inverts the scale: title3 would land at 11
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

  // Display face — see the note above the scale.
  priceHero: { face: 'display', size: 19, weight: 700, lineHeight: 19, letterSpacing: -0.76, tabular: true },
  priceLg: { face: 'display', size: 15, weight: 700, lineHeight: 15, letterSpacing: -0.6, tabular: true },
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
 *
 * The Dock trio, adopted 20 Aug 2026 with the palette:
 *   DISPLAY  Outfit         — headings, and the hero rent figure
 *   BODY     Source Sans 3  — everything read as prose
 *   FIGURES  DM Mono        — secondary numerals: deposits, distances,
 *                             counts, timers, ids and the gate code
 *
 * ## DM Mono stops at 500
 *
 * The family ships Light/Regular/Medium and nothing heavier, so `numeric` 600
 * and 700 both resolve to `DMMono_500Medium`. That is a genuine ceiling rather
 * than an oversight, and it is survivable only because of the change above it:
 * the *hero* rent moved onto the display face, so nothing that needed to be
 * the heaviest numeral on a surface is asking this family to be bold. What is
 * left on `numeric` — a deposit, "22 min", "3 beds free", a booking id — is
 * secondary by definition and reads correctly at Medium.
 *
 * Swapping in a mono with a bold (JetBrains Mono, IBM Plex Mono) is the fix if
 * a heavier figure is ever needed; it is a change in this map alone.
 */
export const fontFamilies: Record<TypeFace, Record<400 | 500 | 600 | 700, string>> = {
  display: {
    400: 'Outfit_400Regular',
    500: 'Outfit_500Medium',
    600: 'Outfit_600SemiBold',
    700: 'Outfit_700Bold',
  },
  body: {
    400: 'SourceSans3_400Regular',
    500: 'SourceSans3_500Medium',
    600: 'SourceSans3_600SemiBold',
    700: 'SourceSans3_700Bold',
  },
  numeric: {
    400: 'DMMono_400Regular',
    500: 'DMMono_500Medium',
    // No 600 or 700 exists in DM Mono. Both fall back to Medium — see above.
    600: 'DMMono_500Medium',
    700: 'DMMono_500Medium',
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
    shadowColor: '#1A1917',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  card: {
    shadowColor: '#1A1917',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sheet: {
    shadowColor: '#1A1917',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 6,
  },
  float: {
    shadowColor: '#1A1917',
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
  /** Glyphs the icon library does not have and that this market needs.
      `food` is the Food module's tab glyph — a destination, not an amenity. */
  custom: ['mess', 'food', 'powerBackup', 'waterSupply', 'warden', 'curfew', 'attachedBath'] as const,
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
