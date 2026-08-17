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
        <Text style={[styles.strongLabel, styles.label]} numberOfLines={1}>
          {label}
        </Text>
      ) : (
        <Text variant="caption" color="textSecondary" numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      )}
      <Text
        tabular
        style={[
          strong ? styles.strongValue : styles.value,
          styles.valueBox,
          valueColor ? { color: valueColor } : null,
        ]}
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
    /*
     * Baselines, not boxes.
     *
     * The label and the value are different sizes, so `center` aligned two
     * boxes rather than two lines of type — and once a value can wrap it was
     * worse still, dragging a one-line label down to the middle of a
     * three-line block. `baseline` sits the label on the value's FIRST line,
     * which is how a label/value table is meant to read at any length.
     */
    alignItems: 'baseline',
    gap: 10,
  },
  /*
   * The label holds its width; the value gives way.
   *
   * React Native defaults `flexShrink` to 0, so before this neither side
   * yielded and a long value simply ran off the right edge of the card — a
   * full postal address on the property screen was cut mid-word at the screen
   * boundary. The label is the wrong thing to sacrifice: it is already
   * `numberOfLines={1}`, so shrinking it truncates the only word that says
   * what the row IS.
   */
  label: { flexShrink: 0 },
  /*
   * `minWidth: 0` is what actually lets a flex child narrow below its own
   * content in React Native — `flexShrink` alone is ignored without it.
   *
   * Right-aligned so a wrapped value still forms a clean edge against the
   * card, rather than a ragged block floating mid-row.
   */
  valueBox: { flexShrink: 1, minWidth: 0, textAlign: 'right' },
  gap: { marginBottom: 10 },
  value: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18 },
  strongLabel: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  strongValue: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 21 },
});
