import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Text } from './Text';
import { Icon } from './Icon';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** calm > 6h · warning 1–6h · critical < 1h · expired at zero. */
export type Urgency = 'calm' | 'warning' | 'critical' | 'expired';

export function urgencyOf(msLeft: number): Urgency {
  if (msLeft <= 0) return 'expired';
  if (msLeft < HOUR) return 'critical';
  if (msLeft < 6 * HOUR) return 'warning';
  return 'calm';
}

/** "1d 6h left" · "3h 10m left" · "42m left" */
export function formatLeft(msLeft: number): string {
  if (msLeft <= 0) return 'Expired';
  const d = Math.floor(msLeft / DAY);
  const h = Math.floor((msLeft % DAY) / HOUR);
  const m = Math.floor((msLeft % HOUR) / MINUTE);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${Math.max(m, 1)}m left`;
}

/**
 * Live countdown to a request's expiry, ramping neutral → amber → red so an
 * owner scanning the inbox can't miss what's about to lapse. The red stage adds
 * an expanding halo, which is the one place in the app anything pulses.
 */
export function CountdownChip({
  expiresAt,
  size = 'sm',
  /** Drops the chip background, as the expired row in the inbox does. */
  bare = false,
}: {
  expiresAt: number;
  size?: 'sm' | 'md';
  bare?: boolean;
}) {
  const c = useColors();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const msLeft = expiresAt - now;
  const urgency = urgencyOf(msLeft);
  const expired = urgency === 'expired';

  const skin: Record<Urgency, { bg: string; fg: string }> = {
    calm: { bg: c.surfaceSunken, fg: c.textSecondary },
    // The design sets amber text on amber tint at 3.68:1; darkened to clear AA.
    warning: { bg: c.warningTint, fg: c.warningOnTint },
    critical: { bg: c.errorTint, fg: c.error },
    expired: { bg: c.borderSubtle, fg: c.textTertiary },
  };
  const s = skin[urgency];

  const dims =
    size === 'md'
      ? { padV: 7, padH: 12, radius: 16, font: 12.5, icon: 13, stroke: 2 }
      : { padV: 5, padH: 10, radius: 14, font: 11.5, icon: 11, stroke: 2.5 };

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={expired ? 'Request expired' : `${formatLeft(msLeft)} to respond`}
      style={[
        styles.chip,
        {
          paddingVertical: dims.padV,
          paddingHorizontal: bare ? 0 : dims.padH,
          borderRadius: dims.radius,
          backgroundColor: bare ? 'transparent' : s.bg,
        },
      ]}
    >
      {urgency === 'critical' ? <PulseHalo color={c.error} radius={dims.radius} /> : null}
      <Icon
        name={expired ? 'close' : 'clock'}
        size={dims.icon}
        color={s.fg}
        strokeWidth={dims.stroke}
      />
      <Text style={{ fontFamily: fonts.bold, fontSize: dims.font, lineHeight: dims.font + 5, color: s.fg }}>
        {formatLeft(msLeft)}
      </Text>
    </View>
  );
}

/**
 * The design's `pulseRing` is an expanding box-shadow. React Native can't
 * animate shadow spread, so this is a sibling layer that scales out and fades —
 * same read, and it honours the reduce-motion setting.
 */
function PulseHalo({ color, radius }: { color: string; radius: number }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    progress.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: (1 - progress.value) * 0.35,
    transform: [{ scale: 1 + progress.value * 0.28 }],
  }));

  if (reduced) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
});
