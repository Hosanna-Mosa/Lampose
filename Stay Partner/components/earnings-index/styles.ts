/*
 * The app/earnings/index.tsx stylesheet, shared by the screen and the components
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
  heldRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stack: { gap: 14 },
  backRow: { ...backRowBase, marginBottom: -8 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  statRow: { flexDirection: 'row', gap: 10 },
  statTile: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 20 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 4 },
  amount: { fontFamily: fonts.extrabold, fontSize: 30, marginTop: 2 },
  hint: { marginBottom: 6 },
  requestButton: { marginTop: 8 },
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginTop: 8,
  },
  flex: { flex: 1 },
  message: { marginTop: 6 },
  historyTitle: { marginTop: 6 },
  payoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14,
  },
  failureReason: { marginTop: 2 },
  empty: { minHeight: 180, borderRadius: radius.card },
});

