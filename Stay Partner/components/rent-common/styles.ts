/*
 * The stylesheet every Rent screen shares. Card, row and back-row shapes are
 * the ones the Earnings and Customers screens already use, so the new screens
 * sit beside them without a new look.
 */
import { StyleSheet } from 'react-native';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { backRowBase } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  stack: { gap: 14 },
  backRow: { ...backRowBase, marginBottom: -8 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  amount: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 38, marginTop: 2 },
  rowAmount: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 21 },
  statRow: { flexDirection: 'row', gap: 10 },
  statTile: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 26 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  sectionTitle: { marginTop: 6 },
  empty: { minHeight: 180, borderRadius: radius.card },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  search: { marginBottom: 2 },
  message: { marginTop: 6 },
  footer: { gap: 8 },
});
