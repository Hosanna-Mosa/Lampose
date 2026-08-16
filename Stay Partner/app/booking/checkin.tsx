import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { getBooking } from '@/lib/bookings';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 3;
/** How long the guest's code stays valid once this screen is open. */
const CODE_TTL_MS = 180_000;

type Forced = 'expired' | 'lockout';

/**
 * Check-in code entry. Default, wrong code, expired, and lockout are driven by
 * attempts and a code lifetime rather than being four separate screens.
 */
export default function CheckInScreen() {
  const c = useColors();
  const router = useRouter();
  const { id, state: forced } = useLocalSearchParams<{ id: string; state?: Forced }>();
  const booking = getBooking(id);

  const [code, setCode] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [wrong, setWrong] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const openedAt = useRef(Date.now()).current;
  const [now, setNow] = useState(openedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!booking) {
    return (
      <Screen scroll={false} padX={24} background="bg">
        <EmptyState
          icon="search"
          title="Booking not found"
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

  const verify = () => {
    if (!complete || verifying || expired || lockedOut) return;
    setVerifying(true);
    timer.current = setTimeout(() => {
      setVerifying(false);
      if (code === booking.checkInCode) {
        router.replace({ pathname: '/booking/active', params: { id: booking.id } });
        return;
      }
      const left = attemptsLeft - 1;
      setAttemptsLeft(left);
      setWrong(true);
      if (left <= 0) setToast('Too many attempts. Code entry is locked for 15 minutes.');
    }, 700);
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
      >
        <View style={styles.backRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </View>
        <Text variant="screenTitle" style={styles.title}>
          Check in {firstName}
        </Text>

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
          label={verifying ? 'Checking in…' : 'Verify & check in'}
          onPress={verify}
          loading={verifying}
          disabled={!complete || expired}
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
      <Text variant="bodySm" color="textSecondary" style={styles.subtitle}>
        Ask the guest for the {CODE_LENGTH}-digit code from their booking confirmation.
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

      <View style={styles.spacer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 8 },
  backRowPushed: { marginTop: 56 },
  title: { marginBottom: 8 },
  subtitle: { lineHeight: 21, marginBottom: 26 },
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
  lockBody2: { fontSize: 12.5, lineHeight: 19, maxWidth: 230 },
});
