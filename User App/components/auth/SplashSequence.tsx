import * as NativeSplash from 'expo-splash-screen';
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
 * The entry sequence — the logo grows in and its full stop hops, about 2.6 s.
 *
 *   t=0     the native launch screen's picture, exactly: the logo on its green,
 *           180dp wide (`splashscreen_logo`, `NATIVE_LOGO_DP`), so the hand-over
 *           from the OS to this screen does not jump
 *   t=0     it grows to full size, 600 ms
 *   t=750   the full stop hops up, lands with a squash and bounces once — the
 *           logo's own punctuation, said with a little weight
 *   t=1500  the finished logo takes one small breath
 *   t=2300  hold ends — the token check and server-time fetch ran during it
 *   t=2300  exit, 300 ms: the screen fades into the app
 *
 * The artwork is the logo itself (`assets/images/logo-word.png` and
 * `logo-dot.png`, cut from the brand file), never a font standing in for it.
 *
 * If the token check finishes early the splash still plays out; if it outlasts
 * `SLOW_CHECK_AT` a thin line appears and the exit waits. Under reduced motion
 * nothing moves: the logo is shown at full size, same timing.
 */

const LOGO_GREEN = '#027C33';
const CREAM = '#F9F6EF';

const WORD = require('@/assets/images/logo-word.png');
const DOT = require('@/assets/images/logo-dot.png');

/*
 * Where the pieces sit in the whole logo, from the brand file: the logo is
 * 917 × 231, the word 852 wide from its left edge, and the full stop 65 × 87
 * starting at x 853, y 110.
 */
const LOGO = { width: 917, height: 231 };
const WORD_W = 852;
const DOT_BOX = { x: 853, y: 110, width: 65, height: 87 };

/** How wide the native launch screen draws the logo (`splashscreen_logo` in the
    Android project, `assets/images/splash-logo.png` in app.config.js). */
const NATIVE_LOGO_DP = 180;

const GROW_FOR = 600;
const DOT_AT = 750;
const BREATH_AT = 1500;
const EXIT_AT = 2300;
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

  /* The logo across about three quarters of the screen, never wider than 320. */
  const logoWidth = Math.min(320, Math.round(screen * 0.74));
  const k = logoWidth / LOGO.width;
  const logoHeight = Math.round(LOGO.height * k);
  const wordWidth = Math.round(WORD_W * k);
  const dot = {
    left: Math.round(DOT_BOX.x * k),
    top: Math.round(DOT_BOX.y * k),
    width: Math.round(DOT_BOX.width * k),
    height: Math.round(DOT_BOX.height * k),
  };

  /* Starts at the native launch screen's size, so nothing jumps. */
  const startScale = Math.min(1, NATIVE_LOGO_DP / logoWidth);
  const grow = useSharedValue(still ? 1 : 0);
  /* How high the full stop is, 0 at rest. */
  const hop = useSharedValue(0);
  const squash = useSharedValue(0);
  const breath = useSharedValue(0);
  const exit = useSharedValue(0);
  const [slow, setSlow] = React.useState(false);
  /*
   * Nothing plays until this screen is actually on the glass.
   *
   * The animation used to start on mount, while the phone's own launch screen
   * was hidden separately — by the root layout, the moment the fonts loaded. The
   * two rarely lined up: the grow and the hop could run out underneath the
   * launch screen, or finish before this screen's first frame, and what was
   * left on view was a still logo. Now this screen hides the launch screen
   * itself once it has laid out, and starts everything — the motion and the
   * exit timer — a frame after that.
   */
  const [started, setStarted] = React.useState(false);
  const onStage = React.useCallback(() => {
    NativeSplash.hideAsync()
      .catch(() => {})
      .finally(() => requestAnimationFrame(() => setStarted(true)));
  }, []);

  useEffect(() => {
    if (!started) return undefined;
    if (!still) {
      grow.value = withTiming(1, { duration: GROW_FOR, easing: Easing.out(Easing.cubic) });
      /* Up, down, a small bounce, settled. */
      hop.value = withDelay(
        DOT_AT,
        withSequence(
          withTiming(1, { duration: 230, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 230, easing: Easing.in(Easing.quad) }),
          withTiming(0.18, { duration: 120, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 120, easing: Easing.in(Easing.quad) }),
        ),
      );
      /* A squash at each touch-down. */
      squash.value = withDelay(
        DOT_AT + 460,
        withSequence(
          withTiming(1, { duration: 70 }),
          withTiming(0, { duration: 120 }),
          withDelay(120, withTiming(0.5, { duration: 60 })),
          withTiming(0, { duration: 110 }),
        ),
      );
      breath.value = withDelay(
        BREATH_AT,
        withSequence(
          withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 280, easing: Easing.inOut(Easing.quad) }),
        ),
      );
    }
    const slowTimer = setTimeout(() => setSlow(true), SLOW_CHECK_AT);
    return () => clearTimeout(slowTimer);
  }, [started, still, grow, hop, squash, breath]);

  useEffect(() => {
    if (waiting || !started) return;
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
  }, [waiting, started, exit, onFinish]);

  const hostStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: (startScale + (1 - startScale) * grow.value) * (1 + 0.035 * breath.value) }],
  }));
  /* The full stop's hop: up about its own height and a half, then home. */
  const rise = dot.height * 1.6;
  const dotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -rise * hop.value + dot.height * 0.12 * squash.value },
      { scaleX: 1 + 0.22 * squash.value },
      { scaleY: 1 - 0.24 * squash.value },
    ],
  }));

  return (
    <Animated.View style={[styles.host, { backgroundColor: LOGO_GREEN }, hostStyle]} onLayout={onStage}>
      <StatusBar style="light" />

      <Animated.View
        style={[{ width: logoWidth, height: logoHeight }, logoStyle]}
        accessible
        accessibilityRole="header"
        accessibilityLabel="Lampose"
      >
        <Image source={WORD} style={[styles.word, { width: wordWidth, height: logoHeight }]} resizeMode="contain" />
        <Animated.Image
          source={DOT}
          style={[styles.dot, { left: dot.left, top: dot.top, width: dot.width, height: dot.height }, dotStyle]}
          resizeMode="contain"
        />
      </Animated.View>

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
  word: { position: 'absolute', left: 0, top: 0 },
  dot: { position: 'absolute' },
  slowHost: { position: 'absolute', bottom: 64, alignItems: 'center', gap: 8 },
  track: { width: 160, height: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.15)' },
  bar: { width: 60, height: 2, backgroundColor: '#FCDD44' },
});
