import { Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { layout, radius, shadow } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

type Props = ViewProps & {
  /**
   * `elevated` — shadowed, floats off the background (dashboard, request cards).
   * `outlined` — hairline border, sits flat (list rows, detail panels).
   */
  variant?: 'elevated' | 'outlined';
  padded?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
};

export function Card({ variant = 'outlined', padded = true, onPress, style, children, ...rest }: Props) {
  const c = useColors();

  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.card,
    padding: padded ? layout.cardPadding : 0,
    ...(variant === 'outlined'
      ? { borderWidth: 1, borderColor: c.borderCard }
      : shadow.card),
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [base, { opacity: pressed ? 0.7 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View {...rest} style={[base, style]}>
      {children}
    </View>
  );
}

/** Hairline rule used inside cards and between list rows. */
export function Divider({ style }: { style?: ViewStyle }) {
  const c = useColors();
  return <View style={[styles.divider, { backgroundColor: c.borderSubtle }, style]} />;
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    width: '100%',
  },
});
