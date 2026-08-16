/**
 * LAMPOSE Stay Partner — color tokens.
 *
 * Converted from the oklch values in `designs/LAMPOSE Stay Partner - Design System.dc.html`.
 * The design set is light-only, so `dark` intentionally mirrors `light`; when a dark
 * palette is designed, fill it in here and useColors() picks it up with no other changes.
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

const colors = {
  light: palette,
  dark: palette,
  radius: 16,
};

export type Palette = typeof palette;
export default colors;
