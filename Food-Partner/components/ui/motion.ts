/* The Adios partner app's motion vocabulary, on react-native-reanimated 4's own
   entering / exiting presets. Screens compose these rather than hand-rolling
   Animated.Value boilerplate, so every list and sheet moves the same way. */
import { useEffect } from "react";
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };
export const TIMING_FAST = { duration: 180, easing: Easing.out(Easing.cubic) };

export const fadeIn = (delayMs = 0) => FadeIn.delay(delayMs).duration(240);

export const fadeInUp = (delayMs = 0) => FadeInUp.delay(delayMs).duration(320).easing(Easing.out(Easing.cubic));

export const fadeInDown = (delayMs = 0) => FadeInDown.delay(delayMs).duration(320).easing(Easing.out(Easing.cubic));

/** Staggered entrance for list items — pass the item's index. */
export const staggerListItem = (index: number, baseDelayMs = 40) =>
  FadeInUp.delay(Math.min(index, 8) * baseDelayMs)
    .duration(280)
    .easing(Easing.out(Easing.cubic));

export const fadeOut = FadeOut.duration(180);

export const modalSlideUp = SlideInDown.duration(320).easing(Easing.out(Easing.cubic));

/** Press-in / press-out scale feedback for a Pressable. */
export function usePressScale(scaleTo = 0.97) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onPressIn = () => {
    scale.value = withTiming(scaleTo, TIMING_FAST);
  };
  const onPressOut = () => {
    scale.value = withSpring(1, SPRING);
  };
  return { animatedStyle, onPressIn, onPressOut };
}

/** Looping opacity pulse for skeleton placeholders. */
export function useShimmer() {
  const opacity = useSharedValue(0.4);
  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.4, { duration: 700 })), -1, true);
  }, [opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}
