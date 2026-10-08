import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useReduceMotion } from '@/context/ThemeContext';

/**
 * The entry sequence — the script logo writes itself, about 3.3 s.
 *
 *   t=0     the logo's green, already painted by the native launch screen
 *           (`app.config.js` → `BRAND.launch`, which shows ONLY the green), so
 *           there is no flash and no logo that vanishes to be redrawn
 *   t=200   "Lampose" is revealed left to right, like a pen stroke, with a soft
 *           light riding the tip, 1.5 s
 *   t=1700  the finished word settles with a small breath
 *   t=1900  "a company that connects us" opens out from the centre
 *   t=3000  hold ends — the token check and server-time fetch ran during it
 *   t=3000  exit, 300 ms: the screen fades into the app
 *
 * The artwork is the logo itself (`assets/images/logo-wordmark.png` and
 * `logo-tagline.png`, cut from the brand file), never a font standing in for it.
 *
 * If the token check finishes early the splash still plays out; if it outlasts
 * `SLOW_CHECK_AT` a thin line appears and the exit waits. Under reduced motion
 * nothing is drawn on: the logo and the line fade in, same timing.
 */

const LOGO_GREEN = '#0A714E';
const CREAM = '#F9F6EF';

const WORDMARK = require('@/assets/images/logo-wordmark.png');
const TAGLINE = require('@/assets/images/logo-tagline.png');
/* The two pieces' own proportions, from the cut files. */
const WORDMARK_RATIO = 1097 / 422;
const TAGLINE_RATIO = 1138 / 81;

const WRITE_AT = 200;
const WRITE_FOR = 1500;
const TAGLINE_AT = 1900;
const EXIT_AT = 3000;
const EXIT_DURATION = 300;
/** Past this, the check is slow enough that the user deserves to be told. */
export const SLOW_CHECK_AT = EXIT_AT + 500;

export type SplashSequenceProps = {
  /** Fires once the exit has played. The caller navigates from here. */
  onFinish?: () => void;
  /** Holds the exit open — the token check has not come back yet. */
  waiting?: boolean;
};

export function SplashSequence({ onFinish, waiting = false }: SplashSequenceProps) {
  const still = useReduceMotion();
  const { width: screen } = useWindowDimensions();

  /* The word across about three quarters of the screen, never wider than 320. */
  const wordWidth = Math.min(320, Math.round(screen * 0.74));
  const wordHeight = Math.round(wordWidth / WORDMARK_RATIO);
  const tagWidth = Math.round(wordWidth * 1.05);
  const tagHeight = Math.round(tagWidth / TAGLINE_RATIO);

  const write = useSharedValue(still ? 1 : 0);
  const settle = useSharedValue(0);
  const tagOpen = useSharedValue(still ? 1 : 0);
  const tagWords = useSharedValue(0);
  const fadeIn = useSharedValue(still ? 0 : 1);
  const exit = useSharedValue(0);
  const [slow, setSlow] = React.useState(false);

  useEffect(() => {
    if (still) {
      fadeIn.value = withTiming(1, { duration: 300 });
      tagWords.value = withTiming(1, { duration: 300 });
    } else {
      write.value = withDelay(WRITE_AT, withTiming(1, { duration: WRITE_FOR, easing: Easing.inOut(Easing.sin) }));
      settle.value = withDelay(
        WRITE_AT + WRITE_FOR,
        withSequence(
          withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }),
        ),
      );
      tagOpen.value = withDelay(TAGLINE_AT, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
      tagWords.value = withDelay(TAGLINE_AT + 250, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
    }
    const slowTimer = setTimeout(() => setSlow(true), SLOW_CHECK_AT);
    return () => clearTimeout(slowTimer);
  }, [still, write, settle, tagOpen, tagWords, fadeIn]);

  useEffect(() => {
    if (waiting) return;
    /* Both timers are cleared on unmount — the inner one used to survive it,
       and called `onFinish` (a navigation) on a splash that had already gone. */
    let finishTimer: ReturnType<typeof setTimeout> | null = null;
    const timer = setTimeout(() => {
      exit.value = withTiming(1, { duration: EXIT_DURATION, easing: Easing.in(Easing.cubic) });
      finishTimer = setTimeout(() => onFinish?.(), EXIT_DURATION);
    }, EXIT_AT);
    return () => {
      clearTimeout(timer);
      if (finishTimer) clearTimeout(finishTimer);
    };
  }, [waiting, exit, onFinish]);

  const hostStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));

  /* The pen: the word is uncovered from the left as `write` runs 0 → 1. */
  const inkStyle = useAnimatedStyle(() => ({ width: wordWidth * write.value }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
    transform: [{ scale: 1 + 0.03 * settle.value }],
  }));
  /* The light on the pen's tip — there while it writes, gone when it lifts. */
  const tipStyle = useAnimatedStyle(() => ({
    opacity: write.value > 0 && write.value < 1 ? 0.9 : 0,
    transform: [{ translateX: wordWidth * write.value - 14 }],
  }));

  /* The tagline opens out from its centre. */
  const tagStyle = useAnimatedStyle(() => ({
    width: tagWidth * tagOpen.value,
    opacity: Math.min(1, tagOpen.value * 3),
  }));
  const tagWordsStyle = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * tagWords.value }));

  return (
    <Animated.View style={[styles.host, { backgroundColor: LOGO_GREEN }, hostStyle]}>
      <StatusBar style="light" />

      <View
        style={styles.stack}
        accessible
        accessibilityRole="header"
        accessibilityLabel="Lampose. A company that connects us."
      >
        <Animated.View style={[{ width: wordWidth, height: wordHeight }, wordStyle]}>
          <Animated.View style={[styles.ink, { height: wordHeight }, inkStyle]}>
            <Image source={WORDMARK} style={{ width: wordWidth, height: wordHeight }} resizeMode="contain" />
          </Animated.View>
          {still ? null : (
            <Animated.View pointerEvents="none" style={[styles.tip, { top: wordHeight * 0.42 }, tipStyle]} />
          )}
        </Animated.View>

        <Animated.View
          style={[styles.tagWindow, { height: tagHeight, marginTop: Math.round(wordHeight * 0.16) }, tagStyle]}
        >
          <Animated.Image
            source={TAGLINE}
            style={[styles.tagImage, { width: tagWidth, height: tagHeight, marginLeft: -tagWidth / 2 }, tagWordsStyle]}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      {slow && waiting ? <SlowCheckLine /> : null}
    </Animated.View>
  );
}

/**
 * A 2 pt indeterminate line, never a spinner.
 *
 * The layout is already known, so a spinner would be admitting we do not know
 * what is coming. It is bounded by the wait rather than ambient — the same
 * class of thing as the `Spinner` primitive, not a third infinite animation —
 * and under reduced motion it stops and the word carries it.
 */
function SlowCheckLine() {
  const reduceMotion = useReduceMotion();
  const travel = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    travel.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        withTiming(0, { duration: 900, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, travel]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -60 + travel.value * 120 }],
  }));

  return (
    <View style={styles.slowHost}>
      <View style={styles.track}>
        {reduceMotion ? <View style={styles.bar} /> : <Animated.View style={[styles.bar, style]} />}
      </View>
      {reduceMotion ? (
        <Text variant="numMeta" style={{ color: CREAM, opacity: 0.7 }}>
          Checking your session
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stack: { alignItems: 'center' },
  /* Clips the word to what the pen has written so far. */
  ink: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  tip: {
    position: 'absolute',
    left: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  /* Centred, and clipping the tagline as it widens from the middle. */
  tagWindow: { overflow: 'hidden', alignSelf: 'center' },
  tagImage: { position: 'absolute', left: '50%', top: 0 },
  slowHost: { position: 'absolute', bottom: 64, alignItems: 'center', gap: 8 },
  track: { width: 160, height: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.15)' },
  bar: { width: 60, height: 2, backgroundColor: CREAM },
});
