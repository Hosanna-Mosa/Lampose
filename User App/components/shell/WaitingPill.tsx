import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { useCountdown, formatRemaining } from '@/hooks/useCountdown';
import { SCREEN_WAIT_SECONDS } from '@/types/request';

/**
 * The live request, following the student around the app.
 *
 * A request runs for three minutes and then cancels itself. Anyone who leaves
 * the confirmation screen in that window — to compare one more place, which is
 * exactly what they will do — needs a way back that does not depend on
 * remembering which listing it was.
 *
 * ## A floating pill, not a banner
 *
 * It sits over the content rather than in the layout. A banner pinned under the
 * header would push every screen in the app down by its own height for three
 * minutes, which is a permanent structural change in service of a temporary
 * affordance — and it would collide with the photo header on the listing
 * screen, which has no header bar to sit under.
 *
 * The cost of floating is that it covers the bottom of whatever is behind it.
 * That is handled by `reservedBottom`: a screen with pinned bottom chrome
 * declares its height and the pill sits above it.
 *
 * ## It never carries a digit
 *
 * The confirmation screen deliberately has no clock — a countdown turns a wait
 * into a test. Putting "1:42" on a pill the student cannot leave behind would
 * reintroduce exactly that pressure, everywhere, with no way to escape it. So
 * the pill carries the same draining bar and nothing else. The remaining time
 * is still announced to assistive technology.
 *
 * ## It can be dragged out of the way
 *
 * It floats over content, so sooner or later it covers the one thing somebody
 * is trying to read. The answer is to let them move it rather than to guess
 * where it will not be in the way: drag it up the screen and it stays where it
 * is dropped, for as long as the request lives.
 *
 * Vertical only. The pill is full width, so there is nowhere for it to go
 * sideways, and a free-floating bar that can be flung into a corner is a bar
 * that ends up half off the screen.
 *
 * Travel is clamped to the window, so it can never be dragged behind the status
 * bar or under the tab bar it was placed above. The drag needs 10 points of
 * movement before it takes over, which leaves an ordinary tap free to open the
 * request.
 *
 * ## It never disappears silently
 *
 * Vanishing is indistinguishable from a bug, and the student is owed the
 * outcome. When the request is accepted or cancelled the pill stays and says
 * so. Only the cancelled one can be dismissed: a live request and an unpaid
 * confirmation are both things that have to be acted on, and a swipe-away is
 * how somebody loses a bed.
 */

/** Screens that are already about the request. A pill here would point at itself. */
const HIDDEN_ON = ['/confirm/', '/booked/'];

export function WaitingPill() {
  const { colors, space, radius, elevation, touch } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const reduceMotion = useReduceMotion();

  const { request, settle, clear, reservedBottom } = usePendingRequest();
  const { height: windowHeight } = useWindowDimensions();

  /* Where the student has dragged it to, as an offset from its resting place.
     Negative is up the screen; zero is where it started. */
  const dragged = useSharedValue(0);
  const start = useSharedValue(0);

  const resting = (reservedBottom || insets.bottom) + space[3];
  /* Everything between the status bar and the resting position is fair game. */
  const highest = -(windowHeight - insets.top - resting - 96);

  const pan = Gesture.Pan()
    .minDistance(10)
    .onBegin(() => {
      start.value = dragged.value;
    })
    .onChange((event) => {
      dragged.value = Math.min(0, Math.max(highest, start.value + event.translationY));
    })
    .onEnd(() => {
      // Springs back only if the clamp was overshot mid-gesture; otherwise it
      // stays exactly where it was let go. A pill that snaps home after every
      // drag is a pill that cannot be moved.
      dragged.value = withSpring(Math.min(0, Math.max(highest, dragged.value)), {
        damping: 20,
        stiffness: 180,
      });
    });

  const draggedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragged.value }] }));

  /* A different request is a different pill. It starts where pills start. */
  React.useEffect(() => {
    dragged.value = 0;
  }, [request?.listingId, dragged]);

  const waiting = request?.status === 'waiting';

  const { secondsRemaining } = useCountdown(request?.deadline, {
    paused: !waiting,
    // The clock runs in the provider's lifetime, not the screen's, so a request
    // left behind still ends on time and still ends visibly.
    onExpire: () => settle('cancelled'),
  });

  if (!request) return null;
  if (HIDDEN_ON.some((prefix) => pathname.startsWith(prefix))) return null;

  const accepted = request.status === 'accepted';
  const cancelled = request.status === 'cancelled';

  const tint = accepted
    ? colors.success.tint
    : cancelled
      ? colors.warning.tint
      : colors.surface;
  const edge = accepted
    ? colors.success.border
    : cancelled
      ? colors.warning.border
      : colors.success.border;

  const title = accepted
    ? `${request.owner} confirmed — tap to finish`
    : cancelled
      ? 'Request cancelled — no answer'
      : `Waiting for ${request.owner}`;

  const open = () => {
    if (cancelled) return;
    router.push({
      pathname: '/confirm/[id]',
      params: { id: request.listingId, ...request.params },
    } as never);
  };

  return (
    <Animated.View
      // `box-none` on the host so the pill is tappable but the strip of screen
      // either side of it is not — the feed underneath still scrolls.
      pointerEvents="box-none"
      entering={reduceMotion ? undefined : FadeInDown.duration(240)}
      exiting={reduceMotion ? undefined : FadeOutDown.duration(180)}
      style={[styles.host, draggedStyle, { bottom: resting, paddingHorizontal: space[4] }]}
    >
      <GestureDetector gesture={pan}>
        <Pressable
          onPress={open}
          disabled={cancelled}
          accessibilityRole={cancelled ? 'text' : 'button'}
          accessibilityLabel={
            waiting ? `${title}. ${formatRemaining(secondsRemaining)} left. Opens the request.` : title
          }
          style={({ pressed }) => [
            elevation.float,
            styles.pill,
            {
              minHeight: touch.min,
              paddingLeft: space[4],
              paddingRight: cancelled ? space[2] : space[4],
              paddingVertical: space[2],
              gap: space[3],
              borderRadius: radius.pill,
              backgroundColor: tint,
              borderColor: edge,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.dot,
              {
                backgroundColor: cancelled ? colors.warning.base : colors.brand,
                borderRadius: radius.pill,
              },
            ]}
          />

          <View style={styles.flex}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {title}
            </Text>
            {/* The draining bar, at pill scale. Only while there is something to
                drain — once answered the bar would be a clock with no meaning. */}
            {waiting ? (
              <View
                style={[
                  styles.track,
                  { backgroundColor: colors.surfaceSunken, borderRadius: radius.pill, marginTop: 4 },
                ]}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.max(0, Math.min(1, secondsRemaining / SCREEN_WAIT_SECONDS)) * 100}%`,
                      backgroundColor: secondsRemaining <= 30 ? colors.warning.base : colors.brand,
                      borderRadius: radius.pill,
                    },
                  ]}
                />
              </View>
            ) : null}
          </View>

          {/* Only a dead request offers a way to get rid of it. */}
          {cancelled ? (
            <Pressable
              onPress={clear}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              hitSlop={space[3]}
              style={styles.dismiss}
            >
              <Icon name="close" size={20} color={colors.textTertiary} />
            </Pressable>
          ) : (
            <Icon name="chevronRight" size={20} color={colors.textSecondary} />
          )}
        </Pressable>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0 },
  pill: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  dot: { width: 8, height: 8 },
  track: { height: 3, overflow: 'hidden' },
  fill: { height: '100%' },
  dismiss: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
