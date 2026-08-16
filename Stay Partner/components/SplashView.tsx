import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/ui';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Splash — loading state only, no interaction.
 *
 * Rendered by the root layout while the app boots rather than as a route, so it
 * can't be navigated to or backed into. The native splash in app.json uses the
 * same accent background, so the handoff to this view is seamless.
 *
 * The mark is the real lampose.com logo (pulled from the site's own JS
 * bundle, not redrawn) — the flat square wordmark it actually uses in its UI,
 * cropped to the wordmark itself. Its solid fill is the exact same green as
 * `accent`, so the image's own background reads as part of the screen rather
 * than a pasted sticker. The old placeholder square + separate "LAMPOSE" text
 * are gone — the image already carries the wordmark.
 */
export function SplashView() {
  const c = useColors();
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 800, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <View
      style={[styles.root, { backgroundColor: c.accent }]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading LAMPOSE Stay Partner"
    >
      <StatusBar style="light" />

      <Image
        source={require('@/assets/images/lampose-logo.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />

      <Text style={[styles.tagline, { color: c.brandYellow }]}>Stay Partner</Text>

      <Animated.View
        style={[
          styles.spinner,
          { borderColor: 'rgba(254, 253, 252, 0.3)', borderTopColor: c.surface },
          spin,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  logo: {
    width: 250,
    height: 81, // 557:180 source ratio
  },
  tagline: {
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.54, // .14em
    textTransform: 'uppercase',
  },
  spinner: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    marginTop: 8,
  },
});
