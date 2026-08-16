import { useCallback } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { easing } from '@/constants/motion';
import { useReduceMotion } from '@/context/ThemeContext';

/**
 * The press-state specification, in one place.
 *
 * Batch 1 specified these values once and referenced them by name everywhere
 * else, so they live here rather than being re-typed into each primitive.
 *
 * `buttonFullWidth` is not a rounding of `button`: a 358pt-wide element
 * shrinking by 3% reads as a glitch rather than as a press, so a full-width
 * button scales to 0.99 while a hugging one scales to 0.97.
 */
export const pressScale = {
  button: 0.97,
  buttonFullWidth: 0.99,
  iconButton: 0.94,
  card: 0.975,
  chip: 0.96,
} as const;

export type PressKind = keyof typeof pressScale;

/** In on `easeExit` (fast away), out on `easeEnter` (settles back). */
const PRESS_IN = { duration: 90, easing: easing.exit };
const PRESS_OUT = { duration: 140, easing: easing.enter };

/**
 * Drives a pressable's scale on the UI thread.
 *
 * Under reduced motion the scale is dropped entirely — the background
 * crossfade that every primitive also runs is what carries the press instead,
 * and that is a colour change, which reduced motion permits.
 *
 * Origin is always the element centre. React Native has no transform-origin,
 * so no primitive may assume otherwise.
 */
export function usePressAnimation(kind: PressKind = 'button') {
  const progress = useSharedValue(0);
  const reduceMotion = useReduceMotion();

  const onPressIn = useCallback(() => {
    progress.value = withTiming(1, PRESS_IN);
  }, [progress]);

  const onPressOut = useCallback(() => {
    progress.value = withTiming(0, PRESS_OUT);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    const target = pressScale[kind];
    return { transform: [{ scale: 1 - progress.value * (1 - target) }] };
  }, [kind, reduceMotion]);

  // `progress` is exposed so a primitive can also crossfade its background
  // from the same shared value. That crossfade is the part that survives
  // reduced motion, so it must stay driven even when the scale is dropped.
  return { animatedStyle, onPressIn, onPressOut, progress };
}
