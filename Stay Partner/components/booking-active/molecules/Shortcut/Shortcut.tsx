import { Tappable } from '@/components/common';
import { Text, Icon, type IconName,  } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/booking-active/styles';

export function Shortcut({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.shortcut,
        {
          borderColor: c.borderCard,
          backgroundColor: c.surface,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Icon name={icon} size={18} color={c.textPrimary} />
      <Text variant="badge" style={styles.shortcutLabel}>
        {label}
      </Text>
    </Tappable>
  );
}
