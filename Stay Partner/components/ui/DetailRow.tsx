import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { fonts } from '@/constants/typography';

/**
 * Label/value pair inside a detail card — stay details, payout summaries,
 * ticket metadata. The value is always the heavier of the two, so a column of
 * these reads as a table without needing rules between rows.
 */
export function DetailRow({
  label,
  value,
  /** Emphasised row — totals and payouts. */
  strong = false,
  last = false,
  valueColor,
  style,
}: {
  label: string;
  value: string;
  strong?: boolean;
  last?: boolean;
  valueColor?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.row, last ? null : styles.gap, style]}>
      {strong ? (
        <Text style={styles.strongLabel} numberOfLines={1}>
          {label}
        </Text>
      ) : (
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {label}
        </Text>
      )}
      <Text
        tabular
        style={[strong ? styles.strongValue : styles.value, valueColor ? { color: valueColor } : null]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  gap: { marginBottom: 10 },
  value: { fontFamily: fonts.bold, fontSize: 13.5, lineHeight: 18 },
  strongLabel: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  strongValue: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 21 },
});
