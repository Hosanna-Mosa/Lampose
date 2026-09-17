/*
 * The app/(tabs)/bookings.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { boldBody } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  stack: { gap: 12 },
  title: { marginBottom: 2 },
  filters: { marginBottom: 6 },
  /* Side by side, each half taking exactly half. The panels open in a modal
     over the page (`overlay`), so neither pushes the list down and the two
     never fight for the same space. */
  filterRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  filterCell: { flex: 1 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  identity: { flex: 1 },
  guest: { ...boldBody },
  meta: { fontSize: 13, marginTop: 1 },
  amount: { fontFamily: fonts.extrabold, fontSize: 15, lineHeight: 20 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { minHeight: 320, borderRadius: radius.card },
});

