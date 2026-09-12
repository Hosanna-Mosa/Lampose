import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';

export type DockedCartBarProps = {
  count: number;
  total: number;
  /** "Lunch · Block C · Room 214" — the window and the target, always both. */
  context: string;
  label?: string;
  onPress: () => void;
  /** Reports its own height so the screen above can clear it. */
  onMeasure?: (height: number) => void;
  bottomInset?: number;
};

/**
 * Animated DockedCartBar with spring slide-in, count pulse and haptics.
 */
export function DockedCartBar({
  count,
  total,
  context,
  label = 'View cart',
  onPress,
  onMeasure,
  bottomInset,
}: DockedCartBarProps) {
  const { colors, space, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withSequence(
      withSpring(1.2, { damping: 8, stiffness: 320 }),
      withSpring(1.0, { damping: 12, stiffness: 220 })
    );
  }, [count, total, pulseScale]);

  const animatedBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const measure = (event: LayoutChangeEvent) => onMeasure?.(event.nativeEvent.layout.height);

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    onPress();
  };

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(16)}
      exiting={SlideOutDown.duration(200)}
      onLayout={measure}
      style={{
        paddingHorizontal: layout.gutter,
        paddingBottom: (bottomInset ?? insets.bottom) + space[2],
      }}
    >
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${count} ${count === 1 ? 'item' : 'items'}, ${formatRupees(total)}. ${context}`}
        style={({ pressed }) => [
          styles.bar,
          {
            backgroundColor: pressed ? colors.graphiteRaised : colors.graphite,
            borderRadius: radius.button + 2,
            paddingLeft: space[4],
            paddingRight: space[3],
            paddingVertical: space[3],
            gap: space[3],
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 8,
          },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Animated.View style={animatedBadgeStyle}>
            <Text variant="priceMd" style={{ color: colors.onGraphite, fontWeight: '700' }}>
              {count} {count === 1 ? 'item' : 'items'} · {formatRupees(total)}
            </Text>
          </Animated.View>
          <Text variant="caption" style={{ color: colors.onGraphiteMuted, marginTop: 2 }} numberOfLines={1}>
            {context}
          </Text>
        </View>

        <View
          style={[
            styles.action,
            {
              backgroundColor: colors.onGraphite,
              borderRadius: radius.pill,
              paddingHorizontal: space[3] + 2,
            },
          ]}
        >
          <Text variant="title3" style={{ color: colors.graphite, fontWeight: '700', fontSize: 13 }}>
            {label}
          </Text>
          <Icon name="arrowRight" size={16} color={colors.graphite} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 58 },
  action: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
});

