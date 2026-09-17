/*
 * The app/support/index.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { radius } from '@/constants/layout';
import { backRowBase } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  stack: { gap: 12 },
  backRow: { ...backRowBase, marginBottom: -8 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  filters: { marginBottom: 4 },

  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  subject: { flex: 1, fontSize: 14, lineHeight: 19 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 5, flexShrink: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaText: { fontSize: 12 },
  empty: { minHeight: 260, borderRadius: radius.card },
});

