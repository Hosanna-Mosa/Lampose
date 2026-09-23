/*
 * The app/(tabs)/menu.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { layout } from '@/constants/layout';
import { fonts } from '@/constants/typography';

export const styles = StyleSheet.create({
  stack: { gap: 4 },
  profileCard: {
    padding: 16,
    borderRadius: 16,
    marginVertical: 6,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  overline: {
    marginTop: 8,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: layout.touchMin,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  /*
   * The label takes whatever the row has left; the control keeps its size.
   *
   * React Native defaults a flex child to `flexShrink: 0`, unlike the web,
   * so a long label — a real property name plus ' · details' — measured at
   * its full natural width, overflowed the row and pushed the chevron out
   * past the card's right edge. `flex: 1` hands the label the remaining
   * width instead, so it wraps inside the card and the row grows to fit.
   */
  rowLabel: { flex: 1 },
  logout: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  logoutLabel: { fontFamily: fonts.semibold },
  deleteAccount: { alignItems: 'center', paddingVertical: 10, marginBottom: 8 },
  deleteAccountLabel: { fontFamily: fonts.semibold, textDecorationLine: 'underline' },
  note: {
    marginTop: 8,
  },
});

