import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { useColors } from '@/hooks/useColors';

/**
 * The empty and error halves of the design system's four-state pattern
 * (loading · populated · empty · error). Both centre inside whatever container
 * they're given so the layout never shifts as data resolves.
 */

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

const styles = StyleSheet.create({
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
