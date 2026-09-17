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
 * Requested → Accepted → Paid → Moved in — on the categories that take a
 * payment. Requested → Accepted → Moved in on the ones that do not.
 *
 * ## Why the track is not fixed
 *
 * "Paid" was a permanent node, and for three of the four categories nothing
 * ever lands on it: a PG, a co-live and a hotel request are free, the money
 * moves between the student and the owner directly, and Lampose is never told.
 * So a confirmed PG booking drew a step called "Paid" that was reached — the
 * old `progressFor` sent `CONFIRMED` to index 2 regardless — telling somebody
 * they had paid us for something they had not, on the screen they would open
 * in a dispute about exactly that.
 *
 * A bachelor room DOES take a payment: ₹199 for the assisted visit, verified
 * by the server. There the node is real and it belongs on the track.
 *
 * `showPaid` is passed in rather than derived from the status, because the
 * status cannot answer it: `CONFIRMED` means the same thing on both tracks and
 * only the CATEGORY knows whether money was involved.
 *
 * ## Failure
 *
 * When something fails, the line terminates at the node where it happened and
 * the remaining connectors become a dashed grey stub. The path is not erased:
 * the user can still see how far they got and what did not happen, which is
 * the question they are actually asking.
 *
 * A failed payment is the exception, because it is recoverable — that node
 * takes a retry glyph and its connector stays live rather than dashing out.
 */

const PAID_ORDER: readonly TimelineStepId[] = ['requested', 'accepted', 'paid', 'movedIn'];
const FREE_ORDER: readonly TimelineStepId[] = ['requested', 'accepted', 'movedIn'];

const DEFAULT_LABELS: Record<TimelineStepId, string> = {
  requested: 'Requested',
  accepted: 'Accepted',
  paid: 'Paid',
  movedIn: 'Moved in',
};

/**
 * How far the happy path has got, named rather than numbered.
 *
 * A stage rather than an index, because the two tracks have different lengths
 * and an index computed against one is meaningless against the other. The
 * caller turns the stage into a position in ITS order — and a stage the order
 * does not contain falls back to the nearest earlier one, which is what puts a
 * `CONFIRMED` free booking on "Accepted" instead of off the end of a
 * three-node track.
 */
function progressFor(status: BookingStatus): {
  stage: TimelineStepId;
  stopped: boolean;
  retry: boolean;
} {
  switch (status) {
    case 'REQUESTED':
      return { stage: 'requested', stopped: false, retry: false };
    case 'ACCEPTED':
    case 'PAYMENT_PENDING':
      return { stage: 'accepted', stopped: false, retry: false };
    case 'PAYMENT_FAILED':
      // Recoverable, so the line stays live.
      return { stage: 'accepted', stopped: false, retry: true };
    case 'CONFIRMED':
      /* On a paying category this IS the paid step. On a free one there is no
         such step and the fallback below lands it on "Accepted", which is the
         truth: an owner said yes and no money moved. */
      return { stage: 'paid', stopped: false, retry: false };
    case 'CHECKED_IN':
    case 'CHECKED_OUT':
    case 'COMPLETED':
      return { stage: 'movedIn', stopped: false, retry: false };
    case 'REJECTED':
    case 'EXPIRED':
    case 'CANCELLED_BY_CUSTOMER':
    case 'CANCELLED_BY_OWNER':
      return { stage: 'requested', stopped: true, retry: false };
    case 'DISPUTED':
      return { stage: 'movedIn', stopped: true, retry: false };
  }
}

export type BookingTimelineProps = {
  status: BookingStatus;
  steps?: readonly TimelineStep[];
  /**
   * Does this category take a payment through Lampose?
   *
   * Bachelor rooms do — the ₹199 assisted visit. PG, co-live and hotel do not,
   * and drawing them a "Paid" node states something untrue about their money.
   * Defaults to false: a caller that has not been told the category must not
   * assert a payment.
   */
  showPaid?: boolean;
};

export function BookingTimeline({ status, steps = [], showPaid = false }: BookingTimelineProps) {
  const { colors, space } = useTheme();
  const reduceMotion = useReduceMotion();
  const order = showPaid ? PAID_ORDER : FREE_ORDER;
  const { stage, stopped, retry } = progressFor(status);

  /* The stage's position on THIS track. A stage the track omits — `paid` on a
     free booking — steps back to the last one it does have, so progress is
     never lost and never overstated. */
  const reached = (() => {
    const exact = order.indexOf(stage);
    if (exact !== -1) return exact;
    const fallback = PAID_ORDER.indexOf(stage);
    for (let i = fallback - 1; i >= 0; i -= 1) {
      const earlier = order.indexOf(PAID_ORDER[i]);
      if (earlier !== -1) return earlier;
    }
    return 0;
  })();

  const descriptor = bookingStatus[status];

  const previousReached = useRef(reached);
  useEffect(() => {
    // Only the confirmation gets a haptic. One per booking, not one per step.
    if (status === 'CONFIRMED' && previousReached.current !== reached) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    previousReached.current = reached;
  }, [status, reached]);

  const NEXT_STEP_LABELS: Record<TimelineStepId, string> = {
    requested: 'Submit Request',
    accepted: 'Owner Acceptance',
    paid: 'Payment',
    movedIn: 'Move in',
  };

  const hasNextStep = !stopped && reached < order.length - 1;
  const nextStepId = hasNextStep ? order[reached + 1] : null;

  const headline = stopped
    ? `${descriptor.label}${descriptor.actor ? ` ${descriptor.actor}` : ''}`
    : hasNextStep && nextStepId
      ? `Next step: ${NEXT_STEP_LABELS[nextStepId] ?? DEFAULT_LABELS[nextStepId]}`
      : 'All steps completed';

  const body = stopped
    ? status === 'EXPIRED'
      ? 'The request timed out before the owner answered. Nothing was charged.'
      : status === 'DISPUTED'
        ? 'Someone from LAMPOSE is looking at this. Your deposit is not released while it is open.'
        : 'Nothing was charged. The beds you shortlisted are still there.'
    : retry
      ? 'The payment did not go through, but your bed is still held. You can try again.'
      : hasNextStep && nextStepId
        ? nextStepId === 'movedIn'
          ? 'Show your move-in PIN to the owner once you reach your room.'
          : nextStepId === 'paid'
            ? 'Complete your payment to lock your room and get your move-in pass.'
            : 'Waiting for the owner to confirm your booking request.'
        : 'You have completed all steps and checked in.';

  return (
    <View style={{ gap: space[3] }}>
      <View style={styles.track}>
        {order.map((id, index) => {
          const step = steps.find((candidate) => candidate.id === id);
          const done = index <= reached;
          /* The retry glyph belongs on the PAID node, wherever it sits — it
             was pinned to index 2, which is "Moved in" on a three-node
             track. */
          const isRetry = retry && id === 'paid';
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
