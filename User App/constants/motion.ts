/**
 * LAMPOSE motion system — Batch 0, post Batch 12 audit.
 *
 * Every animation here survived the question the audit asked of all nineteen:
 * what does a user learn from this that they would not learn from an instant
 * state change? Three did not survive and are listed in `cut` so nobody
 * re-adds them from the earlier batch documents, which still show them.
 *
 * Two more were correct in intent but wrong as specified and are rewritten
 * here — both for the same underlying reason: React Native cannot interpolate
 * a text property off the UI thread.
 */

import { Easing } from 'react-native-reanimated';

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

export const duration = {
  instant: 120,
  quick: 160,
  standard: 240,
  deliberate: 320,
  /** Map camera glides only. The single sanctioned exception to the 320 cap. */
  camera: 400,
} as const;

export const easing = {
  /** Colour, opacity, anything symmetrical. */
  standard: Easing.bezier(0.3, 0, 0.2, 1),
  /** Things arriving — screens, sheets, content. Decelerates into place. */
  enter: Easing.bezier(0.2, 0, 0, 1),
  /** Things leaving or being pressed. Accelerates away, no settle. */
  exit: Easing.bezier(0.4, 0, 1, 1),
  /** Confirmations only. The single overshoot in the entire app. */
  settle: Easing.bezier(0.18, 0.89, 0.32, 1.05),
  /** The two ambient loops, and nothing else. */
  inOut: Easing.bezier(0.4, 0, 0.6, 1),
} as const;

/* ------------------------------------------------------------------ *
 * Signature motions
 * ------------------------------------------------------------------ */

export const signature = {
  screenPush: { duration: 280, easing: easing.enter, reducedDuration: 160 },
  sheetEntry: { duration: 300, easing: easing.enter, scrimOpacity: 0.4 },
  /** Stagger is capped at the on-screen row count, never the data length. */
  skeletonReveal: { duration: 200, easing: easing.enter, stagger: 40 },
  cardPress: { duration: 120, release: 160, scale: 0.975, reducedOpacity: 0.9 },
  successConfirm: { duration: 240, easing: easing.settle, overshoot: 1.06 },
  /** Fires once when a timer crosses a tier. Never repeats. */
  timerTierShift: { duration: 240, easing: easing.standard, overshoot: 1.05 },
} as const;

/**
 * The only two infinite animations in the app. A third is a bug.
 *
 * `criticalBreath` is a warning rather than ambience — it exists to be
 * noticed, and only runs under sixty seconds remaining.
 */
export const ambient = {
  waitingHalo: { duration: 2400, easing: easing.inOut, opacity: [0.35, 0.6], scale: [1, 1.06] },
  criticalBreath: { duration: 1000, easing: easing.inOut, scale: [1, 1.035] },
} as const;

/**
 * Scroll-linked values. All of these run through `useAnimatedScrollHandler`
 * on the UI thread — if any threshold touches `setState` it will tear on the
 * hardware this app targets.
 *
 * These are legibility, not decoration, so reduced motion does not disable
 * them. A transparent header over a photo is unreadable whether or not the
 * user asked for less movement.
 */
export const scrollLinked = {
  headerSolidify: { input: [180, 240] },
  headerTitle: { input: [210, 250] },
  /** The 20pt overlap guarantees a search affordance exists in every frame. */
  heroToCompact: { heroOut: [0, 78], compactIn: [58, 96] },
  tabsPinShadow: { input: [96, 120] },
} as const;

/* ------------------------------------------------------------------ *
 * Component motions
 * ------------------------------------------------------------------ */

export const component = {
  /**
   * Price flying from a card into the detail screen.
   *
   * Originally specified as a fontSize interpolation, which re-typesets the
   * text on every frame. Instead: hide both real nodes, fly a scaled clone,
   * restore at rest. Pure transform, and both endpoints keep true typesetting.
   */
  sharedPrice: { duration: 300, easing: easing.enter, scale: [1, 1.27] },
  /**
   * Active tab label.
   *
   * fontWeight cannot be interpolated in React Native — it snaps, so a
   * crossfade pops mid-way. Two overlaid Text nodes at 400 and 600 with
   * opposing opacity instead.
   */
  tabLabelWeight: { duration: 160, easing: easing.standard },
  /**
   * The one sanctioned layout animation: 7pt of width on a single element.
   * It carries progress, so it keeps running under reduced motion.
   */
  tabDot: { duration: 240, easing: easing.standard, width: [7, 22] },
  /**
   * A money figure changing. Deliberately overlapped so the screen is never
   * without the number — tabular digits hold the width steady through it.
   */
  numberSwap: { outDuration: 100, inDuration: 140, inDelay: 70, translate: 3 },
  /** Connectors are fixed-width and scaled. Never an animated width. */
  timelineAdvance: { connector: 240, nodeDelay: 200, total: 320 },
  /** Shows the code arrived from outside rather than being typed. */
  otpAutofill: { duration: 240, stagger: 40, easing: easing.settle },
  pinSelect: { duration: 220, cardDuration: 240, cameraDuration: 200, scale: [1, 1.18] },
  listItemEntry: { duration: 240, stagger: 45, translateY: 16 },
} as const;

/* ------------------------------------------------------------------ *
 * Cuts and rules
 * ------------------------------------------------------------------ */

/**
 * Cut by the Batch 12 audit. The earlier batch documents still show these —
 * they are not to be built.
 */
export const cut = [
  {
    name: 'splashDotTravel',
    reason:
      'Explains nothing — the user is waiting for a token check, not learning where a square belongs — and delays first content by 280ms on the slowest hardware.',
  },
  {
    name: 'onboardingParallax',
    reason: 'Decoration. The dots and the drag already communicate position.',
  },
  {
    name: 'skeletonShimmer',
    reason:
      'The skeleton shape already means "content is coming, and this is its layout". A continuous loop on a scrolling list is the top jank source on mid-range Android.',
  },
] as const;

/**
 * Reduced motion is a defined state, not "disable everything".
 *
 * Movement is removed. Legibility motion — the header solidifying over a
 * photo, a timer changing colour, the tab dot carrying progress — still runs,
 * because removing it would remove information rather than movement.
 */
export const reducedMotion = {
  maxDuration: 200,
  allowed: ['opacity', 'color'],
  banned: ['translate', 'scale', 'loop', 'stagger'],
} as const;

/** Enforce these in review. */
export const motionRules = [
  'Transform and opacity only. No animated width, height, margin, fontSize, shadow or blur.',
  'Nothing exceeds 320ms except a camera glide (400ms) and the two ambient loops.',
  'Exactly two infinite animations exist: the waiting halo and the critical timer breath.',
  'Every scroll-linked value runs on the UI thread via useAnimatedScrollHandler.',
  'Reduced motion removes movement, never legibility.',
  'No animation may gate an interaction — a user can always tap through it.',
] as const;
