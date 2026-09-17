/*
 * The app/notifications/index.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { backRowBase } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  stack: { gap: 2 },
  backRow: { ...backRowBase, marginBottom: -8 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  group: { marginBottom: 4 },
  groupLabel: { fontSize: 11, marginTop: 4, marginBottom: 4 },

  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 4,
    alignItems: 'flex-start',
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: { flex: 1 },
  title: { fontSize: 14, lineHeight: 18, marginBottom: 2 },
  rowBody: { fontSize: 13, lineHeight: 17 },
  rightCol: { alignItems: 'flex-end', flexShrink: 0 },
  time: { fontSize: 11 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 5 },
  empty: { minHeight: 300 },
});

