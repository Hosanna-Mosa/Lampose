import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Heart, MessageCircle, Repeat2 } from 'lucide-react-native';

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
 * ## The radius is deliberately off the shared scale
 *
 * `radius` stops at `sheet` (24) and `pill` (999) — nothing in between,
 * because nothing before this needed it. This card asks for the mockup's
 * soft "blob" quality, which 24 does not read as on a ~340pt card. `CARD_RADIUS`
 * is a one-off for this shell, not a value another screen should reach for.
 *
 * ## Why both faces carry the full card, not just their content
 *
 * The ask was for the *card itself* to turn — shape, shadow and all — with
 * whichever form is on top riding along, not a static frame with content
 * crossfading inside it. So `elevation.float` and the fill live on each face,
 * and it is the face — not an outer shell — that carries the `rotateY`.
 *
 * ## Sizing without an animated height
 *
 * The two faces hold a different number of fields, but height may not
 * animate (motion rules: transform and opacity only). Both faces are always
 * mounted — the hidden one just has zero opacity and, in the non-reduced
 * path, its back turned to the viewer — so both report their natural height
 * on mount via `onLayout`, and the stack is sized once to the taller of the
 * two. Nothing about the flip itself ever touches height.
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

  const [frontHeight, setFrontHeight] = useState(0);
  const [backHeight, setBackHeight] = useState(0);
  const stackHeight = Math.max(frontHeight, backHeight) || undefined;

  const onFrontLayout = (event: LayoutChangeEvent) => setFrontHeight(event.nativeEvent.layout.height);
  const onBackLayout = (event: LayoutChangeEvent) => setBackHeight(event.nativeEvent.layout.height);

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
    borderRadius: CARD_RADIUS,
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

      {/* Floating side icons from the reference mockup. Decoration only — they
          name nothing, so `Icon`'s vocabulary is not the right home for them
          and assistive tech is told to skip the whole row. */}
      <View style={styles.sideIcons} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[Heart, MessageCircle, Repeat2].map((Glyph, index) => (
          <View
            key={index}
            style={[
              styles.sideIconBubble,
              elevation.raised,
              { borderRadius: radius.pill, backgroundColor: colors.surface, marginTop: index === 0 ? 0 : space[5] },
            ]}
          >
            <Glyph size={18} color={colors.textTertiary} strokeWidth={1.75} />
          </View>
        ))}
      </View>

      <View style={[styles.stack, { height: stackHeight }]}>
        <Animated.View
          onLayout={onFrontLayout}
          pointerEvents={flipped ? 'none' : 'auto'}
          accessibilityElementsHidden={flipped}
          importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
          accessibilityLabel={frontLabel}
          style={[styles.face, faceBase, elevation.float, frontStyle]}
        >
          {front}
        </Animated.View>

        <Animated.View
          onLayout={onBackLayout}
          pointerEvents={flipped ? 'auto' : 'none'}
          accessibilityElementsHidden={!flipped}
          importantForAccessibility={!flipped ? 'no-hide-descendants' : 'auto'}
          accessibilityLabel={backLabel}
          style={[styles.face, faceBase, elevation.float, backStyle]}
        >
          {back}
        </Animated.View>
      </View>
    </View>
  );
}

/** Off the shared radius scale — see the note above the component. */
const CARD_RADIUS = 40;
const GLOW_SIZE = 420;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    top: -60,
    alignSelf: 'center',
    opacity: 0.6,
  },
  sideIcons: {
    position: 'absolute',
    right: -8,
    top: '18%',
    alignItems: 'center',
    zIndex: 1,
  },
  sideIconBubble: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: { width: '100%', maxWidth: 360 },
  face: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backfaceVisibility: 'hidden',
  },
});
