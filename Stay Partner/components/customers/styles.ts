/*
 * The app/customers.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { fonts } from '@/constants/typography';
import { backRowBase, boldBody } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  stack: { gap: 12 },
  backRow: { ...backRowBase, marginBottom: 2 },
  count: { marginTop: 2 },
  card: { padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  headText: { flex: 1, gap: 2 },
  name: { ...boldBody },
  stayRow: { flexDirection: 'row', gap: 20, borderTopWidth: 1, paddingTop: 10 },
  stayCol: { gap: 2 },
  address: { lineHeight: 17 },
  docList: { gap: 4 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  docSummary: { marginTop: 2 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 6,
    marginTop: 2,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingRight: 4 },
});

