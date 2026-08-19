import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Button, Icon, Text } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/typography';
import type { BackendPartnerRequest } from '@/services/api/types';
import { secondsLeft } from '@/services/hooks/useStayRequests';

/**
 * A request the owner has not opened yet, made impossible to miss.
 *
 * ## Why this is louder than anything else in the app
 *
 * Every other card on this dashboard is information. This one is a deadline
 * with somebody on the other end of it: a student is watching a bar drain,
 * and in three minutes the request closes itself and tells them nobody
 * answered. An owner who scrolls past a quiet row has not made a decision —
 * they have failed to notice one was being asked for.
 *
 * So it sits above everything, it pulses, and it does not go away on its own.
 *
 * ## It disappears on OPEN, not on tap, and not on a timer
 *
 * The server stamps `seenAt` the first time the owner opens the request. This
 * renders while that is null, which means dismissing it requires actually
 * looking at what it is about. There is deliberately no close button: a
 * dismissable alert about a three-minute deadline is one that gets dismissed.
 *
 * It also vanishes by itself if the request expires or the student withdraws —
 * both leave `pending_owner`, so there is nothing left to shout about.
 *
 * ## The pulse is information, not decoration
 *
 * It tracks how much time is left rather than beating at a fixed rate, so a
 * request in its last thirty seconds is visibly more urgent than one that just
 * arrived. Motion is dropped entirely for anyone who has asked their device to
 * reduce it — the colour and the copy carry the same meaning without it.
 */

/** The last of the window, where the pulse tightens and the colour hardens. */
const CRITICAL_AT = 45;

export function UnansweredRequestAlert({
  requests,
  clockOffsetMs = 0,
}: {
  /** Pending requests. Anything already opened is filtered out here. */
  requests: BackendPartnerRequest[];
  clockOffsetMs?: number;
}) {
  const c = useColors();
  const router = useRouter();

  /* Reanimated's own hook, which `CountdownChip` already uses — one answer to
     "has this person asked for less motion" rather than two that can drift. */
  const reduceMotion = useReducedMotion();

  /* Unopened only, soonest first. `seenAt` is the server's record that this
     owner has actually looked — see the header. */
  const unopened = requests
    .filter((r) => r.status === 'pending_owner' && !r.seenAt)
    .sort((a, b) => secondsLeft(a, clockOffsetMs) - secondsLeft(b, clockOffsetMs));

  const request = unopened[0];
  const extra = unopened.length - 1;

  /* Recomputed on a tick rather than decremented, so it cannot drift and does
     not freeze while the app is backgrounded. */
  const [seconds, setSeconds] = useState(() => secondsLeft(request, clockOffsetMs));
  useEffect(() => {
    const compute = () => setSeconds(secondsLeft(request, clockOffsetMs));
    compute();
    if (!request) return undefined;
    const timer = setInterval(compute, 1000);
    return () => clearInterval(timer);
  }, [request, clockOffsetMs]);

  /*
   * One buzz per request, the first time it appears.
   *
   * Tracked by id rather than by count: an owner who answers one of three
   * should not be buzzed again for the two they already knew about.
   */
  const buzzed = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!request || buzzed.current.has(request.id)) return;
    buzzed.current.add(request.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [request]);

  const pulse = useSharedValue(0);
  const critical = seconds > 0 && seconds <= CRITICAL_AT;

  useEffect(() => {
    if (!request || reduceMotion) { pulse.value = 0; return; }
    /* Faster as the window closes — the rhythm itself says how long is left,
       which is the job the number used to do. */
    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, { duration: critical ? 700 : 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [request, critical, reduceMotion, pulse]);

  const glow = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.38, 1]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.04]) }],
  }));

  if (!request) return null;

  const tone = critical ? c.error : c.warningFill;
  const total = request.expiresAt && request.createdAt
    ? Math.max(1, Math.round(
      (Date.parse(request.expiresAt) - Date.parse(request.createdAt)) / 1000,
    ))
    : 180;
  const fraction = Math.max(0, Math.min(1, seconds / total));

  const open = () => router.push({ pathname: '/requests/[id]', params: { id: request.id } });

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      /* Read out in full, because somebody using a screen reader gets none of
         the colour or the pulse. */
      accessibilityLabel={
        `Unanswered stay request from ${request.customer?.name || 'a student'}`
        + `${request.sharing?.label ? `, ${request.sharing.label}` : ''}`
        + ` at ${request.propertyName}.`
        + `${seconds > 0 ? ` About ${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) === 1 ? '' : 's'} left to answer.` : ' Time is nearly up.'}`
        + `${extra > 0 ? ` ${extra} more waiting.` : ''}`
        + ' Opens the request.'
      }
      accessibilityLiveRegion="assertive"
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.9 : 1 }]}
    >
      {/* The pulse sits behind the card rather than on it, so the text never
          changes opacity — a label that fades in and out is hard to read and
          the point is that it is read. */}
      <Animated.View
        style={[styles.glow, { backgroundColor: tone, borderRadius: 18 }, glow]}
        pointerEvents="none"
      />

      <View style={[styles.card, { backgroundColor: tone }]}>
        <View style={styles.head}>
          <View style={styles.badge}>
            <Icon name="bell" size={13} color={tone} />
            <Text style={[styles.badgeText, { color: tone }]}>
              {critical ? 'ANSWER NOW' : 'NEW REQUEST'}
            </Text>
          </View>
          {extra > 0 ? (
            <Text style={styles.more}>+{extra} more waiting</Text>
          ) : null}
        </View>

        <Text style={styles.name}>{request.customer?.name || 'A student'}</Text>
        <Text style={styles.detail}>
          {request.sharing?.label ? `${request.sharing.label} · ` : ''}{request.propertyName}
        </Text>

        {/* The bar, not a number — the same call as the student's screen. It
            drains against the server's deadline; a digit counting down just
            teaches an owner to watch it fall. */}
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        </View>

        <Button
          label="Open request"
          variant="secondary"
          onPress={open}
          style={styles.action}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  glow: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4 },
  card: { borderRadius: 16, padding: 18, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8 },
  more: { fontFamily: fonts.semibold, fontSize: 12, color: '#FFFFFF' },
  name: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, color: '#FFFFFF', marginTop: 6 },
  detail: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: '#FFFFFF', opacity: 0.92 },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
    marginTop: 12,
  },
  fill: { height: '100%', borderRadius: 3, backgroundColor: '#FFFFFF' },
  action: { marginTop: 12, backgroundColor: '#FFFFFF' },
});
