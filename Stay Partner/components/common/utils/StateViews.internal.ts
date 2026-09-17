/* Private helpers and shared types from the old components/ui/StateViews.tsx.
 * §4: utils holds style helpers, formatters and colour maps. */
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    maxWidth: 260,
  },
  action: {
    marginTop: 4,
  },
});
