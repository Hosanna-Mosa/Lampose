import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button, Icon, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/typography';
import { radius, shadow } from '@/constants/layout';
import { formatINR } from '@/lib/format';
import { logInfo } from '@/lib/log';
import { playRequestAlert, primeRequestSound, releaseRequestSound } from '@/services/alertSound';
import { connectRealtime, disconnectRealtime } from '@/services/realtimeSocket';
import type { BackendPartnerRequest } from '@/services/api/types';
import { formatCountdown, secondsLeft, useStayRequests } from '@/services/hooks/useStayRequests';

/**
 * A request arriving, rung and put in front of the owner as a popup — over
 * whatever screen they happen to be on.
 *
 * ## Why a native `Modal` and not an overlay View
 *
 * The first version of this rendered a bottom sheet as a sibling of the
 * `<Stack>` in the root layout, absolutely positioned over it. That is the
 * standard React trick and it is not reliable here: the navigator renders
 * through `react-native-screens`, whose screens are NATIVE views, and a native
 * view can paint over a JS sibling regardless of where it sits in the tree or
 * what its z-index says.
 *
 * `Modal` does not have that problem — the OS gives it its own window, above
 * everything the app is drawing. For an alert whose entire job is to be
 * impossible to miss, "usually on top" is not good enough.
 *
 * It also brings the Android back button with it (`onRequestClose`), which the
 * overlay had to reimplement by hand.
 *
 * ## What else was already covered, and still is
 *
 * There were two answers to "a request arrived" before this, and neither
 * reaches an owner holding the handset:
 *
 *   push (`services/push`)      a phone that is ASLEEP. Dead in Expo Go, on a
 *                               simulator, on a refused permission, and before
 *                               the first registration.
 *   `UnansweredRequestAlert`    a card, on the DASHBOARD only, and silent
 *                               apart from one haptic buzz.
 *
 * So an owner anywhere else in the app — bookings, a customer record, their
 * own settings — got a request with three minutes on it and no signal at all.
 *
 * ## App-channel requests only
 *
 * A website enquiry is answered on WhatsApp and the owner has twenty-four
 * hours; it carries no `channel`, no `expiresAt` and no `seenAt`, so a
 * countdown drawn for one is a bar that is empty from the moment it appears.
 * Those keep the quiet path — the banner and the inbox. A popup that has to be
 * dismissed is for the three-minute deadline, which is the app channel.
 *
 * ## It rings once per request, and never for one already opened
 *
 * `seenAt` is the server's record that this owner has looked. It is stamped
 * ONLY by the request-detail read (`portfolio.controller.js`), never by the
 * list poll, so it cannot be cleared out from under this by polling. Ringing
 * is keyed on the request id, so an owner who answers one of three is not rung
 * again for the two they already knew about.
 */

/** The last of the window, where the copy hardens and the bar goes red. */
const CRITICAL_AT = 45;

/** "3 months · from 5 Sep 2026", or as much of it as the student actually said. */
function stayLine(request: BackendPartnerRequest): string | null {
  const intent = request.intent;
  if (!intent) return null;

  const parts: string[] = [];
  if (intent.duration && intent.durationUnit) {
    const unit = intent.durationUnit === 'days' ? 'night' : 'month';
    parts.push(`${intent.duration} ${unit}${intent.duration === 1 ? '' : 's'}`);
  }
  if (intent.joiningDate) {
    const [y, m, d] = intent.joiningDate.split('-').map(Number);
    if (y && m && d) {
      const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      parts.push(`${intent.flexibleJoin ? 'around ' : 'from '}${d} ${names[m - 1]} ${y}`);
    }
  }
  return parts.length ? parts.join(' · ') : null;
}

export function IncomingRequestAlert() {
  const { status } = useAuth();
  const router = useRouter();
  const c = useColors();

  /*
   * Mounted at the root, which is what makes the poll app-wide.
   *
   * Same query key as the dashboard's and the tab badge's, so this is not a
   * third request every few seconds — react-query dedupes them onto one.
   */
  const { groups, clockOffset } = useStayRequests();

  /* Rung once each, by id. A Set rather than a count — see the header. */
  const rung = useRef<Set<string>>(new Set());
  /* Put away by hand. Also by id, or the next poll brings it straight back. */
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  /* Decoded at sign-in so the first request plays immediately rather than
     while a three-minute countdown is already running. */
  useEffect(() => {
    if (status !== 'signedIn') return undefined;
    primeRequestSound();
    return () => releaseRequestSound();
  }, [status]);

  /*
   * The live line, opened and closed with the session — mirroring the sound
   * priming right above it. Mounted here rather than in `_layout.tsx` because
   * this component is already the one root-level thing that reacts to
   * `status`, and a second place session-scoped services get wired is a
   * second place one of them can be forgotten.
   */
  useEffect(() => {
    if (status !== 'signedIn') return undefined;
    connectRealtime();
    return () => disconnectRealtime();
  }, [status]);

  /*
   * Unopened, still waiting, still answerable here — soonest deadline first,
   * so the one shown is always the one closest to closing.
   *
   * There is deliberately NO check on which screen the owner is on. An earlier
   * version suppressed itself anywhere under `/requests`, which sounded tidy
   * and meant the popup silently never appeared for an owner who happened to
   * be sitting on that tab. A rule that hides the alert is a rule that will
   * hide it at the wrong moment.
   */
  const waiting = groups.pending
    .filter((r) => r.channel === 'app' && !r.seenAt && !dismissed.has(r.id))
    .sort((a, b) => secondsLeft(a, clockOffset.current) - secondsLeft(b, clockOffset.current));

  const request = status === 'signedIn' ? waiting[0] : undefined;
  const extra = waiting.length - 1;

  /* Ring for anything newly waiting, even while the popup is showing something
     else — the sound is per request, not per popup. */
  /*
   * Keyed on the IDS, not on the array.
   *
   * `groups.pending` is rebuilt by `useStayRequests` on every render, so a
   * dependency on the array itself re-ran this body every single render —
   * harmless only because `rung` happens to guard it. The ids are the thing
   * that actually changes when a request arrives.
   */
  const pendingKey = groups.pending.map((r) => r.id).join(',');

  useEffect(() => {
    if (status !== 'signedIn') return;
    const fresh = groups.pending.filter(
      (r) => r.channel === 'app' && !r.seenAt && !rung.current.has(r.id),
    );
    if (!fresh.length) return;
    fresh.forEach((r) => rung.current.add(r.id));
    /* One line, so "why did nothing pop up" is answerable from the Metro
       console rather than by guessing. */
    logInfo(`[request-alert] ${fresh.length} new request(s): ${fresh.map((r) => r.id).join(', ')}`);
    playRequestAlert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pendingKey` IS the dependency; the array it derives from changes identity every render
  }, [pendingKey, status]);

  /* Recomputed on a tick rather than decremented, so it cannot drift and does
     not freeze while the app is backgrounded. */
  /*
   * Keyed on the id and the DEADLINE, not on the request object.
   *
   * react-query hands back a fresh object on every poll, so depending on
   * `request` tore this interval down and rebuilt it every few seconds. The
   * deadline is the only part of the request the countdown reads, and it does
   * not change for a given id — so this now runs once per request and ticks
   * cleanly until it is answered.
   */
  const deadline = request?.expiresAt ?? null;
  const requestId = request?.id ?? null;

  const [seconds, setSeconds] = useState(() => secondsLeft(request, clockOffset.current));
  useEffect(() => {
    const compute = () => setSeconds(secondsLeft(request, clockOffset.current));
    compute();
    if (!requestId) return undefined;
    const timer = setInterval(compute, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id + deadline fully determine the countdown; `request` changes identity on every poll
  }, [requestId, deadline, clockOffset]);

  const close = useCallback(() => {
    if (!request) return;
    setDismissed((prev) => new Set(prev).add(request.id));
  }, [request]);

  const open = useCallback(() => {
    if (!request) return;
    /* Dismissed on the way out: the server stamps `seenAt` when the detail
       screen loads, but that is a poll away, and the popup must not still be
       up when they get back. */
    const id = request.id;
    setDismissed((prev) => new Set(prev).add(id));
    router.push({ pathname: '/requests/[id]', params: { id } });
  }, [request, router]);

  const critical = seconds > 0 && seconds <= CRITICAL_AT;
  const tone = critical ? c.error : c.warningFill;

  const total = request?.expiresAt && request?.createdAt
    ? Math.max(1, Math.round((Date.parse(request.expiresAt) - Date.parse(request.createdAt)) / 1000))
    : 180;
  const fraction = Math.max(0, Math.min(1, seconds / total));

  const stay = request ? stayLine(request) : null;
  const amount = request?.intent?.totalAmount ?? request?.sharing?.price ?? null;

  return (
    <Modal
      /* `visible` rather than mounting the Modal conditionally: the OS window
         is created once and shown, which is what lets the fade actually play
         instead of the whole thing appearing a frame late. */
      visible={Boolean(request)}
      transparent
      /*
       * The OS's own fade, not Reanimated's.
       *
       * This used to wrap the content in `Animated.View`s with `entering`/
       * `exiting` — react-native-reanimated's layout animations inside RN's
       * native `Modal` are a known crash source on Android/Fabric (the Modal
       * tears down its own native surface at the same moment an `exiting`
       * animation is mid-flight against shadow nodes on it — see
       * software-mansion/react-native-reanimated#6908, #4422). That is
       * exactly this app's combination (Reanimated 4, New Architecture, a
       * native `Modal`), and this popup closes at the exact moment `request`
       * flips to another value or to nothing — "Not now", "View request",
       * and the next poll all do it. `animationType="fade"` gets the same
       * fade with none of that risk.
       */
      animationType="fade"
      statusBarTranslucent
      /* Android's back button. Dismisses the popup rather than the app. */
      onRequestClose={close}
    >
      {request ? (
        <View style={styles.root}>
          {/* Tapping the scrim dismisses, same as "Not now". */}
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />

          <View
            accessibilityViewIsModal
            accessibilityLiveRegion="assertive"
            style={[styles.card, shadow.sheet, { backgroundColor: c.surface }]}
          >
            <View style={[styles.banner, { backgroundColor: tone }]}>
              <Icon name="bell" size={15} color="#FFFFFF" />
              <Text style={styles.bannerText}>
                {critical ? 'ANSWER NOW' : 'NEW BOOKING REQUEST'}
              </Text>
              {extra > 0 ? <Text style={styles.bannerMore}>+{extra} more</Text> : null}
            </View>

            <View style={styles.body}>
              <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>
                {request.customer?.name || 'A student'}
              </Text>
              <Text variant="bodySm" color="textSecondary" style={styles.sub} numberOfLines={2}>
                wants to stay at {request.propertyName}
              </Text>

              <View style={[styles.details, { backgroundColor: c.surfaceSunken }]}>
                {request.sharing?.label ? <Row label="Room type" value={request.sharing.label} /> : null}
                {stay ? <Row label="Stay" value={stay} /> : null}
                {typeof amount === 'number' && amount > 0 ? (
                  <Row label="Amount" value={formatINR(amount)} />
                ) : null}
                {request.customer?.phone ? <Row label="Phone" value={request.customer.phone} /> : null}
              </View>

              {/* The bar, not a digit — the same call the dashboard alert
                  makes. A number counting down just teaches an owner to watch
                  it fall. The figure is there beside it for the one question
                  the bar cannot answer: how long, exactly. */}
              <View style={styles.clockRow}>
                <Text style={[styles.clockLabel, { color: tone }]}>
                  {seconds > 0 ? 'Time left to answer' : 'Time is up'}
                </Text>
                <Text style={[styles.clockValue, { color: tone }]}>{formatCountdown(seconds)}</Text>
              </View>
              <View style={[styles.track, { backgroundColor: c.border }]}>
                <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: tone }]} />
              </View>

              <View style={styles.actions}>
                <Button label="Not now" variant="secondary" onPress={close} style={styles.flex} />
                <Button label="View request" onPress={open} style={styles.flex} />
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

/** A label/value line. Not `DetailRow`, which draws a divider per row and is
    built for a card rather than for four lines inside a popup. */
function Row({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={styles.row}>
      <Text variant="caption" color="textTertiary" style={styles.rowLabel}>
        {label}
      </Text>
      <Text style={[styles.rowValue, { color: c.textPrimary }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.sheet, overflow: 'hidden' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  bannerText: { flex: 1, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: '#FFFFFF' },
  bannerMore: { fontFamily: fonts.semibold, fontSize: 11, color: '#FFFFFF', opacity: 0.9 },
  body: { padding: 18, paddingTop: 16 },
  name: { fontFamily: fonts.extrabold, fontSize: 22, lineHeight: 28 },
  sub: { lineHeight: 19, marginTop: 2 },
  details: { borderRadius: radius.chip, paddingHorizontal: 12, paddingVertical: 4, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 7 },
  rowLabel: { width: 82 },
  rowValue: { flex: 1, fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 18, textAlign: 'right' },
  clockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  clockLabel: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8 },
  clockValue: { fontFamily: fonts.bold, fontSize: 13 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 7 },
  fill: { height: '100%', borderRadius: 3 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  flex: { flex: 1 },
});
