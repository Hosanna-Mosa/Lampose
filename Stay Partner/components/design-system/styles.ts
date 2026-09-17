/*
 * The app/design-system.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { layout, radius } from '@/constants/layout';

export const styles = StyleSheet.create({
  section: { marginBottom: layout.sectionGap },
  sectionTitle: { marginBottom: 12 },
  note: { marginBottom: 12 },
  stack: { gap: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  flex: { flex: 1 },
  rule: { marginVertical: 10 },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  typeSample: { flex: 1 },
  demoCard: { gap: 4, marginBottom: 12 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stateBox: { height: 200, padding: 0 },
  swatch: { width: 76, gap: 4 },
  chipColor: { height: 44, borderRadius: radius.chip, borderWidth: 1 },
  swatchLabel: { fontSize: 10 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconCell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

