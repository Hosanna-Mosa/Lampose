import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { easing } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

/**
 * The entry sequence — 940 ms to first content, and cancellable.
 *
 *   t=0    ink ground, already painted by the native splash so there is no
 *          flash of white between the two
 *   t=0    the dot lands, 240 ms on the settle curve
 *   t=140  the wordmark arrives, opacity and 6 pt of travel, 240 ms
 *   t=660  hold — the token check and the server-time offset fetch run here
 *   t=940  exit, the lockup scaling 1 → 1.04 as it fades into the app
 *
 * If the token check finishes early the splash still plays out: a 300 ms flash
 * is worse than a 900 ms beat. If it takes longer than 1200 ms a 2 pt line
 * appears and the exit waits.
 *
 * NOTE — the dot travel is deliberately absent. Batch 5 specified the dot
 * sliding from the centre into its resting place after the E at t=380, and the
 * Batch 12 audit cut it: it explains nothing (the user is waiting for a token
 * check, not learning where a square belongs) and it delays first content by
 * 280 ms on the slowest hardware. The dot lands where it belongs.
 */

const DOT_IN = 240;
const WORDMARK_AT = 140;
const EXIT_AT = 940;
const EXIT_DURATION = 200;
/** Past this, the check is slow enough that the user deserves to be told. */
export const SLOW_CHECK_AT = 1200;

export type SplashSequenceProps = {
  /** Fires once the exit has played. The caller navigates from here. */
  onFinish?: () => void;
  /** Holds the exit open — the token check has not come back yet. */
  waiting?: boolean;
};

export function SplashSequence({ onFinish, waiting = false }: SplashSequenceProps) {
  const { colors, space } = useTheme();
  const reduceMotion = useReduceMotion();

  const dot = useSharedValue(reduceMotion ? 1 : 0);
  const wordmark = useSharedValue(0);
  const lockup = useSharedValue(1);
  const fade = useSharedValue(1);
  const [slow, setSlow] = React.useState(false);

  useEffect(() => {
    if (reduceMotion) {
      // Movement is removed; the timing contract is not. Same 940 ms beat.
      wordmark.value = withTiming(1, { duration: 200 });
      dot.value = withTiming(1, { duration: 200 });
    } else {
      dot.value = withTiming(1, { duration: DOT_IN, easing: easing.settle });
      wordmark.value = withDelay(
        WORDMARK_AT,
        withTiming(1, { duration: 240, easing: easing.enter }),
      );
    }

    const slowTimer = setTimeout(() => setSlow(true), SLOW_CHECK_AT);
    return () => clearTimeout(slowTimer);
  }, [reduceMotion, dot, wordmark]);

  useEffect(() => {
    if (waiting) return;
    const timer = setTimeout(
      () => {
        if (!reduceMotion) {
          lockup.value = withTiming(1.04, { duration: EXIT_DURATION, easing: easing.exit });
        }
        fade.value = withTiming(0, { duration: EXIT_DURATION, easing: easing.exit });
        setTimeout(() => onFinish?.(), EXIT_DURATION);
      },
      Math.max(0, EXIT_AT),
    );
    return () => clearTimeout(timer);
  }, [waiting, reduceMotion, lockup, fade, onFinish]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dot.value,
    transform: [{ scale: reduceMotion ? 1 : dot.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: reduceMotion ? 0 : 6 - wordmark.value * 6 }],
  }));

  const lockupStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: lockup.value }],
  }));

  return (
    <View style={[styles.host, { backgroundColor: colors.graphite }]}>
      <Animated.View style={[styles.lockup, lockupStyle, { gap: space[2] }]}>
        <Animated.View style={wordmarkStyle}>
          <Text variant="display2" style={{ color: colors.onGraphite, letterSpacing: 2 }}>
            LAMPOSE
          </Text>
        </Animated.View>
        {/* The one mark in the identity. It lands; it does not travel. */}
        <Animated.View
          style={[styles.dot, dotStyle, { backgroundColor: colors.brandOnDark }]}
        />
      </Animated.View>

      {slow && waiting ? <SlowCheckLine /> : null}
    </View>
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
  const { colors, space } = useTheme();
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
    <View style={[styles.slowHost, { bottom: space[8] }]}>
      <View style={[styles.track, { backgroundColor: colors.graphiteRaised }]}>
        {reduceMotion ? (
          <View style={[styles.bar, { backgroundColor: colors.brandOnDark }]} />
        ) : (
          <Animated.View style={[styles.bar, style, { backgroundColor: colors.brandOnDark }]} />
        )}
      </View>
      {reduceMotion ? (
        <Text variant="numMeta" style={{ color: colors.onGraphiteMuted }}>
          Checking your session
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockup: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 2 },
  slowHost: { position: 'absolute', alignItems: 'center', gap: 8 },
  track: { width: 160, height: 2, overflow: 'hidden' },
  bar: { width: 60, height: 2 },
});
