/*
 * The app/(tabs)/index.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { radius } from '@/constants/layout';
import { type } from '@/constants/typography';
import colors from '@/constants/colors';

export const styles = StyleSheet.create({
  stack: { gap: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  /*
   * The controls never give up width — the pill beside them does.
   *
   * `flexShrink: 0` is React Native's default, so this is written down rather
   * than relied on: it is the half of the arrangement that must not change.
   * A 36pt bell and a switch have no way to degrade gracefully; the pill's
   * label truncates to an ellipsis instead. See the note on `pill` in
   * `components/ui/HeaderPill.tsx`.
   */
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 5,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  hero: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  /* Shared by both stacked copies (green + white) so a wipe mid-flight lines
     their text up exactly — any padding difference between the two would
     show up as a jump the instant the wipe boundary crosses it. */
  heroLayer: {
    padding: 20,
    paddingVertical: 22,
  },
  /* Fully inside the card's own bounds — deliberately not bleeding past the
     edge the way the original design called for. `overflow: hidden` +
     `borderRadius` on the card not reliably clipping an absolutely
     positioned child at the rounded corner is a known Android quirk, and
     the earlier negative offsets sat it exactly there; positive offsets
     keep it clear of that corner without depending on the clip at all. */
  heroGlyph: {
    position: 'absolute',
    right: 10,
    bottom: 6,
  },
  /*
   * The hero sits on the accent gradient, so its type is white rather than an
   * ink token — but white from the palette, not a literal. `#FFFFFF` typed into
   * a screen is the one that survives a theme change and turns invisible.
   *
   * The subtitle keeps an alpha it cannot get from a token; it is written
   * against `colors.white` so the two are visibly the same colour.
   */
  heroGreeting: {
    ...type.screenTitle,
    color: colors.light.white,
  },
  heroSubtitle: {
    ...type.caption,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 3,
    marginBottom: 16,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  heroDot: { width: 6, height: 6, borderRadius: 3 },
  heroChipText: {
    ...type.badge,
    color: colors.light.white,
  },

  halfRow: { flexDirection: 'row', gap: 10 },
  halfCard: { flex: 1, borderRadius: 14, gap: 4 },
  halfIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  halfValue: { fontSize: 22, lineHeight: 27, marginTop: 1 },
  halfCaption: { lineHeight: 15 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: { flex: 1 },
  bannerTitle: { fontSize: 15, marginBottom: 2 },
  urgencyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  skelCard: { borderRadius: radius.card, padding: 16, gap: 8 },

  emptyCard: { alignItems: 'center', gap: 10, padding: 24 },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBody: { lineHeight: 18 },

  errorBody: {
    flex: 1,
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retry: { marginTop: 6 },
});

