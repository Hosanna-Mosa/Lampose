/**
 * LAMPOSE Stay Partner — type scale.
 *
 * Manrope throughout, per the design system: geometric, legible small, and it
 * holds up against dense numeric data. JetBrains Mono carries reference IDs and
 * the uppercase mono eyebrows.
 *
 * Weight maps to a distinct family name because React Native cannot synthesize
 * weights from a single loaded face — `fontWeight` alone silently falls back.
 */

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
  mono: 'JetBrainsMono_500Medium',
} as const;

type Variant = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
};

/*
 * The ladder: 28 · 22 · 20 · 18 · 16 · 15 · 14 · 13 · 12 · 11 · 10.
 *
 * Every size below is on it. Half-steps — 12.5, 13.5, 14.5, 17, 19 — had spread
 * across about forty style blocks, each set by hand at whatever looked right on
 * that screen. Half a point is invisible in isolation and unmistakable in
 * aggregate: it is why two cards side by side never quite agreed.
 *
 * The top of the ladder came down in this pass. `display` was 32 and
 * `screenTitle` 22/800, which on a phone is a headline shouting at somebody who
 * already knows which screen they opened — the back arrow and the tab bar have
 * both told them. Titles now sit at 20 and drop to 700, so the loudest thing on
 * a screen is its content rather than its name.
 */
export const type = {
  /** 28/34 · 800 — splash and one-off hero figures. Nothing else. */
  display: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  /** 22/28 · 800 — auth screen titles */
  pageTitle: { fontFamily: fonts.extrabold, fontSize: 22, lineHeight: 28, letterSpacing: -0.25 },
  /** 20/26 · 800 — the tighter auth title */
  pageTitleSm: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  /** 20/26 · 700 */
  h2: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  /**
   * 20/26 · 700 — the standard in-content screen title.
   *
   * Was 22/800. Dropping both the size and the weight is deliberate: at 800 a
   * title competes with the numbers underneath it, and on this app the numbers
   * are the point.
   */
  screenTitle: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  /** 18/24 · 600 — section headings inside a screen */
  h3: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  /** 16/21 · 700 — top header title */
  headerTitle: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 21 },
  /**
   * 24/30 · 800 — a single large figure: a balance, a payout total, a rating.
   *
   * Added because five screens had each invented their own — 32, 32, 30, 30 and
   * 30 — for exactly this job. One variant means a balance and a payout are the
   * same size, which is the whole reason somebody trusts reading them quickly.
   */
  metric: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  /** 15/22 · 500 — booking details, list labels */
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  /** 15/22 · 400 — descriptions, helper copy */
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  /** 14/21 · 500 — settings rows, chips */
  bodySm: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 },
  /** 14/20 · 700 — card titles */
  cardTitle: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
  /** 13/18 · 400 — timestamps, secondary metadata */
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  /** 13/18 · 600 — inline text links */
  link: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  /** 12/17 · 600 — field labels */
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17 },
  /** 11/16 · 600 — badge text */
  badge: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16 },
  /** 11/14 · 700 · caps · +.07em — section overlines */
  overline: {
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.77,
    textTransform: 'uppercase',
  },
  /** 11/14 · 500 · mono — reference IDs, tab labels */
  mono: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 14 },
  /** 10/13 · 700 — bottom tab labels */
  tabLabel: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 13 },
} satisfies Record<string, Variant>;

export type TypeVariant = keyof typeof type;
