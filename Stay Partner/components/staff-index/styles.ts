/*
 * The app/staff/index.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { backRowBase, boldLabel } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  stack: { gap: 12 },
  backRow: { ...backRowBase, marginBottom: -6 },
  title: { marginBottom: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 14,
  },
  info: { flex: 1, gap: 3 },
  name: { ...boldLabel },
});

