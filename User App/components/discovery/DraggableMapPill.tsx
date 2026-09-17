import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Icon, Text } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

/**
 * The floating Map pill, and the finger that moves it.
 *
 * ## Why it moves at all
 *
 * It floats over a feed, which means that wherever it is parked it is on top
 * of a card — and on a short phone the card it covers is often the one being
 * read. Every other floating control in this app can be scrolled away from;
 * this one cannot, because it is pinned to the viewport. Letting it be
 * dragged is the cheapest answer: the person who is bothered by where it sits
 * moves it, and nobody else has to think about it.
 *
 * ## Drag and tap are one control, and they are told apart by distance
 *
 * `Gesture.Race` runs the pan and the tap against each other, and the pan is
 * held back by `minDistance` — under that threshold it never activates, so a
 * still finger is a tap and the map opens; past it the pan wins, the tap is
 * cancelled, and the pill follows the finger instead of opening anything.
 * Without the threshold every drag would end in a navigation.
 *
 * ## It cannot be dragged off the screen
 *
 * A control that can be lost is worse than one in the wrong place. Both the
 * pill and the area it floats in report their own size, and the travel is
 * clamped to what is left over — so the pill always keeps its whole self
 * inside, at any screen size, with no device list and no guesses. Until both
 * measurements have arrived the clamp is a no-op rather than a wrong bound.
 */

/** How far a finger travels before this is a drag and not a tap. */
const DRAG_THRESHOLD = 8;

/** Breathing room kept between the pill and the edges it is clamped to. */
const EDGE_PAD = 8;

export type DraggableMapPillProps = {
  onPress: () => void;
  /**
   * Where the pill rests before it is moved, measured up from the bottom of
   * the area it floats in. The caller owns this because it is the tab bar's
   * height plus a gap, and only the screen knows the bar.
   */
  bottomInset: number;
  label?: string;
};

export function DraggableMapPill({ onPress, bottomInset, label = 'Map' }: DraggableMapPillProps) {
  const { colors, radius, mode } = useTheme();
  const reduceMotion = useReduceMotion();

  /* Both measured, never assumed — see the note on clamping above. */
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [pill, setPill] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const lifted = useSharedValue(0);

  /* Resolved on the JS thread and captured by the worklets below: they are
     layout, not per-frame values, and `clamp` inside a worklet cannot reach
     an imported helper anyway. */
  const measured = area.width > 0 && pill.width > 0;
  const minDx = measured ? -(pill.x - EDGE_PAD) : 0;
  const maxDx = measured ? area.width - pill.x - pill.width - EDGE_PAD : 0;
  const minDy = measured ? -(pill.y - EDGE_PAD) : 0;
  const maxDy = measured ? area.height - pill.y - pill.height - EDGE_PAD : 0;

  const tapped = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onPress();
  };

  const grabbed = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  };

  const pan = Gesture.Pan()
    .minDistance(DRAG_THRESHOLD)
    .onStart(() => {
      startX.value = dx.value;
      startY.value = dy.value;
      /* The lift is the only thing that says "this is moving now" — there is
         no shadow to grow, because the motion rules forbid animating one. */
      lifted.value = withSpring(1, { damping: 18, stiffness: 260 });
      runOnJS(grabbed)();
    })
    .onUpdate((event) => {
      const nextX = startX.value + event.translationX;
      const nextY = startY.value + event.translationY;
      dx.value = Math.min(Math.max(nextX, minDx), maxDx);
      dy.value = Math.min(Math.max(nextY, minDy), maxDy);
    })
    .onFinalize(() => {
      lifted.value = withSpring(0, { damping: 18, stiffness: 260 });
    });

  const tap = Gesture.Tap().onEnd((_event, success) => {
    if (success) runOnJS(tapped)();
  });

  const gesture = Gesture.Race(pan, tap);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx.value },
      { translateY: dy.value },
      { scale: reduceMotion ? 1 : 1 + lifted.value * 0.06 },
    ],
  }));

  const onAreaLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  const onPillLayout = (event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setPill((current) =>
      current.x === x && current.y === y && current.width === width && current.height === height
        ? current
        : { x, y, width, height },
    );
  };

  return (
    /* The whole feed area, not a strip along the bottom. The pill rests where
       it always did — `flex-end` plus the caller's inset — but the box it is
       measured and clamped against has to be everywhere it is allowed to go. */
    <View
      pointerEvents="box-none"
      onLayout={onAreaLayout}
      style={[StyleSheet.absoluteFill, styles.area, { paddingBottom: bottomInset }]}
    >
      <GestureDetector gesture={gesture}>
        <Animated.View
          onLayout={onPillLayout}
          accessibilityRole="button"
          accessibilityLabel="Explore map and localities"
          accessibilityHint="Double tap to open. Drag to move this button."
          style={[
            styles.pill,
            pillStyle,
            {
              backgroundColor: mode === 'dark' ? colors.brand : colors.graphite,
              borderRadius: radius.pill,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.28,
              shadowRadius: 8,
              elevation: 6,
            },
          ]}
        >
          <Text variant="bodyStrong" style={styles.label}>
            {label}
          </Text>
          <Icon name="mapPin" size={16} color="#FFFFFF" />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  area: { alignItems: 'center', justifyContent: 'flex-end', zIndex: 20 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 6,
  },
  label: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
