import { Pressable, View, type ViewStyle } from 'react-native';
import { layout, radius, shadow } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';
import { Props } from '@/components/common/utils/Card.internal';

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
