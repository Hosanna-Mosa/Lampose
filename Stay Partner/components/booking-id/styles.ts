/*
 * The app/booking/[id].tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { fonts } from '@/constants/typography';
import { backRowBase, boldBody, centred } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  loading: { ...centred },
  /* Large and tabular: read out loud, at a door, from arm's length. */
  pin: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 38, letterSpacing: 1.5, marginVertical: 4 },
  stack: { gap: 14 },
  backRow: { ...backRowBase, marginBottom: -6 },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...boldBody },
  guestBody: { flex: 1 },
  guestName: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  bookingId: { fontSize: 12, marginTop: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 2 },
  cancel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
});

