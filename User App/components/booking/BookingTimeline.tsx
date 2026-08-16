import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Icon, Text, type IconName } from '@/components/ui';
import { component, easing } from '@/constants/motion';
import { bookingStatus, type BookingStatus } from '@/constants/tokens';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import type { TimelineStep, TimelineStepId } from '@/types/booking';

/**
 * Requested → Accepted → Paid → Moved in.
 *
 * When something fails, the line terminates at the node where it happened and
 * the remaining connectors become a dashed grey stub. The path is not erased:
 * the user can still see how far they got and what did not happen, which is
 * the question they are actually asking.
 *
 * A failed payment is the exception, because it is recoverable — that node
 * takes a retry glyph and its connector stays live rather than dashing out.
 */

const ORDER: readonly TimelineStepId[] = ['requested', 'accepted', 'paid', 'movedIn'];

const DEFAULT_LABELS: Record<TimelineStepId, string> = {
  requested: 'Requested',
  accepted: 'Accepted',
  paid: 'Paid',
  movedIn: 'Moved in',
};

/** How far the happy path has got, and whether it stopped. */
function progressFor(status: BookingStatus): { reached: number; stopped: boolean; retry: boolean } {
  switch (status) {
    case 'REQUESTED':
      return { reached: 0, stopped: false, retry: false };
    case 'ACCEPTED':
    case 'PAYMENT_PENDING':
      return { reached: 1, stopped: false, retry: false };
    case 'PAYMENT_FAILED':
      // Recoverable, so the line stays live.
      return { reached: 1, stopped: false, retry: true };
    case 'CONFIRMED':
      return { reached: 2, stopped: false, retry: false };
    case 'CHECKED_IN':
    case 'CHECKED_OUT':
    case 'COMPLETED':
      return { reached: 3, stopped: false, retry: false };
    case 'REJECTED':
    case 'EXPIRED':
    case 'CANCELLED_BY_CUSTOMER':
    case 'CANCELLED_BY_OWNER':
      return { reached: 0, stopped: true, retry: false };
    case 'DISPUTED':
      return { reached: 3, stopped: true, retry: false };
  }
}

export type BookingTimelineProps = {
  status: BookingStatus;
  steps?: readonly TimelineStep[];
};

export function BookingTimeline({ status, steps = [] }: BookingTimelineProps) {
  const { colors, space } = useTheme();
  const reduceMotion = useReduceMotion();
  const { reached, stopped, retry } = progressFor(status);
  const descriptor = bookingStatus[status];

  const previousReached = useRef(reached);
  useEffect(() => {
    // Only the confirmation gets a haptic. One per booking, not one per step.
    if (status === 'CONFIRMED' && previousReached.current !== reached) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    previousReached.current = reached;
  }, [status, reached]);

  const headline = stopped
    ? `${descriptor.label}${descriptor.actor ? ` ${descriptor.actor}` : ''}`
    : DEFAULT_LABELS[ORDER[Math.min(reached, ORDER.length - 1)]];

  const body = stopped
    ? status === 'EXPIRED'
      ? 'The request timed out before the owner answered. Nothing was charged.'
      : status === 'DISPUTED'
        ? 'Someone from LAMPOSE is looking at this. Your deposit is not released while it is open.'
        : 'Nothing was charged. The beds you shortlisted are still there.'
    : retry
      ? 'The payment did not go through, but your bed is still held. You can try again.'
      : 'Each step is confirmed by the server before it appears here.';

  return (
    <View style={{ gap: space[3] }}>
      <View style={styles.track}>
        {ORDER.map((id, index) => {
          const step = steps.find((candidate) => candidate.id === id);
          const done = index <= reached;
          const isRetry = retry && index === 2;
          return (
            <React.Fragment key={id}>
              {index > 0 ? (
                <Connector
                  filled={index <= reached}
                  dashed={stopped && index > reached}
                  index={index}
                  reduceMotion={reduceMotion}
                />
              ) : null}
              <Node
                label={step?.label ?? DEFAULT_LABELS[id]}
                timestamp={step?.timestamp}
                done={done}
                current={index === reached && !stopped}
                retry={isRetry}
                stopped={stopped && index > reached}
                reduceMotion={reduceMotion}
              />
            </React.Fragment>
          );
        })}
      </View>

      <View style={{ gap: 2 }}>
        <Text variant="title3" style={stopped ? { color: colors.textSecondary } : undefined}>
          {headline}
        </Text>
        <Text variant="caption" color="secondary">
          {body}
        </Text>
      </View>
    </View>
  );
}

function Connector({
  filled,
  dashed,
  index,
  reduceMotion,
}: {
  filled: boolean;
  dashed: boolean;
  index: number;
  reduceMotion: boolean;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  // Fixed-width and scaled, never an animated width.
  const progress = useDerivedValue(
    () =>
      reduceMotion
        ? filled
          ? 1
          : 0
        : withDelay(
            index * 40,
            withTiming(filled ? 1 : 0, { duration: component.timelineAdvance.connector, easing: easing.enter }),
          ),
    [filled, reduceMotion, index],
  );

  const fillStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateX: -width / 2 }, { scaleX: progress.value }, { translateX: width / 2 }],
    }),
    [width],
  );

  const handleLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View onLayout={handleLayout} style={[styles.connector, { backgroundColor: colors.border }]}>
      {/* A stopped path is a dashed stub rather than a deletion — the user can
          see how far they got. */}
      {dashed ? (
        <View style={[StyleSheet.absoluteFill, styles.dashRow]}>
          {[0, 1, 2, 3].map((dash) => (
            <View key={dash} style={{ width: 4, height: 2, backgroundColor: colors.textTertiary }} />
          ))}
        </View>
      ) : (
        <Animated.View
          style={[fillStyle, { width, height: 2, backgroundColor: colors.brand }]}
        />
      )}
    </View>
  );
}

function Node({
  label,
  timestamp,
  done,
  current,
  retry,
  stopped,
  reduceMotion,
}: {
  label: string;
  timestamp?: string;
  done: boolean;
  current: boolean;
  retry: boolean;
  stopped: boolean;
  reduceMotion: boolean;
}) {
  const { colors, space, radius } = useTheme();

  const progress = useDerivedValue(
    () =>
      reduceMotion
        ? done
          ? 1
          : 0
        : withDelay(
            component.timelineAdvance.nodeDelay,
            withTiming(done ? 1 : 0, { duration: 240, easing: easing.settle }),
          ),
    [done, reduceMotion],
  );

  const discStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 0.6 + progress.value * 0.4 }],
    opacity: reduceMotion ? (done ? 1 : 0.45) : 0.45 + progress.value * 0.55,
  }));

  const glyph: IconName = retry ? 'retry' : done ? 'check' : 'completed';
  const fill = retry ? colors.danger.base : done ? colors.brand : colors.surfaceSunken;
  // The disc is filled with brand or danger, both of which flip legibility
  // between modes. `onBrand` is white in light, near-black in dark.
  const ink = done || retry ? colors.onBrand : colors.textTertiary;

  return (
    <View style={styles.node}>
      <Animated.View
        style={[
          styles.disc,
          discStyle,
          { borderRadius: radius.pill, backgroundColor: fill, borderColor: colors.border },
        ]}
      >
        <Icon name={glyph} size={16} color={ink} />
      </Animated.View>
      <Text
        variant={current ? 'bodyStrong' : 'numMeta'}
        color={done ? 'primary' : stopped ? 'tertiary' : 'secondary'}
        numberOfLines={1}
        style={{ marginTop: space[1] }}
      >
        {label}
      </Text>
      {timestamp && done ? (
        <Text variant="numMeta" color="tertiary" numberOfLines={1}>
          {timestamp}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'flex-start' },
  connector: { flex: 1, height: 2, marginTop: 13, overflow: 'hidden' },
  dashRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  node: { alignItems: 'center', width: 74 },
  disc: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
