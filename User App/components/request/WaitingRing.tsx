import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui';
import { ambient, easing, signature } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { formatRemaining, useCountdown } from '@/hooks/useCountdown';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Waiting for the owner — designed as confidence, not as a countdown.
 *
 * The ring is a PROGRESS ring: it fills as the owner's window elapses, rather
 * than draining toward zero. And the number inside is minutes, not seconds,
 * above ten — watching seconds tick for half an hour on something you cannot
 * influence is manufactured anxiety.
 *
 * Behind it sits a soft breathing halo. It says the app is awake and watching.
 * It is one of exactly two infinite animations in the product.
 *
 * At five minutes there is a one-shot urgency shift: the ring and halo cross to
 * caution-orange, the card pops once, granularity switches to mm:ss, and a single light
 * haptic fires. **It never turns red.** Nothing has gone wrong, and red here
 * would tell a parent looking over a shoulder that their child is losing money.
 */

const RING_RADIUS = 54;
const RING_STROKE = 6;
const RING_SIZE = (RING_RADIUS + RING_STROKE) * 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Where patient becomes specific. */
const URGENT_AT_SECONDS = 5 * 60;

export type WaitingRingProps = {
  /** Absolute server timestamp for the end of the owner's window. */
  deadline: string;
  /** The full window, so the ring knows how far through it is. */
  totalSeconds: number;
  onExpire?: () => void;
};

export function WaitingRing({ deadline, totalSeconds, onExpire }: WaitingRingProps) {
  const { colors, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();

  const { secondsRemaining } = useCountdown(deadline, { onExpire });
  const urgent = secondsRemaining <= URGENT_AT_SECONDS;

  const halo = useSharedValue(0);
  const pop = useSharedValue(1);
  const wasUrgent = useRef(urgent);

  // The one-shot shift. Fires on the crossing and never repeats.
  useEffect(() => {
    if (wasUrgent.current === urgent) return;
    wasUrgent.current = urgent;
    if (!urgent) return;
    if (!reduceMotion) {
      pop.value = withSequence(
        withTiming(1.05, { duration: 120, easing: easing.settle }),
        withTiming(1, { duration: 120, easing: easing.settle }),
      );
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [urgent, reduceMotion, pop]);

  // Infinite animation 1 of 2. Speeds up at the shift, but never strobes.
  useEffect(() => {
    if (reduceMotion) return;
    halo.value = withRepeat(
      withTiming(1, {
        duration: urgent ? 1400 : ambient.waitingHalo.duration,
        easing: easing.inOut,
      }),
      -1,
      true,
    );
  }, [urgent, reduceMotion, halo]);

  /** Filled fraction — how much of the window has gone. */
  const elapsed = Math.max(0, Math.min(1, 1 - secondsRemaining / Math.max(1, totalSeconds)));

  const offset = useDerivedValue(
    () => withTiming(CIRCUMFERENCE * (1 - elapsed), { duration: 400, easing: easing.standard }),
    [elapsed],
  );
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));

  const tone = useDerivedValue(
    () => withTiming(urgent ? 1 : 0, { duration: signature.timerTierShift.duration, easing: easing.standard }),
    [urgent],
  );

  const haloStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? 0
      : ambient.waitingHalo.opacity[0] +
        halo.value * (ambient.waitingHalo.opacity[1] - ambient.waitingHalo.opacity[0]),
    transform: [
      {
        scale: reduceMotion
          ? 1
          : ambient.waitingHalo.scale[0] +
            halo.value * (ambient.waitingHalo.scale[1] - ambient.waitingHalo.scale[0]),
      },
    ],
    backgroundColor: interpolateColor(tone.value, [0, 1], [colors.brandTint, colors.warning.tint]),
  }));

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const stroke = urgent ? colors.warning.base : colors.brand;
  const readout = formatRemaining(secondsRemaining);

  return (
    <Animated.View style={[styles.host, cardStyle, { gap: space[4] }]}>
      <View style={styles.ringHost}>
        {/* The halo sits behind the ring: the app is awake and watching. */}
        <Animated.View style={[styles.halo, haloStyle, { borderRadius: radius.pill }]} />

        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={colors.surfaceSunken}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={stroke}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            animatedProps={ringProps}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </Svg>

        <View style={[StyleSheet.absoluteFill, styles.centre]}>
          <Text variant="priceLg" style={{ color: urgent ? colors.warning.ink : colors.textPrimary }}>
            {readout}
          </Text>
          <Text variant="numMeta" color="tertiary">
            left
          </Text>
        </View>
      </View>

      <View style={[styles.centre, { gap: space[2] }]}>
        <Text variant="title1" style={styles.centredText}>
          {urgent ? 'Nearly out of time' : 'Waiting for the owner'}
        </Text>
        <Text variant="bodyLg" color="secondary" style={styles.centredText}>
          {urgent
            ? 'If she does not answer in the next few minutes the request ends by itself. Nothing is charged either way.'
            : 'Nothing for you to do. We will notify you the moment she answers, even if you close the app.'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { alignItems: 'center' },
  ringHost: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: RING_SIZE, height: RING_SIZE },
  centre: { alignItems: 'center', justifyContent: 'center' },
  centredText: { textAlign: 'center' },
});
