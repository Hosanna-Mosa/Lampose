import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text } from '@/components/common/atoms/Text';
import { IconButton } from '@/components/common/atoms/IconButton';
import { layout } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/common/utils/Screen.internal';

export function TopHeader({
  title,
  showBack = false,
  onBack,
  right,
  bordered = true,
}: {
  title?: string;
  /** Shows the back chevron. Defaults to popping the stack unless `onBack` overrides it. */
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  bordered?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top,
          height: layout.headerHeight + insets.top,
          backgroundColor: c.surface,
          borderBottomWidth: bordered ? 1 : 0,
          borderBottomColor: c.borderSubtle,
        },
      ]}
    >
      <View style={styles.headerSide}>
        {showBack ? (
          <IconButton name="chevron-left" label="Go back" onPress={onBack ?? (() => router.back())} />
        ) : null}
      </View>
      {title ? (
        <Text variant="headerTitle" numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
      ) : (
        <View style={styles.headerTitle} />
      )}
      <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
    </View>
  );
}
