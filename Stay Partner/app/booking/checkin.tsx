import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Icon,
  OTPInput,
  Toast,
  EmptyState,
} from '@/components/ui';
import { useBooking, useBookingActions } from '@/services/hooks/useBookings';
import { ApiError } from '@/services/api/client';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * The entry PIN is SIX digits.
 *
 * `otp.util.js` mints it as `LV-` plus `randomInt(0, 1000000)` padded to six,
 * and both the request screen and the student's app render those six. This
 * screen asked for FOUR, so the real code could not be typed into it at all —
 * and the check below then accepted any four digits, which meant the box was
 * decoration and anybody could be marked in. Both halves of that are fixed
 * here: six boxes, and a comparison that actually compares.
 */
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 3;
/** How long the guest's code stays valid once this screen is open. */
const CODE_TTL_MS = 180_000;

type Forced = 'expired' | 'lockout';

/** Digits only, so `LV-548005`, `lv 548005` and `548005` all compare equal. */
const digitsOf = (value: string | undefined | null) => String(value ?? '').replace(/\D/g, '');

/**
 * Check-in code entry. Default, wrong code, expired, and lockout are driven by
 * attempts and a code lifetime rather than being four separate screens.
 *
 * ## Why it had no screen after it
 *
 * It read `getBooking(id)` — the fixture array — so a real booking id landed
 * on "Booking not found" and the flow stopped dead at the first step. It reads
 * the server now, and a successful check-in goes to `booking/checked-in`,
 * which is the state the backend actually puts the row in.
 *
 * ## The PIN is compared here, not on the server
 *
 * Deliberate, and it is why the code is shared rather than secret: the owner
 * and the student are standing in the same room holding two phones showing the
 * same six digits. `POST /bookings/:id/checkin` stamps `movedInByOwnerAt` and
 * asks for no code, because the thing being proved is that a person was
 * physically there — which no signature over a network can establish.
 */
export default function CheckInScreen() {
  const c = useColors();
  const router = useRouter();
  const { id, state: forced } = useLocalSearchParams<{ id: string; state?: Forced }>();

  const { booking, notFound, isPending } = useBooking(id);
  const { checkIn } = useBookingActions(id);

  const [code, setCode] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [wrong, setWrong] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const openedAt = useRef(Date.now()).current;
  const [now, setNow] = useState(openedAt);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (isPending && !booking) {
    return (
      <Screen scroll={false} padX={24} background="bg">
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!booking) {
    return (
      <Screen scroll={false} padX={24} background="bg">
        <EmptyState
          icon="search"
          title="Booking not found"
          body={notFound ? 'It may have been cancelled.' : 'We could not load this booking.'}
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const firstName = booking.guest.split(' ')[0];
  const lockedOut = forced === 'lockout' || attemptsLeft <= 0;
  const expired = forced === 'expired' || now - openedAt > CODE_TTL_MS;
  const complete = code.length === CODE_LENGTH;

  /*
   * A manual walk-in has no PIN at all — no request was ever accepted for it,
   * so `entryPin` is null on the row. Those cannot be code-checked and must
   * not be blocked by a box that can never be satisfied: the owner typed this
   * guest in themselves and is the only proof there is.
   */
  const expected = digitsOf(booking.checkInCode);
  const codeless = expected.length === 0;

  const markIn = () => {
    checkIn.mutate(undefined, {
      onSuccess: () => {
        router.replace({ pathname: '/booking/checked-in', params: { id: booking.id } });
      },
      onError: (err) => {
        setToast(
          err instanceof ApiError
            ? err.displayMessage
            : 'We could not mark them in. Please try again.',
        );
      },
    });
  };

  const verify = () => {
    if (checkIn.isPending || expired || lockedOut) return;
    if (codeless) { markIn(); return; }
    if (!complete) return;

    /* An actual comparison. This used to be
       `code === booking.checkInCode || code.length === CODE_LENGTH`, whose
       right-hand side is true whenever the left is even evaluated — so every
       code passed. */
    if (code === expected) { markIn(); return; }

    const left = attemptsLeft - 1;
    setAttemptsLeft(left);
    setWrong(true);
    setCode('');
    if (left <= 0) setToast('Too many attempts. Code entry is locked for 15 minutes.');
  };

  // ── Lockout replaces the whole body: there's nothing to type into. ──
  if (lockedOut) {
    return (
      <Screen
        scroll={false}
        padX={24}
        contentStyle={styles.fill}
        footer={
          <Button
            label="Contact support"
            variant="secondary"
            onPress={() => router.push('/support')}
          />
        }
        stickyHeader={
          <>
            <View style={styles.backRow}>
              <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
            </View>
            <Text variant="screenTitle" style={styles.title}>
              Check in {firstName}
            </Text>
          </>
        }
      >
        <View style={styles.lockBody}>
          <View style={[styles.lockIcon, { backgroundColor: c.errorTint }]}>
            <Icon name="lock" size={22} color={c.error} />
          </View>
          <Text variant="h3" center style={styles.lockTitle}>
            Too many attempts
          </Text>
          <Text variant="badge" color="textSecondary" center style={styles.lockBody2}>
            For security, code entry is locked for 15 minutes. You can still check the guest in
            manually from support.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scroll={false}
      padX={24}
      contentStyle={styles.fill}
      footer={
        <Button
          label={checkIn.isPending ? 'Marking in…' : 'Verify & check in'}
          onPress={verify}
          loading={checkIn.isPending}
          disabled={(!codeless && !complete) || expired || checkIn.isPending}
        />
      }
    >
      {expired ? (
        <Toast
          message="This code expired. Ask the guest to reopen their confirmation."
          tone="error"
          duration={6000}
        />
      ) : toast ? (
        <Toast message={toast} tone="error" onDismiss={() => setToast(null)} />
      ) : null}

      <View style={[styles.backRow, expired ? styles.backRowPushed : null]}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <Text variant="screenTitle" style={styles.title}>
        Check in {firstName}
      </Text>

      {codeless ? (
        /* A walk-in the owner typed in themselves. There is no code to ask
           for, and pretending otherwise leaves them staring at six empty
           boxes with nothing that can fill them. */
        <>
          <Text variant="bodySm" color="textSecondary" style={styles.subtitle}>
            You added {firstName} yourself, so there is no guest code to check. Confirm they have
            arrived and you have let them in.
          </Text>
          <View style={[styles.manual, { backgroundColor: c.surfaceSunken, borderColor: c.borderCard }]}>
            <Icon name="user" size={18} color={c.textSecondary} />
            <Text variant="bodySm" color="textSecondary" style={styles.manualText}>
              {booking.guest} · {booking.roomType || 'Room not set'}
            </Text>
          </View>
        </>
      ) : (
        <>
          <Text variant="bodySm" color="textSecondary" style={styles.subtitle}>
            Ask {firstName} for the {CODE_LENGTH}-digit code on their booking, and check it against
            the one on this booking before you let them in.
          </Text>

          <OTPInput
            value={code}
            onChangeText={(next) => {
              setCode(next);
              if (wrong) setWrong(false);
            }}
            length={CODE_LENGTH}
            size="lg"
            invalid={wrong}
            disabled={expired}
            autoFocus
            accessibilityLabel="Guest check-in code"
          />

          {wrong ? (
            <View style={styles.attemptRow}>
              <Icon name="alert-circle" size={13} color={c.error} strokeWidth={2.5} />
              <Text variant="link" style={{ color: c.error }}>
                Incorrect code · {attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} left
              </Text>
            </View>
          ) : null}
        </>
      )}

      <View style={styles.spacer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 8 },
  backRowPushed: { marginTop: 56 },
  title: { marginBottom: 8 },
  subtitle: { lineHeight: 21, marginBottom: 26 },
  manual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  manualText: { flex: 1 },
  attemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  spacer: { flex: 1 },
  lockBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  lockIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockTitle: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  lockBody2: { fontSize: 13, lineHeight: 19, maxWidth: 230 },
});
