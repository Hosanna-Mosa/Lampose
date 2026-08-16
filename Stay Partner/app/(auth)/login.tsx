import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, PhoneField, PHONE_LENGTH } from '@/components/ui';

/**
 * Login — the entry screen. Default, sending-code, and invalid-number are real
 * states here rather than three separate frames: the number drives validity, and
 * sending is simulated until an API exists.
 */
export default function LoginScreen() {
  const router = useRouter();

  const [digits, setDigits] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const complete = digits.length === PHONE_LENGTH;
  // Only complain once they've left the field, and never about an empty one —
  // erroring at digit three while someone is still typing is just noise.
  const error = touched && !complete && digits.length > 0
    ? `Enter a valid ${PHONE_LENGTH}-digit mobile number.`
    : undefined;

  const sendCode = () => {
    if (!complete || sending) return;
    setSending(true);
    timer.current = setTimeout(() => {
      setSending(false);
      router.push({ pathname: '/otp', params: { phone: digits } });
    }, 1400);
  };

  return (
    <Screen scroll={false} padX={24} contentStyle={styles.fill}>
      <View style={styles.backRow}>
        {router.canGoBack() ? (
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        ) : null}
      </View>

      <Text variant="pageTitle" style={styles.title}>
        Log in
      </Text>
      <Text variant="bodySm" color="textSecondary" style={styles.subtitle}>
        Enter the mobile number linked to your host account.
      </Text>

      <PhoneField
        value={digits}
        onChangeText={(next) => {
          setDigits(next);
          if (next.length === PHONE_LENGTH) setTouched(false);
        }}
        onBlur={() => setTouched(true)}
        error={error}
        disabled={sending}
        autoFocus
      />

      <View style={styles.spacer} />

      <Button
        label={sending ? 'Sending code…' : 'Send code'}
        onPress={sendCode}
        loading={sending}
        disabled={!complete}
        style={styles.cta}
      />
      <Text variant="badge" color="textCaption" center style={styles.legal}>
        By continuing you agree to the Partner Terms and Privacy Policy.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: {
    height: 44,
    justifyContent: 'center',
    marginLeft: -10, // optical alignment: the 44px target overhangs the text margin
    marginBottom: 12,
  },
  title: { marginBottom: 8 },
  subtitle: { lineHeight: 21, marginBottom: 28 },
  spacer: { flex: 1 },
  cta: { marginBottom: 14 },
  legal: { lineHeight: 17 },
});
