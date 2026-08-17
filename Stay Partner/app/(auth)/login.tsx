import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, PhoneField, PHONE_LENGTH } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

/**
 * Login — the entry screen.
 *
 * ## This is register AND log in
 *
 * There is no separate registration screen and there does not need to be. A
 * number the backend has seen before signs in; one it has not creates the
 * account. The server deliberately never reports which case it is, because an
 * endpoint that did would let anybody test a list of numbers against Lampose's
 * owners — so the copy here is written to be true of both.
 *
 * The name and email are collected after the code, on `profile-setup`, which
 * is the only order that is safe: anything written before the number is proven
 * would let somebody rename a stranger's account by typing their number into a
 * form.
 *
 * Sending used to be a 1.4-second `setTimeout`. It is a real call now, and the
 * failure it can produce is a real one — a wrong number, a gateway that is
 * down, or a cooldown the server is still counting.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { sendCode, isSubmitting, sendFailure, failureMessage } = useAuth();

  const [digits, setDigits] = useState('');
  const [touched, setTouched] = useState(false);

  const complete = digits.length === PHONE_LENGTH;
  // Only complain once they've left the field, and never about an empty one —
  // erroring at digit three while someone is still typing is just noise.
  const localError = touched && !complete && digits.length > 0
    ? `Enter a valid ${PHONE_LENGTH}-digit mobile number.`
    : undefined;

  /* The server's sentence wherever it wrote one: only it knows whether the
     gateway refused the message, the number is blocked, or a code went out
     ninety seconds ago. */
  const error = localError
    ?? (sendFailure ? failureMessage ?? 'We could not send a code to that number.' : undefined);

  const send = async () => {
    if (!complete || isSubmitting) return;

    const result = await sendCode(`+91${digits}`);

    /*
     * `pending` advances too.
     *
     * It means the server refused because it sent a code moments ago — so one
     * is already in their messages, and holding them here to wait out a
     * cooldown for a code they can read right now would be perverse. Only an
     * outright failure keeps them on this screen, where the error above says
     * what went wrong.
     */
    if (result === 'failed') return;

    router.push('/otp');
  };

  return (
    <Screen
      scroll={false} padX={24} contentStyle={styles.fill}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            {router.canGoBack() ? (
              <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
            ) : null}
          </View>
        </>
      }
    >

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
        disabled={isSubmitting}
        autoFocus
      />

      <View style={styles.spacer} />

      <Button
        label={isSubmitting ? 'Sending code…' : 'Send code'}
        onPress={send}
        loading={isSubmitting}
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
