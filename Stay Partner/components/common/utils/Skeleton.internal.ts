/* Private helpers and shared types from the old components/ui/Skeleton.tsx.
 * §4: utils holds style helpers, formatters and colour maps. */
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rule: {
    height: 1,
    marginVertical: 4,
  },
});
