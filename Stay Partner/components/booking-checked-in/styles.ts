/*
 * The app/booking/checked-in.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { backRowBase, centred } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  stack: { gap: 14 },
  loading: { ...centred },
  backRow: { ...backRowBase, marginBottom: -6 },
  hero: { borderRadius: radius.card, padding: 18, alignItems: 'center', gap: 8 },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 24, textAlign: 'center' },
  heroBody: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18.5, textAlign: 'center' },
  steps: { gap: 10, marginTop: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontFamily: fonts.bold, fontSize: 11 },
  stepText: { flex: 1, lineHeight: 19 },
  note: { lineHeight: 18, marginTop: 12 },
});

