import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { signature } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

export type AuthFlipCardProps = {
  /** false shows `front`, true shows `back`. The card turns between them. */
  flipped: boolean;
  front: React.ReactNode;
  back: React.ReactNode;
  /** Read by assistive tech for whichever face is currently front-facing. */
  frontLabel: string;
  backLabel: string;
};

/**
 * The sign-in / sign-up card as one physical object with two faces, rather
 * than a form whose fields swap out under a segmented control.
 *
 * Radius is `radius.sheet` — the same corner the app already uses for a
 * surface presented above the page (bottom sheets, modals). A tried-and-tested
 * card shape rather than a bespoke one, since this is a card, not a disc.
 *
 * ## Why both faces carry the full card, not just their content
 *
 * The ask was for the *card itself* to turn — shape, shadow and all — with
 * whichever form is on top riding along, not a static frame with content
 * crossfading inside it. So `elevation.float` and the fill live on each face,
 * and it is the face — not an outer shell — that carries the `rotateY`.
 *
 * ## The visible face carries the height. It is not measured.
 *
 * This used to mount both faces absolutely and size the stack to the taller of
 * two `onLayout` measurements, so that height never changed across a flip —
 * the motion rules allow transform and opacity only.
 *
 * That was wrong in a way that made the screen unusable, and the mechanism is
 * worth keeping written down. An absolutely-positioned child contributes NO
 * height to its parent. So with both faces absolute, the stack's height — and
 * therefore the SCROLL EXTENT of the form around it — was whatever that
 * measurement happened to say, rather than how tall the card actually was. Any
 * content that grew after the first layout pass put the rest of the card
 * outside the scrollable area: not clipped-but-reachable, genuinely
 * unreachable, because the scroller did not believe there was anything there.
 * And `borderRadius` on the face makes Android clip the spill rather than let
 * it overhang, so it vanished instead of merely overflowing.
 *
 * Three things grow a face after its first measure, and this form has all
 * three: text re-wrapping once the webfont replaces the fallback, a validation
 * error appearing under a field, and the optional-field helpers. Sign-up lost
 * its bottom — the legal line and "Already have an account?" — and sign-in lost
 * its top.
 *
 * Now the ACTIVE face is in normal flow and only the hidden one is absolute, so
 * the stack is exactly as tall as what you can see, always, with nothing
 * measured and no state to go stale.
 *
 * The cost is that height changes when the card flips. That is a real trade
 * against the rule above, and it is the right way round: the rule forbids
 * ANIMATING height, and this does not animate it — it changes once, on the
 * frame the flip starts, while the card is already turning and the eye is on
 * the rotation. A form you cannot scroll to is not a defensible price for a
 * smoother transition between two faces of it.
 */
export function AuthFlipCard({ flipped, front, back, frontLabel, backLabel }: AuthFlipCardProps) {
  const { colors, space, radius, elevation } = useTheme();
  const reduceMotion = useReduceMotion();
  const spec = signature.authFlip;

  const progress = useSharedValue(flipped ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(flipped ? 1 : 0, {
      duration: reduceMotion ? spec.reducedDuration : spec.duration,
      easing: spec.easing,
    });
  }, [flipped, reduceMotion, progress, spec.duration, spec.reducedDuration, spec.easing]);

  const frontStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1 - progress.value };
    return {
      transform: [{ perspective: 1400 }, { rotateY: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }],
    };
  }, [reduceMotion]);

  const backStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: progress.value };
    return {
      transform: [{ perspective: 1400 }, { rotateY: `${interpolate(progress.value, [0, 1], [180, 360])}deg` }],
    };
  }, [reduceMotion]);

  const faceBase = {
    borderRadius: radius.sheet,
    backgroundColor: colors.surface,
    padding: space[6],
  };

  return (
    <View style={styles.wrap}>
      {/* Purely ornamental — sits behind the card, never moves. An ambient
          loop here would be a third infinite animation; the motion rules
          allow exactly two, and neither of them is this. */}
      <View style={styles.glow} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
          <Defs>
            <RadialGradient id="authGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.brandTint} stopOpacity={0.9} />
              <Stop offset="100%" stopColor={colors.brandTint} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#authGlow)" />
        </Svg>
      </View>

      {/* Exactly one of these is in flow at a time — the one you can see. The
          other is absolute and contributes no height, which is what keeps the
          stack honest about how tall the card is. */}
      <View style={styles.stack}>
        <Animated.View
          pointerEvents={flipped ? 'none' : 'auto'}
          accessibilityElementsHidden={flipped}
          importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
          accessibilityLabel={frontLabel}
          style={[
            flipped ? styles.faceHidden : styles.faceLive,
            faceBase,
            elevation.float,
            frontStyle,
          ]}
        >
          {front}
        </Animated.View>

        <Animated.View
          pointerEvents={flipped ? 'auto' : 'none'}
          accessibilityElementsHidden={!flipped}
          importantForAccessibility={!flipped ? 'no-hide-descendants' : 'auto'}
          accessibilityLabel={backLabel}
          style={[
            flipped ? styles.faceLive : styles.faceHidden,
            faceBase,
            elevation.float,
            backStyle,
          ]}
        >
          {back}
        </Animated.View>
      </View>
    </View>
  );
}

const GLOW_SIZE = 420;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    top: -60,
    alignSelf: 'center',
    opacity: 0.6,
  },
  stack: { width: '100%', maxWidth: 360 },
  /** In flow: this face is what the stack — and the scroller — measures. */
  faceLive: { backfaceVisibility: 'hidden' },
  /** Out of flow, pinned over the live one, contributing no height. */
  faceHidden: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backfaceVisibility: 'hidden',
  },
});
