import { View, type ViewStyle } from 'react-native';
import { Text } from '@/components/common/atoms/Text';
import { Button } from '@/components/common/atoms/Button';
import { Icon } from '@/components/common/atoms/Icon';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/common/utils/StateViews.internal';

export function ErrorState({
  title = "Couldn't load this",
  body = 'Check your connection and try again.',
  onRetry,
  style,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}) {
  const c = useColors();
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.circle, { backgroundColor: c.errorTint }]}>
        <Icon name="alert-circle" size={22} color={c.error} />
      </View>
      <Text variant="cardTitle" center>
        {title}
      </Text>
      <Text variant="caption" color="textSecondary" center style={styles.body}>
        {body}
      </Text>
      {onRetry ? (
        <Button label="Retry" onPress={onRetry} size="sm" fullWidth={false} style={styles.action} />
      ) : null}
    </View>
  );
}
