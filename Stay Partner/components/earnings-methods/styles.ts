/*
 * The app/earnings/methods.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { backRowBase } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  stack: { gap: 14 },
  backRow: { ...backRowBase, marginBottom: -8 },
  title: { marginBottom: 2 },
  row: {
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  bank: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  number: { fontSize: 12, marginTop: 2 },
  defaultBadge: { paddingHorizontal: 9, paddingVertical: 4 },
  empty: { minHeight: 260 },
});

