/* Private helpers and shared types from the old components/ui/Button.tsx.
 * §4: utils holds style helpers, formatters and colour maps. */
import { StyleSheet, type ViewStyle } from 'react-native';
import { type IconName } from '@/components/common/atoms/Icon';

export type Variant = 'primary' | 'secondary' | 'destructive' | 'dangerOutline' | 'success' | 'ghost';

export type Size = 'lg' | 'sm';

export type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and blocks presses. The label is yours to swap ("Verifying…"). */
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  textButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
