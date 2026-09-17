/* Private helpers and shared types from the old components/ui/Chip.tsx.
 * §4: utils holds style helpers, formatters and colour maps. */
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  target: {
    minHeight: 44,
    justifyContent: 'center',
  },
  pill: {
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
  },
});
