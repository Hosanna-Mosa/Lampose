/*
 * The app/inventory/pricing.tsx stylesheet, shared by the screen and the components
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
  stack: { gap: 16 },
  backRow: { ...backRowBase, marginBottom: -8 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  baseCard: {
    borderRadius: radius.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  baseBody: { flex: 1, gap: 4 },
  baseAmountRow: { flexDirection: 'row', alignItems: 'baseline' },
  baseAmount: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 30 },
  perNight: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  baseEdit: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: -6,
  },
  ruleRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ruleBody: { flex: 1, paddingVertical: 6 },
  ruleName: { ...boldLabel },
  rulePeriod: { fontSize: 12, marginTop: 3 },
  ruleAmount: { fontFamily: fonts.extrabold, fontSize: 15, lineHeight: 20 },
  empty: { minHeight: 220 },
});

