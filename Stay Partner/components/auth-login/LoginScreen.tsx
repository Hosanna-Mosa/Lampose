import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '@/components/common';
import { useRouter } from 'expo-router';
import {
  Screen, Text, Button, IconButton, PhoneField, PHONE_LENGTH, Input, TextButton,
} from '@/components/common';
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
export function LoginScreen() {
  const router = useRouter();
  const {
    sendCode, signInWithPassword, isSubmitting, sendFailure, failureMessage,
  } = useAuth();

  const [digits, setDigits] = useState('');
  const [touched, setTouched] = useState(false);

  /*
   * Which way in this screen is showing.
   *
   * Phone is the default and stays the default: it is how every owner who has
   * not been handed a password signs in, and the server cannot sign the rest
   * of them in this way at all. The password form is the second door, not the
   * front one.
   */
  const [mode, setMode] = useState<'phone' | 'password'>('phone');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | undefined>(undefined);

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

  const canSubmitPassword = email.trim().length > 0 && password.length > 0;

  const signIn = async () => {
    if (!canSubmitPassword || isSubmitting) return;
    setPwError(undefined);

    const result = await signInWithPassword(email, password);
    if (!result.ok) {
      setPwError(result.message);
      return;
    }

    /* The same fork `verifyCode`'s caller takes. An account provisioned
       without a name has never filled the profile in, and the dashboard reads
       fields that setup writes — so it goes there first, exactly as a new
       owner does after a code. */
    router.replace(result.profileComplete ? '/' : '/profile-setup');
  };

  return (
    <Screen
      scroll={false} padX={24} contentStyle={styles.fill}
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            {router.canGoBack() ? (
              <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
            ) : null}
          </Box>
        </>
      }
    >

      <Text variant="pageTitle" style={styles.title}>
        Log in
      </Text>
      <Text variant="bodySm" color="textSecondary" style={styles.subtitle}>
        {mode === 'phone'
          ? 'Enter the mobile number linked to your host account.'
          : 'Enter the email address and password for your host account.'}
      </Text>

      {mode === 'password' ? (
        <>
          <Input
            label="Email"
            value={email}
            onChangeText={(next) => {
              setEmail(next);
              if (pwError) setPwError(undefined);
            }}
            placeholder="you@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            disabled={isSubmitting}
            containerStyle={styles.field}
            autoFocus
          />

          <Input
            label="Password"
            value={password}
            onChangeText={(next) => {
              setPassword(next);
              if (pwError) setPwError(undefined);
            }}
            placeholder="Your password"
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={signIn}
            disabled={isSubmitting}
            /* The server's sentence, and it is the same one for a wrong
               address as for a wrong password — on purpose, so this screen
               cannot be used to find out which owners Lampose has. */
            error={pwError}
            containerStyle={styles.field}
          />

          <Button
            label={isSubmitting ? 'Signing in…' : 'Log in'}
            onPress={signIn}
            loading={isSubmitting}
            disabled={!canSubmitPassword}
            style={styles.cta}
          />

          <TextButton
            label="Use my mobile number instead"
            onPress={() => { setMode('phone'); setPwError(undefined); }}
            disabled={isSubmitting}
          />
        </>
      ) : (
        <>
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

      {/* Right under the field, not pinned to the bottom of the screen — a
          bottom-pinned button on a `scroll={false}` screen sits exactly
          where the keyboard covers it the moment the field is focused,
          since nothing here resizes for the keyboard. Sitting in the normal
          flow means it's always above it, autofocus or not. */}
      <Button
        label={isSubmitting ? 'Sending code…' : 'Send code'}
        onPress={send}
        loading={isSubmitting}
        disabled={!complete}
        style={styles.cta}
      />

          <TextButton
            label="Log in with email and password"
            onPress={() => setMode('password')}
            disabled={isSubmitting}
          />
        </>
      )}

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
  field: { marginBottom: 16 },
  cta: { marginTop: 12, marginBottom: 14 },
  legal: { lineHeight: 17 },
});
