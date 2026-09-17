/*
 * The app/booking/active.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { backRowBase, boldBody, centred } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { ...centred },
  backRow: { ...backRowBase, marginBottom: 6 },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...boldBody },
  guestName: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  roomType: { fontSize: 12, marginTop: 1 },
  badge: { marginBottom: 20 },

  progressCard: { borderRadius: radius.card, padding: 16, marginBottom: 16, gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 3 },
  checkoutLine: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17 },

  shortcuts: { flexDirection: 'row', gap: 10 },
  shortcut: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.chip,
    padding: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  shortcutLabel: { fontSize: 12 },
  spacer: { flex: 1 },
});

