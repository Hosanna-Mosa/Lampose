import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useBottomBar } from '@/context/BottomBarContext';

/**
 * What is still in progress, floating gracefully docked above the tab bar or at the bottom edge.
 */

export type OngoingTone = 'waiting' | 'action';

export type OngoingItem = {
  /** Stable across renders — the booking or request id. */
  key: string;
  /** The property. What a student recognises the booking by. */
  title: string;
  /** The state, in the words of what to do next. Never a status code. */
  status: string;
  /**
   * `action` means the next move is the student's, and it wears the accent.
   * `waiting` means somebody else is holding it, and it stays quiet.
   */
  tone: OngoingTone;
};

export type OngoingStripProps = {
  items: readonly OngoingItem[];
  onPress: (item: OngoingItem) => void;
};

export function OngoingStrip({ items, onPress }: OngoingStripProps) {
  const { colors, space, radius, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const { reservedBottom } = usePendingRequest();
  const { hidden, height: barHeight } = useBottomBar();

  const effectiveBarHeight = barHeight > 0 ? barHeight : reservedBottom || 80;
  const bottomInset = Math.max(insets.bottom, 8);

  /*
   * When the bottom bar hides on scroll (hidden.value === 1), this strip slides down
   * to sit smoothly at the very bottom edge of the screen.
   * When the bottom bar is shown (hidden.value === 0), this strip sits right above the tab bar.
   */
  const animatedStyle = useAnimatedStyle(() => {
    const travelDistance = Math.max(0, effectiveBarHeight - bottomInset);
    return {
      transform: [
        {
          translateY: hidden.value * travelDistance,
        },
      ],
    };
  });

  if (!items.length) return null;

  const single = items.length === 1;

  const card = (item: OngoingItem) => {
    const acting = item.tone === 'action';
    return (
      <Pressable
        key={item.key}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.status}. Opens the booking.`}
        style={({ pressed }) => [
          styles.card,
          elevation.card,
          {
            transform: [{ scale: pressed ? 0.985 : 1 }],
            borderRadius: radius.card,
            padding: space[2],
            gap: space[3],
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: acting ? colors.brand : colors.border,
            width: single ? undefined : 268,
          },
        ]}
      >
        <View
          style={[
            styles.tile,
            {
              borderRadius: radius.button,
              backgroundColor: acting ? colors.brand : colors.surfaceSunken,
            },
          ]}
        >
          <Icon
            name={acting ? 'check' : 'clock'}
            size={20}
            color={acting ? colors.onBrand : colors.textSecondary}
          />
        </View>

        <View style={styles.body}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {item.title}
          </Text>
          <Text
            variant="caption"
            numberOfLines={1}
            style={{ color: acting ? colors.brandInk : colors.textSecondary }}
          >
            {item.status}
          </Text>
        </View>

        <Icon name="chevronRight" size={20} color={colors.textTertiary} />
      </Pressable>
    );
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.band,
        animatedStyle,
        {
          paddingBottom: effectiveBarHeight + space[2],
        },
      ]}
    >
      {single ? (
        <View style={{ paddingHorizontal: space[4] }}>{card(items[0])}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3] }}
        >
          {items.map(card)}
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
    backgroundColor: 'transparent',
  },
  card: { flexDirection: 'row', alignItems: 'center' },
  tile: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 1 },
});
