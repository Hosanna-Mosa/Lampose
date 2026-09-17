import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/common/atoms/Text';
import { Icon } from '@/components/common/atoms/Icon';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/common/utils/Field.internal';

export function FieldError({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.errorRow}>
      <Icon name="alert-circle" size={13} color={c.error} strokeWidth={2.5} />
      <Text variant="badge" color="error" style={styles.errorText}>
        {children}
      </Text>
    </View>
  );
}

/**
 * The bordered box, plus a focus ring drawn as a transparent-by-default outer
 * border so gaining focus never shifts layout.
 */
