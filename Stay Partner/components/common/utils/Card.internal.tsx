/* Private helpers and shared types from the old components/ui/Card.tsx.
 * §4: utils holds style helpers, formatters and colour maps. */
import { StyleSheet, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

export type Props = ViewProps & {
  /**
   * `elevated` — shadowed, floats off the background (dashboard, request cards).
   * `outlined` — hairline border, sits flat (list rows, detail panels).
   */
  variant?: 'elevated' | 'outlined';
  padded?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export const styles = StyleSheet.create({
  divider: {
    height: 1,
    width: '100%',
  },
});
