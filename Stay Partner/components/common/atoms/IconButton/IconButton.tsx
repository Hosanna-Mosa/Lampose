import { Pressable } from 'react-native';
import { Icon } from '@/components/common/atoms/Icon';
import { type IconName } from '@/components/common/atoms/Icon';
import { styles } from '@/components/common/utils/Button.internal';

export function IconButton({
  name,
  onPress,
  color,
  size = 20,
  label,
  testID,
}: {
  name: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
  label: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}
