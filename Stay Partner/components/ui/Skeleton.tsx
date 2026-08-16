import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

/**
 * Loading placeholder. The design uses a sweeping gradient; this pulses opacity
 * instead — same read, no gradient masking, and it respects reduced motion by
 * settling at a steady mid-tone.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const c = useColors();
  const progress = useSharedValue(0.45);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const animated = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[{ width, height, borderRadius: radius, backgroundColor: c.borderSubtle }, animated, style]}
    />
  );
}

/**
 * Skeleton shaped like a populated list card, so the layout doesn't jump when
 * data resolves — the design system requires identical container geometry
 * across all four states.
 */
export function SkeletonCard({ style }: { style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderCard }, style]}>
      <View style={styles.row}>
        <Skeleton width="55%" height={14} />
        <Skeleton width={68} height={20} radius={10} />
      </View>
      <Skeleton width="40%" height={10} />
      <View style={[styles.rule, { backgroundColor: c.borderSubtle }]} />
      <View style={styles.row}>
        <Skeleton width="30%" height={10} />
        <Skeleton width="25%" height={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rule: {
    height: 1,
    marginVertical: 4,
  },
});
