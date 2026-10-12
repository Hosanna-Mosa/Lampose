import * as NativeSplash from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useReduceMotion } from '@/context/ThemeContext';

/**
 * The entry sequence — "light trail", about 2.8 s.
 *
 *   t=0     the native launch screen's picture, exactly: the lamp alone in the
 *           middle of the cream, 64dp (`splashscreen_logo`, `SPARK_START_DP`),
 *           so the hand-over from the OS to this screen does not jump
 *   0–700   the spark leaves the middle and falls back in depth (it shrinks on
 *           an arc) to the start of the swoosh
 *   700     it rides the swoosh up to the lamp; the swoosh draws in behind it
 *           and the letters light up just ahead of it, 1050 ms
 *   1750    it settles as the lamp and its light ripples out, 500 ms
 *   2500    hold ends — the token check and server-time fetch ran during it
 *   2500    exit, 300 ms: the screen fades into the app
 *
 * The 2026 logo as its own artwork in three layers — `logo-letters.png`,
 * `logo-swoosh.png` and `logo-glow.png`, cut by `brand/build-splash-layers.py`
 * — never a font standing in for it. React Native has no 3D depth, so "far
 * away" is drawn as smaller, the way perspective would draw it.
 *
 * If the token check finishes early the splash still plays out; if it outlasts
 * `SLOW_CHECK_AT` a thin line appears and the exit waits. Under reduced motion
 * nothing moves: the finished logo is shown, same timing.
 */

/** The logo's own ground. Kept equal to `BRAND.launch` in app.config.js and
    `splashscreen_background` in the android project, so the OS launch screen
    hands over to this one with no change of colour. */
const CREAM = '#FAF7EE';
const LOGO_GREEN = '#2B5A45';
const LAMP_GOLD = '#F2C94C';

const LETTERS = require('@/assets/images/logo-letters.png');
const SWOOSH = require('@/assets/images/logo-swoosh.png');
const GLOW = require('@/assets/images/logo-glow.png');

/** The artwork's own size, and where the glow's square crop sits in it —
    printed by `brand/build-splash-layers.py`. */
const LOGO = { width: 1007, height: 387 };
const GLOW_BOX = { x: 818, y: 0, size: 195 };

/** How big the native launch screen draws the lamp (`LAMP_DP` in
    build-splash-layers.py). The spark starts at exactly this size. */
const SPARK_START_DP = 64;

/*
 * The swoosh as a cubic curve, in fractions of the logo box: from its left
 * end to the centre of the glow. Fitted to the artwork; the spark rides it.
 */
const PATH: readonly (readonly [number, number])[] = [
  [0.018, 0.946],
  [0.48, 1.04],
  [0.85, 0.87],
  [(GLOW_BOX.x + GLOW_BOX.size / 2) / LOGO.width, (GLOW_BOX.y + GLOW_BOX.size / 2) / LOGO.height],
];

/* Phases, in ms. One clock drives them all. */
const APPROACH = 700;
const RIDE = 1050;
const SETTLE = 500;
const TOTAL = APPROACH + RIDE + SETTLE;
const EXIT_AT = 2500;
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
  const W = Math.min(320, Math.round(screen * 0.74));
  const k = W / LOGO.width;
  const H = Math.round(LOGO.height * k);
  const glowSize = GLOW_BOX.size * k;
  const sparkStart = SPARK_START_DP / glowSize;

  /* 0 → TOTAL: where the sequence is. Reduced motion starts at the end. */
  const clock = useSharedValue(still ? TOTAL : 0);
  const exit = useSharedValue(0);
  const [slow, setSlow] = React.useState(false);
  /*
   * Nothing plays until this screen is actually on the glass.
   *
   * The animation used to start on mount, while the phone's own launch screen
   * was hidden separately — by the root layout, the moment the fonts loaded. The
   * two rarely lined up: the motion could run out underneath the launch screen,
   * or finish before this screen's first frame, and what was left on view was a
   * still logo. Now this screen hides the launch screen itself once it has laid
   * out, and starts everything — the motion and the exit timer — a frame after
   * that.
   */
  const [started, setStarted] = React.useState(false);
  const onStage = React.useCallback(() => {
    NativeSplash.hideAsync()
      .catch(() => {})
      .finally(() => requestAnimationFrame(() => setStarted(true)));
  }, []);

  useEffect(() => {
    if (!started) return undefined;
    if (!still) clock.value = withTiming(TOTAL, { duration: TOTAL, easing: Easing.linear });
    const slowTimer = setTimeout(() => setSlow(true), SLOW_CHECK_AT);
    return () => clearTimeout(slowTimer);
  }, [started, still, clock]);

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

  /* The spark: the lamp's own glow, flying. */
  const sparkStyle = useAnimatedStyle(() => {
    const t = clock.value;
    let x: number;
    let y: number;
    let scale: number;
    if (t < APPROACH) {
      /* From the middle (where the OS drew it) back into depth and down to
         the start of the swoosh: smaller on the way, as if further off. */
      const a = 1 - Math.pow(1 - t / APPROACH, 3);
      x = 0.5 + (PATH[0][0] - 0.5) * a;
      y = 0.5 + (PATH[0][1] - 0.5) * a - 0.55 * Math.sin(Math.PI * a);
      scale = (sparkStart + (0.7 - sparkStart) * a) * (1 - 0.4 * Math.sin(Math.PI * a));
    } else if (t < APPROACH + RIDE) {
      const u = rideAt(t);
      x = along(u, 0);
      y = along(u, 1);
      scale = 0.7 + 0.3 * u;
    } else {
      x = PATH[3][0];
      y = PATH[3][1];
      scale = 1;
    }
    return {
      transform: [
        { translateX: x * W - glowSize / 2 },
        { translateY: y * H - glowSize / 2 },
        { scale },
      ],
    };
  });

  /* Its light rippling out once it has landed. */
  const bloomStyle = useAnimatedStyle(() => {
    const c = Math.min(1, Math.max(0, (clock.value - APPROACH - RIDE) / SETTLE));
    return {
      opacity: c === 0 || c === 1 ? 0 : 0.85 * (1 - c),
      transform: [
        { translateX: PATH[3][0] * W - glowSize / 2 },
        { translateY: PATH[3][1] * H - glowSize / 2 },
        { scale: 1 + 2.4 * c },
      ],
    };
  });

  /* The swoosh draws in behind the spark; the letters light just ahead of it. */
  const swooshClip = useAnimatedStyle(() => ({ width: W * revealed(clock.value, 1) }));
  const lettersClip = useAnimatedStyle(() => ({ width: W * revealed(clock.value, 1.12) }));

  return (
    <Animated.View style={[styles.host, { backgroundColor: CREAM }, hostStyle]} onLayout={onStage}>
      <StatusBar style="dark" />

      <View
        style={{ width: W, height: H }}
        accessible
        accessibilityRole="header"
        accessibilityLabel="Lampose"
      >
        <Animated.View style={[styles.clip, { height: H }, swooshClip]}>
          <Image source={SWOOSH} style={{ width: W, height: H }} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.clip, { height: H }, lettersClip]}>
          <Image source={LETTERS} style={{ width: W, height: H }} resizeMode="contain" />
        </Animated.View>
        <Animated.Image
          source={GLOW}
          style={[styles.glow, { width: glowSize, height: glowSize }, bloomStyle]}
        />
        <Animated.Image
          source={GLOW}
          style={[styles.glow, { width: glowSize, height: glowSize }, sparkStyle]}
        />
      </View>

      {slow && waiting ? <SlowCheckLine /> : null}
    </Animated.View>
  );
}

/** How far along the swoosh the spark is at time `t`, 0 → 1, eased. */
function rideAt(t: number): number {
  'worklet';
  const r = Math.min(1, Math.max(0, (t - APPROACH) / RIDE));
  return r < 0.5 ? 4 * r * r * r : 1 - Math.pow(-2 * r + 2, 3) / 2;
}

/** A point on the swoosh curve, `axis` 0 for x and 1 for y. */
function along(u: number, axis: 0 | 1): number {
  'worklet';
  const v = 1 - u;
  return v * v * v * PATH[0][axis] + 3 * v * v * u * PATH[1][axis]
    + 3 * v * u * u * PATH[2][axis] + u * u * u * PATH[3][axis];
}

/** How much of a layer is showing: none before the ride, all after it, and in
    between up to the spark (times `lead`, so the letters run a little ahead). */
function revealed(t: number, lead: number): number {
  'worklet';
  if (t < APPROACH) return 0;
  if (t >= APPROACH + RIDE) return 1;
  return Math.min(1, along(rideAt(t), 0) * lead);
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
        <Text variant="numMeta" style={{ color: LOGO_GREEN, opacity: 0.7 }}>
          Checking your session
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  clip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  glow: { position: 'absolute', left: 0, top: 0 },
  slowHost: { position: 'absolute', bottom: 64, alignItems: 'center', gap: 8 },
  track: { width: 160, height: 2, overflow: 'hidden', backgroundColor: 'rgba(43,90,69,0.15)' },
  bar: { width: 60, height: 2, backgroundColor: LAMP_GOLD },
});
