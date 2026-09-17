import { Pressable } from 'react-native';
import { Text } from '@/components/common/atoms/Text';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/common/utils/Button.internal';

export function TextButton({
  label,
  onPress,
  color,
  disabled,
  testID,
}: {
  label: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
  testID?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.6 : disabled ? 0.5 : 1 }]}
    >
      <Text variant="link" style={{ color: color ?? c.accent }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Icon-only control. The designs draw several of these at 16px with no padding
 * (the pricing row's edit and delete); this always claims a 44px target.
 */
