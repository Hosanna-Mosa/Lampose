import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  TextButton,
  IconButton,
  Icon,
  OTPInput,
  Toast,
  formatPhone,
} from '@/components/ui';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

function mmss(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * OTP verification.
 *
 * ## Every number on this screen is the server's
 *
 * It used to hold a `DEMO_CODE` of '482915', a 30-second resend timer and a
 * 90-second code lifetime, all invented here. All three are now the backend's:
 * the code is checked by `POST /partners/auth/verify`, the cooldown comes back
 * on the send response, and the expiry is enforced server-side against the
 * database — which is the only place it can be enforced, since a client clock
 * can be wrong or simply restarted.
 *
 * ## Three ways to be wrong, and they are not interchangeable
 *
 * A wrong digit says how many tries are left. A lock says the code is spent and
 * offers a new one. An expired code says exactly that. Showing "that code isn't
 * right" for an expired one sends somebody retyping digits that were never the
 * problem.
 *
 * ## A wrong code does NOT clear the boxes
 *
 * One mistyped digit should be fixable, not retyped from scratch on the way to
 * a property. Only a resend clears them, because a new code makes whatever is
 * in them wrong by definition.
 */
export default function OtpScreen() {
  const c = useColors();
  const router = useRouter();

  const {
    pendingPhone,
    pendingPhoneMasked,
    otpLength,
    resendIn,
    isSubmitting,
    verifyCode,
    resendCode,
    changeNumber,
  } = useAuth();

  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const [resent, setResent] = useState(false);

  /*
   * No number, no screen.
   *
   * Reachable by a back gesture after signing in, by a deep link, and by a
   * reload in development — in each case there is no code in flight and nothing
   * here would work. Sent back to the number rather than left on six boxes that
   * can never be right.
   */
  useEffect(() => {
    if (!pendingPhone) setCode('');
  }, [pendingPhone]);

  if (!pendingPhone) return <Redirect href="/login" />;

  const complete = code.length === otpLength;

  const verify = async () => {
    if (!complete || isSubmitting) return;
    setToast(null);

    const result = await verifyCode(code);

    if (result.ok) {
      /* Straight past setup for a returning owner who has already given their
         name. Asking again on every login would be a form nobody can dismiss. */
      router.replace(result.profileComplete ? '/' : '/profile-setup');
      return;
    }

    setInvalid(true);
    setResent(false);

    if (result.reason === 'locked') {
      setToast({ message: `Too many tries. Ask for a new code after ${result.unlocksAtLabel}.` });
    } else if (result.reason === 'expired') {
      setToast({ message: 'That code has expired. Request a new one.' });
    } else if (result.reason === 'wrong') {
      setToast({
        message: result.attemptsLeft > 0
          ? `That code isn't right — ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left.`
          : "That code isn't right.",
      });
    } else {
      setToast({ message: result.message });
    }
  };

  const resend = async () => {
    /* Cleared here and only here: a new code makes whatever is in the boxes
       wrong by definition, which is the one case where clearing is help. */
    setCode('');
    setInvalid(false);
    setToast(null);

    const result = await resendCode();
    if (result === 'sent') setResent(true);
    else setToast({ message: 'We could not send another code just yet.' });
  };

  /* The server's own masking of the number it actually messaged. Echoing what
     was typed would hide a normalisation the server did. */
  const display = pendingPhoneMasked ?? formatPhone(pendingPhone.replace(/\D/g, '').slice(-10));

  return (
    <Screen
      scroll={false}
      padX={24}
      contentStyle={styles.fill}
      stickyHeader={
        <View style={styles.backRow}>
          {/* Back is the number field, which is exactly where somebody who
              mistyped it needs to go — and it abandons the code in flight
              rather than leaving a half-finished sign-in behind. */}
          <IconButton
            name="chevron-left"
            label="Go back"
            color={isSubmitting ? c.textTertiary : c.textPrimary}
            onPress={() => {
              changeNumber();
              if (router.canGoBack()) router.back();
              else router.replace('/login');
            }}
          />
        </View>
      }
    >
      {/* Stays in the body: a toast belongs over the content it is about, not
          wedged into the header above it. */}
      {toast ? <Toast message={toast.message} tone="error" onDismiss={() => setToast(null)} /> : null}

      <Text variant="pageTitleSm" style={styles.title}>
        Verify your number
      </Text>
      <Text variant="bodySm" color="textSecondary" style={styles.subtitle}>
        Enter the {otpLength}-digit code sent to {display}
      </Text>

      <OTPInput
        value={code}
        onChangeText={(next) => {
          setCode(next);
          if (invalid) setInvalid(false);
        }}
        length={otpLength}
        invalid={invalid}
        disabled={isSubmitting}
        autoFocus
      />

      <View style={styles.status}>
        {resendIn > 0 ? (
          resent ? (
            <View style={styles.resentRow}>
              <Icon name="check" size={14} color={c.success} strokeWidth={2.5} />
              <Text variant="link" style={{ color: c.successOnTint }}>
                Code resent · Resend again in {mmss(resendIn)}
              </Text>
            </View>
          ) : (
            <Text variant="link" color="textTertiary" style={styles.countdown}>
              Resend code in {mmss(resendIn)}
            </Text>
          )
        ) : (
          <TextButton label="Resend code" onPress={resend} />
        )}
      </View>

      <View style={styles.spacer} />

      <Button
        label={isSubmitting ? 'Verifying…' : 'Verify'}
        onPress={verify}
        loading={isSubmitting}
        disabled={!complete || isSubmitting}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: {
    height: 44,
    justifyContent: 'center',
    marginLeft: -10,
    marginBottom: 12,
  },
  title: { marginBottom: 8 },
  subtitle: { lineHeight: 21, marginBottom: 26 },
  status: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 10,
  },
  countdown: { fontFamily: fonts.medium },
  resentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spacer: { flex: 1 },
});
