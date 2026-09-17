/*
 * The app/referrals/index.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { radius } from '@/constants/layout';
import { fonts, type } from '@/constants/typography';
import { backRowBase, boldLabel } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  stack: { gap: 18 },
  backRow: { ...backRowBase, marginBottom: -10 },
  subtitle: { lineHeight: 20, marginTop: -4 },

  hero: { borderRadius: radius.card, padding: 18, gap: 4 },
  heroValue: { ...type.metric, marginTop: 2 },
  heroRupees: { fontFamily: fonts.semibold, fontSize: 15 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10, marginBottom: 4 },
  trackFill: { height: '100%', borderRadius: 4 },
  heroButton: { marginTop: 8 },

  codeCard: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 12 },
  code: { letterSpacing: 1, marginTop: 2 },

  howRow: { gap: 12 },
  howStep: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  howNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  howText: { flex: 1, lineHeight: 19 },

  sectionTitle: { fontSize: 13, marginBottom: -6 },
  list: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowBody: { flex: 1, gap: 2 },
  rowName: { ...boldLabel },
  rowEnd: { alignItems: 'flex-end', gap: 4 },
  rowPoints: { fontSize: 11 },
});

