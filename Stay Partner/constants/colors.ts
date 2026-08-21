/**
 * LAMPOSE Stay Partner — color tokens.
 *
 * Aligned 20 Aug 2026 to the "Dock" palette the customer app runs on, so an
 * owner and a student are looking at one product rather than two that happen to
 * share a name. The supplied roles, verbatim:
 *
 *   GROUND  #EFEDE9   SURFACE #FFFFFF   INK     #1A1917
 *   ACCENT  #0E6E5C   CONFIRM #0E6E5C   CAUTION #A85A1E
 *
 * ## What this replaced, and what carried over
 *
 * The old palette was already warm — hue-75 neutrals, a sampled brand green —
 * so this is a re-tuning rather than a change of temperature. Three things did
 * change in kind:
 *
 *   · The green moved from the logo mark's very dark #14492F to Dock's ACCENT.
 *     The old value was so dark it read as near-black at button size; #0E6E5C
 *     is a teal that still carries white at 6.25:1 but is visibly a colour.
 *   · The amber family became CAUTION #A85A1E. That fixed something the old
 *     file had already had to patch around: `warningFill` existed only because
 *     white on the amber measured 4.38:1 and needed a separate darker value.
 *     White on CAUTION is 5.10:1, so the two are one colour again.
 *   · `info` stopped being violet. Dock deliberately has no second saturated
 *     hue — a completed or refunded booking is a NOTE, and rendering it in its
 *     own colour dressed up bookkeeping as an event.
 *
 * Every token name is unchanged, so no call site moved.
 *
 * ## ACCENT and CONFIRM are the same hex, on purpose
 *
 * That is the reference's own definition — in this product "confirmed" IS the
 * good outcome — and it is only survivable because of the standing rule the
 * customer app also runs on: status is never carried by colour alone. Every
 * badge here ships a glyph and a word, so a solid accent button and a green
 * "Paid" pill are told apart by shape and content rather than hue.
 *
 * ## The constraint that shapes the dark palette
 *
 * `Button` draws `c.white` on `accent`, `success` and `error`. So all three
 * must stay dark enough to carry white IN BOTH MODES, which is why the dark
 * fills below are deeper than a dark theme would otherwise pick. The previous
 * dark palette did not hold that line — white on its `success` #4CBA76 measured
 * 2.45:1 and on its `error` #E15A5C 3.63:1, both failing on a button label.
 * Every fill here clears 4.5:1 for white.
 *
 * Ratios in the comments are measured (relative luminance), not estimated.
 */

const palette = {
  // ── Neutrals (Dock's warm ramp) ─────────────────────────────────────────
  surface: '#FFFFFF', // cards, sheets, headers — SURFACE
  bg: '#EFEDE9', // app background — GROUND
  surfaceSunken: '#E5E2DB', // disabled fields, segmented track
  borderSubtle: '#EDEAE4', // dividers
  borderCard: '#E2DED6', // card outlines
  /* Input borders, and the one border that is not decorative. WCAG 1.4.11 asks
     3:1 for the boundary of a control, and an empty field's edge is its whole
     affordance — 3.5:1 on the white fill, 3.0:1 on the ground behind it. The
     two above are hairlines around cards and are deliberately far fainter. */
  border: '#8F897C',

  textDisabled: '#A9A398',
  textTertiary: '#837D72', // timestamps, placeholders — 3.6:1 on bg, tertiary role
  textCaption: '#66625A', // helper copy — 5.3:1 on bg, 6.2:1 on a card
  textSecondary: '#55524C', // descriptions — 6.7:1 on bg, 7.8:1 on a card
  textBody: '#3B3833', // review/message body — 10.0:1 on bg
  textPrimary: '#1A1917', // headings, values — INK, 15.1:1 on bg

  // ── Accent (Dock ACCENT) ────────────────────────────────────────────────
  accent: '#0E6E5C', // 6.25:1 for white on it
  accentHover: '#0A5748', // pressed — darker, so a white label only gets safer
  accentTint: '#E3F0EB', // focus ring, selected range
  accentTintAlt: '#F1F7F4', // placeholder hatching
  accentInk: '#0E6E5C', // text on accentTint — 5.3:1
  accentInkDeep: '#0B5245', // large figures on accentTint — 7.8:1
  accentMuted: '#2E7566', // secondary text on accentTint — 4.7:1
  /* Kept. It is pixel-sampled from the logo's own "o" and is the one mark that
     is identity rather than palette. Splash tagline only — 4.7:1 on ACCENT,
     which is a large-text role. It must never carry small text. */
  brandYellow: '#FFDE59',

  // ── Success / paid / confirmed (Dock CONFIRM — same hex as ACCENT) ──────
  success: '#0E6E5C', // fills, icons, bars — 6.25:1 for white on it
  successTint: '#E3F0EB',
  successOnTint: '#0B5245', // 7.8:1 on the tint
  successInk: '#0B5245',
  successInkDeep: '#084237',

  // ── Warning / pending / in review (Dock CAUTION) ────────────────────────
  warning: '#A85A1E', // stars, icons, bars
  warningTint: '#FBEEE2',
  warningOnTint: '#7A3D0F', // 7.4:1 on the tint
  /* Now the same value as `warning`. It existed only because the old amber
     could not carry white (4.38:1); CAUTION does, at 5.10:1. */
  warningFill: '#A85A1E',
  warningInk: '#7A3D0F',
  warningInkDeep: '#63310C',

  // ── Error / failed / cancelled ──────────────────────────────────────────
  /* Dock has no danger role and this app cannot do without one — a failed
     payout and a cancelled booking must not render in the accent. Warm red,
     chosen to sit in the same desaturated register as CAUTION. 6.6:1 both ways. */
  error: '#B3261E',
  errorTint: '#FBEAE8',
  errorHover: '#8E1E17',
  errorInk: '#8C1D17', // 7.8:1 on the tint
  errorInkDeep: '#74170F',

  // ── Info / completed / refunded ─────────────────────────────────────────
  /* Neutral, not violet — see the note at the top. It reads as "a note", which
     is what a completed booking is. */
  info: '#55524C',
  infoTint: '#E9E6E0',

  // ── Fixed values ────────────────────────────────────────────────────────
  white: '#FFFFFF',
  scrim: 'rgba(26, 25, 23, 0.45)', // sheet backdrop — INK at 45%
};

/**
 * Dark palette.
 *
 * Derived, not supplied — Dock is light-only. The rule followed: keep the
 * relationships, invert the ground, and keep it WARM. A neutral-grey dark mode
 * under a bone-and-teal light mode reads as a different app.
 *
 * `surfaceSunken` stays a step LIGHTER than `surface` here, opposite to the
 * light palette. That is this app's own convention and its segmented track and
 * disabled fields depend on it: on a dark ground a well has to be lifted to be
 * seen, because there is nothing darker left to sink into.
 */
const darkPalette = {
  // ── Neutrals (same warm family, ramp inverted) ──────────────────────────
  surface: '#1C1B19', // cards, sheets, headers
  bg: '#131211', // app background
  surfaceSunken: '#252320', // disabled fields, segmented track — see above
  borderSubtle: '#232220',
  borderCard: '#302E2A',
  border: '#736E64', // input borders — 3.4:1 on the dark surface

  textDisabled: '#6B6559',
  textTertiary: '#8A8479', // 4.6:1 on bg
  textCaption: '#948F87', // 5.6:1 on bg
  textSecondary: '#BFBAB1', // 9.5:1 on bg
  textBody: '#DAD5CC', // 12.5:1 on bg
  textPrimary: '#F2F0EC', // 16.2:1 on bg

  // ── Accent ──────────────────────────────────────────────────────────────
  /* One token does double duty — the primary button fill, with white on top,
     and ghost-button/link text on the ground. No single value clears 4.5:1 both
     ways on a dark background, so this is tuned for the FILL role, where a
     failing label is unreadable rather than merely quiet: white on it is 4.9:1.
     As text on the ground it lands at 3.8:1, short of body-text AA but past the
     3:1 bar every actual use here — buttons, link labels — qualifies for.
     `accentInk` below is the value to use for accent-coloured PROSE. */
  accent: '#18806A',
  accentHover: '#126957', // pressed — darker; white on it is 6.7:1
  accentTint: '#0F2721',
  accentTintAlt: '#16211E',
  accentInk: '#5FC9AF', // text on accentTint — 8.6:1
  accentInkDeep: '#8FD6C3', // large figures on accentTint — 10.6:1
  accentMuted: '#7FBEAC', // secondary text on accentTint — 7.4:1
  brandYellow: '#FFDE59', // unchanged — a bright yellow reads fine on dark too

  // ── Success / paid / confirmed ──────────────────────────────────────────
  /* Same hex as `accent`, exactly as in light mode. It also repairs a real
     failure: the previous dark `success` could not carry the white label
     `Button` puts on it. */
  success: '#18806A',
  successTint: '#0F2721',
  successOnTint: '#7FD3BE', // 8.9:1 on successTint
  successInk: '#7FD3BE',
  successInkDeep: '#A8E3D3',

  // ── Warning / pending / in review ───────────────────────────────────────
  warning: '#E0954A', // 7.1:1 on bg — icons and bars, never a white label
  warningTint: '#2C1E0E',
  warningOnTint: '#EEBC85', // 7.9:1 on warningTint
  /* Split from `warning` here, unlike light mode: the lightened amber above is
     right for a glyph on the ground and cannot carry white. This one does, at
     4.8:1. */
  warningFill: '#8A5A22',
  warningInk: '#EEBC85',
  warningInkDeep: '#F5D3AC',

  // ── Error / failed / cancelled ──────────────────────────────────────────
  /* Deeper than a dark theme would instinctively pick, for the reason in the
     header note: `Button` draws a white label on this. White is 5.4:1 here
     against 3.6:1 on the brighter red this replaced. */
  error: '#C0392F',
  errorTint: '#2C1513',
  errorHover: '#9E2C24',
  errorInk: '#F5A49E', // 9.0:1 on bg — the value for error PROSE
  errorInkDeep: '#F8C0BC',

  // ── Info / completed / refunded ─────────────────────────────────────────
  info: '#BFBAB1',
  infoTint: '#252320',

  // ── Fixed values ────────────────────────────────────────────────────────
  white: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.62)', // sheet backdrop — a warm overlay on an already
  // dark screen reads as a lighter smudge rather than a dim, so this is neutral
};

const colors = {
  light: palette,
  dark: darkPalette,
  radius: 16,
};

export type Palette = typeof palette;
export default colors;
