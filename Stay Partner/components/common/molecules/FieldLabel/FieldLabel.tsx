import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/common/atoms/Text';
import { styles } from '@/components/common/utils/Field.internal';

export function FieldLabel({
  children,
  optional,
  muted,
}: {
  children: ReactNode;
  optional?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.labelRow}>
      <Text variant="label" color={muted ? 'textTertiary' : 'textPrimary'}>
        {children}
      </Text>
      {optional ? (
        <Text variant="badge" color="textTertiary">
          Optional
        </Text>
      ) : null}
    </View>
  );
}
