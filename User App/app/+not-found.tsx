import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

export default function NotFoundScreen() {
  const { colors, space, radius, touch, layout } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View
        style={[
          styles.container,
          { backgroundColor: colors.bg, padding: layout.gutter, gap: space[4] },
        ]}
      >
        <View style={{ gap: space[2], alignItems: 'center' }}>
          <Text variant="title1">This page isn&apos;t here</Text>
          <Text variant="body" color="secondary" style={styles.centered}>
            The link may be old, or the listing may have been taken down.
          </Text>
        </View>

        <Link href="/" asChild>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: pressed ? colors.brandPressed : colors.brand,
                borderRadius: radius.button,
                minHeight: touch.primaryCta,
                paddingHorizontal: space[6],
              },
            ]}
          >
            {/* `onBrand`, not white. White on #22A355 is 2.8:1 — this is the
                only primary action on the screen and it was the one failing. */}
            <Text variant="bodyStrong" style={{ color: colors.onBrand }}>
              Go to home
            </Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
