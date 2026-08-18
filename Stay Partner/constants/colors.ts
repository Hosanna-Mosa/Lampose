/**
 * LAMPOSE Stay Partner — color tokens.
 *
 * Converted from the oklch values in `designs/LAMPOSE Stay Partner - Design System.dc.html`.
 * `dark` is a real palette (added 18 Aug) — the design set only ever specified light, so
 * every dark value below is derived from `light`'s own hues rather than a source file:
 * same semantic families (warm neutral, brand green, amber, red, violet), lightness ramp
 * inverted for a dark background, kept saturated enough to still read as the same brand
 * rather than a desaturated grey version of it. `useColors()` picks whichever key matches
 * the device's `useColorScheme()` with no other code changes.
 *
 * Every pairing below was checked against WCAG AA the same way `light`'s deviations were —
 * a standalone contrast script (relative luminance, not a library), 4.5:1 for body text,
 * 3:1 accepted only for bold/medium UI text (buttons, links) or already-tertiary roles.
 *
 * Two foregrounds deviate from the source design because the originals fail WCAG AA
 * against their own tints (see `successOnTint` / `warningOnTint` below).
 *
 * The Accent family was re-themed 16 Aug from the design set's blue to the real
 * lampose.com brand green — the app's own site, not a design-file color, refined
 * same day once the app switched from the site's textured splash-mark favicon to
 * its flat square logo (`/assets/logo-*.png` in the site's own JS bundle — the
 * mark actually used in its UI, not just its favicon). `accent` and `brandYellow`
 * are pixel-sampled straight from that flat mark's solid fill; `accentHover` is
 * darkened from the same sampled hue, since the site's <meta name="theme-color">
 * (used for this role in the first pass) turned out lighter than this more
 * saturated sample, which would read as the pressed state going brighter, not
 * darker. The rest of the family (tint/ink/muted) is fanned out from the sampled
 * hue the same way the old blue family was — one canonical hue, lightness/
 * saturation varied per role. Every text-on-tint pairing below was re-checked
 * for WCAG AA (4.5:1) at its actual usage size.
 */

const palette = {
  // ── Neutrals (hue 75, warm) ─────────────────────────────────────────────
  surface: '#FEFDFC', // cards, sheets, headers — oklch(99.5% .002 75)
  bg: '#FAF8F5', // app background — oklch(98% .004 75)
  surfaceSunken: '#F3F1F0', // disabled fields, segmented track — oklch(96% .003 75)
  borderSubtle: '#EAE7E4', // dividers — oklch(93% .005 75)
  borderCard: '#E4E1DD', // card outlines — oklch(91% .006 75)
  border: '#DDDAD6', // input borders — oklch(89% .006 75)

  textDisabled: '#A8A49F', // oklch(72% .008 75)
  textTertiary: '#898581', // timestamps, placeholders — oklch(62% .008 75)
  textCaption: '#75716B', // helper copy — oklch(55% .01 75)
  textSecondary: '#615D57', // descriptions — oklch(48% .01 75)
  textBody: '#3E3A35', // review/message body — oklch(35% .01 75)
  textPrimary: '#1D1A16', // headings, values — oklch(22% .01 75)

  // ── Accent (lampose.com brand green, extracted & refined 16 Aug) ─────────
  accent: '#14492F', // pixel-sampled from the flat logo mark's fill — 10.38:1 on white
  accentHover: '#0D3622', // pressed — darkened from the same sample, 13.45:1 on white
  accentTint: '#EAF5F0', // focus ring, selected range
  accentTintAlt: '#F5F9F7', // placeholder hatching
  accentInk: '#197648', // text on accentTint — 5.07:1
  accentInkDeep: '#0E4E2F', // large figures on accentTint — 8.76:1
  accentMuted: '#317252', // secondary text on accentTint — 5.13:1
  brandYellow: '#FFDE59', // pixel-sampled from the logo's "o" — splash tagline only, 7.83:1 on accent

  // ── Success / paid / confirmed ──────────────────────────────────────────
  success: '#227C45', // fills, icons, bars — oklch(52% .12 152)
  successTint: '#D6F4DD', // oklch(94% .045 152)
  successOnTint: '#1A763F', // DEVIATION: design's #227C45 is 4.42:1 on the tint; this is 4.81:1
  successInk: '#005126', // oklch(38% .1 152)
  successInkDeep: '#104625', // oklch(35% .08 152)

  // ── Warning / pending / in review ───────────────────────────────────────
  warning: '#A96B00', // stars, icons, bars — oklch(58% .14 75)
  warningTint: '#FEE9BE', // oklch(94% .06 85)
  warningOnTint: '#8F5300', // DEVIATION: design's #A96B00 is 3.68:1 on the tint; this is 5.17:1
  warningFill: '#A56300', // DEVIATION: solid-badge fill; white on #A96B00 is 4.38:1, this is 4.79:1
  warningInk: '#754B00', // oklch(45% .1 75)
  warningInkDeep: '#604008', // oklch(40% .08 75)

  // ── Error / failed / cancelled ──────────────────────────────────────────
  error: '#B63132', // oklch(52% .17 25)
  errorTint: '#FFE0DC', // oklch(94% .045 25)
  errorHover: '#A21921', // oklch(46% .17 25)
  errorInk: '#800613', // oklch(38% .15 25)
  errorInkDeep: '#6C1517', // oklch(35% .12 25)

  // ── Info / completed / refunded ─────────────────────────────────────────
  info: '#635EA5', // oklch(52% .11 285)
  infoTint: '#E8E8FF', // oklch(94% .035 285)

  // ── Fixed values ────────────────────────────────────────────────────────
  white: '#FFFFFF',
  scrim: 'rgba(29, 26, 22, 0.45)', // sheet backdrop — oklch(22% .01 75 / .45)
};

const darkPalette = {
  // ── Neutrals (hue 75, warm — same family as light, ramp inverted) ────────
  surface: '#211D17', // cards, sheets, headers — one step above bg
  bg: '#17140F', // app background
  surfaceSunken: '#2A251E', // disabled fields, segmented track
  borderSubtle: '#332D24',
  borderCard: '#3D362B',
  border: '#473F33',

  textDisabled: '#6B655A',
  textTertiary: '#8B8477', // 4.95:1 on bg
  textCaption: '#A39B8C', // 6.67:1 on bg
  textSecondary: '#BEB6A6', // 9.12:1 on bg
  textBody: '#DCD4C4', // 12.47:1 on bg
  textPrimary: '#F5F1E8', // 16.29:1 on bg

  // ── Accent (same sampled brand green, brightened for a dark ground) ──────
  /* One token still does double duty — primary button fill (white text on
     top) and ghost-button/link text (on bg) — same as light. No single value
     clears 4.5:1 both ways on a dark ground the way the light value does on
     white, so this is chosen for the fill role at full AA (4.63:1 white text)
     and lands at 3.97:1 for the text-on-bg role — short of body-text AA but
     comfortably past the 3:1 large/bold-text bar every actual use here
     (buttons, link labels) qualifies for. */
  accent: '#1F8552',
  accentHover: '#186B41', // pressed — darker, 6.53:1 for white text on it
  accentTint: '#132B20',
  accentTintAlt: '#16241C',
  accentInk: '#5FD498', // text on accentTint — 8.15:1
  accentInkDeep: '#8FE6BB', // large figures on accentTint — 10.19:1
  accentMuted: '#7FBE9E', // secondary text on accentTint — 7.00:1
  brandYellow: '#FFDE59', // unchanged — a bright yellow reads fine on dark too

  // ── Success / paid / confirmed ──────────────────────────────────────────
  success: '#4CBA76', // 7.51:1 on bg
  successTint: '#123322',
  successOnTint: '#6FE0A0', // 8.44:1 on successTint
  successInk: '#8FEEB8', // 13.20:1 on bg
  successInkDeep: '#B0F5D0', // 14.71:1 on bg

  // ── Warning / pending / in review ────────────────────────────────────────
  warning: '#E0A030', // 8.08:1 on bg
  warningTint: '#3A2A0A',
  warningOnTint: '#F0B94D', // 7.75:1 on warningTint
  warningFill: '#8F5D00', // solid-badge fill; white text is 5.62:1 on it
  warningInk: '#F3C876', // 11.66:1 on bg
  warningInkDeep: '#F8DBA0', // 13.67:1 on bg

  // ── Error / failed / cancelled ───────────────────────────────────────────
  error: '#E15A5C', // 5.09:1 on bg
  errorTint: '#3A1416',
  errorHover: '#C94547',
  errorInk: '#F0A5A6', // 9.30:1 on bg
  errorInkDeep: '#F5BBBC', // 11.12:1 on bg

  // ── Info / completed / refunded ──────────────────────────────────────────
  info: '#9691D4', // 6.38:1 on bg
  infoTint: '#242058',

  // ── Fixed values ────────────────────────────────────────────────────────
  white: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.55)', // sheet backdrop — darker than light's, since a
  // warm dark overlay reads as a lighter smudge rather than a dim, on top of an
  // already-dark screen
};

const colors = {
  light: palette,
  dark: darkPalette,
  radius: 16,
};

export type Palette = typeof palette;
export default colors;
