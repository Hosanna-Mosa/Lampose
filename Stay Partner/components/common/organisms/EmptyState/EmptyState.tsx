import { View, type ViewStyle } from 'react-native';
import { Text } from '@/components/common/atoms/Text';
import { Button } from '@/components/common/atoms/Button';
import { Icon } from '@/components/common/atoms/Icon';
import { type IconName } from '@/components/common/atoms/Icon';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/common/utils/StateViews.internal';

export function EmptyState({
  icon = 'calendar',
  title,
  body,
  actionLabel,
  onAction,
  style,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}) {
  const c = useColors();
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.circle, { backgroundColor: c.accentTint }]}>
        <Icon name={icon} size={22} color={c.accent} />
      </View>
      <Text variant="cardTitle" center>
        {title}
      </Text>
      {body ? (
        <Text variant="caption" color="textSecondary" center style={styles.body}>
          {body}
        </Text>
      ) : null}
      {actionLabel ? (
        <Button label={actionLabel} onPress={onAction} size="sm" fullWidth={false} style={styles.action} />
      ) : null}
    </View>
  );
}
