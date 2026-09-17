/* Private helpers and shared types from the old components/ui/Field.tsx.
 * §4: utils holds style helpers, formatters and colour maps. */
import { StyleSheet } from 'react-native';
import { radius } from '@/constants/layout';

export const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ring: {
    borderWidth: 3,
    borderRadius: radius.control + 3,
  },
  box: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: 16,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  errorText: {
    flex: 1,
  },
});
