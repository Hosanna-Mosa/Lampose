import { Link, Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { useTheme } from '@/context/ThemeContext';

export default function NotFoundScreen() {
  const { colors, space, radius, touch, layout } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      {/*
        Back, but only when there is a back to offer.

        A 404 is reached two ways and they need different exits: from inside
        the app, where the previous screen is real and returning to it is the
        cheapest recovery; and from a cold deep link, where nothing is behind
        this and an arrow would be a dead control. "Go to home" below covers
        the second case and stays regardless.
      */}
      <StandardHeader
        title=""
        onBack={router.canGoBack() ? () => router.back() : undefined}
      />
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.bg,
            padding: layout.gutter,
            paddingBottom: insets.bottom + layout.gutter,
            gap: space[4],
          },
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
            {/* `onBrand`, not white. The token flips per mode — white on the light-mode
                accent, near-black on the lightened dark-mode one. */}
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
