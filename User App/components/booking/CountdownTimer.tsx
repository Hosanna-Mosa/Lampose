import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { CountdownRing, Icon, Text } from '@/components/ui';
import { ambient, component, easing, signature } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { formatRemaining, useCountdown } from '@/hooks/useCountdown';
import { tierFor, type CountdownContext, type CountdownTier } from '@/types/booking';

/**
 * The three clocks, in one component.
 *
 * Two rules from Batch 0 are structural here rather than advisory. A deadline
 * is always an absolute server timestamp, so a fast device clock cannot lie
 * about a payment window. And at zero this component decides nothing: it emits
 * `onExpire` and shows the terminal copy the server confirms. A client-side
 * clock must never flip a booking's status.
 *
 * Only one of these may be visible on a screen. Two means the booking is in an
 * impossible state, which is a state-machine bug rather than a layout problem.
 */

const TIER_POP = { duration: signature.timerTierShift.duration, easing: easing.settle };

type Copy = { headline: string; body: string };

/**
 * Every tier says what happens at zero, and — where money is involved — that
 * nothing has been charged. That second sentence is the actual fear.
 */
function copyFor(
  context: CountdownContext,
  tier: CountdownTier,
  remaining: number,
  alternativesCount?: number,
): Copy {
  const value = formatRemaining(remaining);

  if (context === 'quote') {
    // The quietest of the three: nothing is lost when it ends, the quote is
    // simply re-fetched. Same number, different promise, at the warning tier.
    return tier === 'comfortable'
      ? { headline: `Price held for ${value}`, body: 'This is what the owner is asking today.' }
      : {
          headline: `Price expires in ${value}`,
          body: 'When it lapses we fetch the price again. Nothing else changes.',
        };
  }

  if (context === 'ownerResponse') {
    if (tier === 'comfortable') {
      return {
        headline: 'Owner usually replies in an hour',
        body: "Nothing for you to do. We'll notify you the moment they answer.",
      };
    }
    if (tier === 'warning') {
      const minutes = Math.ceil(remaining / 60);
      return {
        headline: `Owner has ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`,
        body: "If they don't reply, your request expires and nothing is charged.",
      };
    }
    return {
      headline: `Request expires in ${value}`,
      body: alternativesCount
        ? `We've shortlisted ${alternativesCount} similar beds for you in case this lapses.`
        : 'Nothing is charged if it lapses.',
    };
  }

  // Payment: the only context where the user must act, and the only one with
  // a ring.
  if (tier === 'comfortable') {
    return {
      headline: `Pay within ${value}`,
      body: 'Your bed is held until then. Nobody else can request it.',
    };
  }
  if (tier === 'warning') {
    const minutes = Math.ceil(remaining / 60);
    return {
      headline: `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left to pay`,
      body: 'After this the bed goes back on the market. You can request it again.',
    };
  }
  return {
    headline: 'Under a minute left',
    body: 'Finish the payment or the hold releases. Nothing has been charged yet.',
  };
}

export type CountdownTimerProps = {
  context: CountdownContext;
  /** An absolute server timestamp. Never a duration. */
  deadline: string;
  /** serverNow − deviceNow, in milliseconds. */
  serverTimeOffsetMs?: number;
  /** The full window, for the payment ring. */
  totalSeconds?: number;
  /** Server-supplied count for the critical-tier owner-response copy. */
  alternativesCount?: number;
  /**
   * What the server says happened once the clock ran out. Until it confirms,
   * the component says it is checking rather than asserting an outcome.
   */
  expiredCopy?: Copy;
  onExpire?: () => void;
};

export function CountdownTimer({
  context,
  deadline,
  serverTimeOffsetMs = 0,
  totalSeconds,
  alternativesCount,
  expiredCopy,
  onExpire,
}: CountdownTimerProps) {
  const { colors, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();

  const { secondsRemaining, expired } = useCountdown(deadline, { serverTimeOffsetMs, onExpire });
  const tier = tierFor(context, secondsRemaining);

  const pop = useSharedValue(1);
  const breath = useSharedValue(1);
  const previousTier = useRef<CountdownTier>(tier);

  // The tier shift fires once, on the crossing. It never repeats, because the
  // information is "the situation just changed" and that only happens once.
  useEffect(() => {
    if (previousTier.current === tier) return;
    const crossed = previousTier.current;
    previousTier.current = tier;
    if (crossed === tier) return;

    if (!reduceMotion) {
      pop.value = withSequence(
        withTiming(signature.timerTierShift.overshoot, TIER_POP),
        withTiming(1, TIER_POP),
      );
    }

    if (tier === 'warning') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (tier === 'critical') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [tier, reduceMotion, pop]);

  // The critical breath is one of exactly two infinite animations in the app,
  // and it is a warning rather than ambience — it only runs under a minute.
  useEffect(() => {
    if (tier === 'critical' && !reduceMotion) {
      breath.value = withRepeat(
        withTiming(ambient.criticalBreath.scale[1], {
          duration: ambient.criticalBreath.duration,
          easing: easing.inOut,
        }),
        -1,
        true,
      );
    } else {
      breath.value = withTiming(1, { duration: 200 });
    }
  }, [tier, reduceMotion, breath]);

  const toneProgress = useDerivedValue(
    () => withTiming(tier === 'critical' ? 2 : tier === 'warning' ? 1 : 0, { duration: 240, easing: easing.standard }),
    [tier],
  );

  // Colour is a legibility change rather than movement, so it still runs under
  // reduced motion.
  const surfaceStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(
        toneProgress.value,
        [0, 1, 2],
        [colors.surfaceSunken, colors.warning.tint, colors.danger.tint],
      ),
      borderColor: interpolateColor(
        toneProgress.value,
        [0, 1, 2],
        [colors.border, colors.warning.borderStrong, colors.danger.border],
      ),
      transform: [{ scale: pop.value * breath.value }],
    }),
    [colors],
  );

  const ink =
    tier === 'critical' ? colors.danger.ink : tier === 'warning' ? colors.warning.ink : colors.textSecondary;

  const copy = expired
    ? (expiredCopy ?? {
        headline: 'Checking with the server',
        body: 'The clock has run out here. We are confirming what happened before we say anything else.',
      })
    : copyFor(context, tier, secondsRemaining, alternativesCount);

  return (
    <Animated.View
      accessibilityLiveRegion={tier === 'comfortable' ? 'none' : 'polite'}
      accessibilityLabel={`${copy.headline}. ${copy.body}`}
      style={[
        styles.host,
        surfaceStyle,
        { borderRadius: radius.chip, borderWidth: 1, padding: space[3], gap: space[3] },
      ]}
    >
      {/* The ring belongs to the payment window alone, because it is the only
          one the user has to act on. */}
      {context === 'payment' && totalSeconds && !expired ? (
        <CountdownRing secondsRemaining={secondsRemaining} totalSeconds={totalSeconds} />
      ) : (
        <View style={[styles.glyph, { borderRadius: radius.pill, backgroundColor: colors.surface }]}>
          <Icon name={tier === 'critical' ? 'alert' : 'clock'} size={20} color={ink} />
        </View>
      )}

      <View style={styles.flex}>
        {/* Overlapped swap: the outgoing line leaves over 100ms while the new
            one arrives from t=70, so the slot is never empty. */}
        <Animated.View
          key={copy.headline}
          entering={
            reduceMotion
              ? FadeIn.duration(120)
              : FadeIn.duration(component.numberSwap.inDuration).delay(component.numberSwap.inDelay)
          }
          exiting={reduceMotion ? FadeOut.duration(120) : FadeOut.duration(component.numberSwap.outDuration)}
        >
          <Text variant="bodyStrong" style={{ color: tier === 'comfortable' ? colors.textPrimary : ink }}>
            {copy.headline}
          </Text>
        </Animated.View>
        <Text variant="caption" color="secondary">
          {copy.body}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { flexDirection: 'row', alignItems: 'center' },
  glyph: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
});
