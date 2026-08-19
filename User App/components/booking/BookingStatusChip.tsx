import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon, Text, type IconName } from '@/components/ui';
import { easing, signature } from '@/constants/motion';
import { bookingStatus, phaseColors, type BookingStatus } from '@/constants/tokens';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { useCountdown, formatRemaining } from '@/hooks/useCountdown';
import { previewControls } from '@/services/runtimeEnv';

/**
 * One shape for all thirteen booking statuses.
 *
 * The carriers, in priority order: glyph, then label, then actor, then colour.
 * That order is the whole design — the chip has to survive greyscale, direct
 * sunlight on a cheap panel, and colour-blindness, so colour is the last thing
 * it leans on rather than the first.
 *
 * The state machine itself lives in `constants/tokens.ts`. This component
 * renders it; it does not restate it.
 */

/** The machine's glyph names, mapped to the icon set. */
const GLYPH: Record<string, IconName> = {
  clock: 'clock',
  check: 'check',
  'arrow-right-to-line': 'checkedIn',
  'arrow-left-from-line': 'checkedOut',
  circle: 'completed',
  x: 'close',
  slash: 'expired',
  'rotate-ccw': 'retry',
  'alert-triangle': 'alert',
};

const CROSSFADE = { duration: 160, easing: easing.standard };

export type BookingStatusChipProps = {
  status: BookingStatus;
  /**
   * The absolute server deadline for whichever clock this status runs.
   * Required by every `waiting` status — a waiting state with no deadline is
   * precisely what makes a product feel like it has forgotten about you.
   */
  deadline?: string;
  /**
   * The screen is already showing this booking's clock somewhere else, so the
   * chip must not draw a second one. Only one timer may be visible per screen.
   */
  timerSuppressed?: boolean;
  size?: 'sm' | 'md';
};

export function BookingStatusChip({
  status,
  deadline,
  timerSuppressed = false,
  size = 'md',
}: BookingStatusChipProps) {
  const { colors, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();

  const descriptor = bookingStatus[status];

  if (previewControls() && descriptor.phase === 'waiting' && !deadline && !timerSuppressed) {
    console.error(
      `BookingStatusChip: ${status} is a waiting state and needs either a deadline or ` +
        'timerSuppressed. A waiting state with no visible deadline is the bug this assert exists to catch.',
    );
  }

  // `from` is what is currently drawn; `status` is what it is becoming. During
  // the 160ms between them both are on screen, which is what makes the swap a
  // crossfade rather than a jump.
  const [from, setFrom] = useState(status);
  const progress = useSharedValue(1);
  const pop = useSharedValue(1);

  useEffect(() => {
    if (from === status) return;
    progress.value = 0;
    progress.value = withTiming(1, reduceMotion ? { duration: 100 } : CROSSFADE);
    const timer = setTimeout(() => setFrom(status), reduceMotion ? 100 : CROSSFADE.duration);
    return () => clearTimeout(timer);
  }, [status, from, progress, reduceMotion]);

  useEffect(() => {
    // Confirmed is the one status that gets a confirmation. Nothing else in
    // the machine celebrates.
    if (status !== 'CONFIRMED' || reduceMotion) return;
    pop.value = withSequence(
      withTiming(signature.successConfirm.overshoot, { duration: 120, easing: easing.settle }),
      withTiming(1, { duration: 120, easing: easing.settle }),
    );
  }, [status, reduceMotion, pop]);

  const fromDescriptor = bookingStatus[from];
  const fromPhase = phaseColors(colors, fromDescriptor.phase);
  const toPhase = phaseColors(colors, descriptor.phase);

  // CONFIRMED is the only filled chip in the app, so its ink is inverted.
  const filled = status === 'CONFIRMED';
  const fromFilled = from === 'CONFIRMED';

  const surfaceStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        [fromFilled ? colors.success.base : fromPhase.tint, filled ? colors.success.base : toPhase.tint],
      ),
      borderColor: interpolateColor(
        progress.value,
        [0, 1],
        [fromFilled ? colors.success.base : fromPhase.border, filled ? colors.success.base : toPhase.border],
      ),
      transform: [{ scale: pop.value }],
    }),
    [fromPhase, toPhase, filled, fromFilled, colors],
  );

  const outgoingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [1, 0, 0]),
  }));
  const incomingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0, 1]),
  }));

  /*
   * A filled chip's ink flips by mode, and white does not.
   *
   * Dark mode's status fills are lighter — white on them measures 3.26:1
   * (success) and 2.52:1 (danger), both failing. `onBrand` is white in light
   * mode and near-black in dark, which is the same problem this token exists
   * for on a primary button.
   */
  const ink = filled ? colors.onBrand : toPhase.ink;
  const fromInk = fromFilled ? colors.onBrand : fromPhase.ink;

  const showTimer = Boolean(descriptor.timer) && Boolean(deadline) && !timerSuppressed;

  return (
    <Animated.View
      accessible
      accessibilityLabel={[descriptor.label, descriptor.actor].filter(Boolean).join(' ')}
      style={[
        styles.chip,
        surfaceStyle,
        {
          borderRadius: radius.chip,
          // 1.5px marks the two statuses that need something from you.
          borderWidth: descriptor.actionable ? 1.5 : StyleSheet.hairlineWidth,
          paddingHorizontal: size === 'sm' ? space[2] : space[3],
          paddingVertical: size === 'sm' ? space[1] : 9,
          gap: space[2],
        },
      ]}
    >
      <View>
        <Animated.View style={incomingStyle}>
          <Icon name={GLYPH[descriptor.glyph] ?? 'clock'} size={16} color={ink} />
        </Animated.View>
        {from !== status ? (
          <Animated.View style={[StyleSheet.absoluteFill, outgoingStyle]}>
            <Icon name={GLYPH[fromDescriptor.glyph] ?? 'clock'} size={16} color={fromInk} />
          </Animated.View>
        ) : null}
      </View>

      <View>
        <Animated.View style={[styles.labelRow, incomingStyle, { gap: 4 }]}>
          <Text variant={size === 'sm' ? 'numMeta' : 'bodyStrong'} style={{ color: ink }}>
            {descriptor.label}
          </Text>
          {/* The actor is mandatory on both cancelled states. "Cancelled" on
              its own leaves the user guessing whether they did it. */}
          {descriptor.actor ? (
            <Text variant="numMeta" style={{ color: ink }}>
              · {descriptor.actor}
            </Text>
          ) : null}
        </Animated.View>
        {from !== status ? (
          <Animated.View style={[StyleSheet.absoluteFill, styles.labelRow, outgoingStyle, { gap: 4 }]}>
            <Text variant={size === 'sm' ? 'numMeta' : 'bodyStrong'} style={{ color: fromInk }}>
              {fromDescriptor.label}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      {showTimer ? <ChipClock deadline={deadline!} ink={ink} /> : null}
    </Animated.View>
  );
}

/**
 * The clock inside the chip.
 *
 * It is deliberately dumb: it renders what is left and nothing else. Tier
 * treatment, haptics and the terminal copy belong to `CountdownTimer`, which
 * is the component a screen uses when the deadline is the point.
 */
function ChipClock({ deadline, ink }: { deadline: string; ink: string }) {
  const { secondsRemaining } = useCountdown(deadline);
  return (
    <Text variant="numMeta" style={{ color: ink }}>
      {formatRemaining(secondsRemaining)}
    </Text>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  labelRow: { flexDirection: 'row', alignItems: 'baseline' },
});
