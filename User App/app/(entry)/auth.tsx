import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  InlineAlert,
  OtpInput,
  SegmentedControl,
  Text,
  TextField,
  type OtpState,
} from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { MAX_SMS_SENDS, useAuth } from '@/context/AuthContext';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { isValidIndianMobile, phoneError, sendFailureCopy } from '@/types/auth';

/**
 * Sign in and sign up, on one screen.
 *
 * The two paths differ by two fields, not by two screens: signing up adds a
 * name and an optional email above the number. A toggle at the top says which
 * you are doing, so nothing is guessed from the number.
 *
 * The one thing that cannot collapse is order — a code cannot be typed before
 * it has been sent. So the screen reveals in two beats, and the code appears
 * directly beneath the number it was sent to rather than at the bottom of the
 * form, where it would be separated from the thing it verifies.
 *
 * "Change number" is not a link here. The field is on screen, so editing it is
 * how you change it — and doing so discards the code that was sent to the old
 * one, because a code is bound to a number.
 *
 * The rules the separate OTP screen carried are unchanged:
 *
 *  - A wrong code does NOT clear the boxes. One mistyped digit should be
 *    fixable, not retyped from scratch on a bus.
 *  - The resend cooldown resets on a resend, never on a wrong code.
 *  - A lockout is on the code, not the person — the number stays editable.
 */

const MODES = ['Sign in', 'Sign up'] as const;
type Mode = (typeof MODES)[number];

export default function AuthScreen() {
  const { colors, space, layout, mode: themeMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReduceMotion();

  const {
    config,
    sendCode,
    resendCode,
    verifyCode,
    isSubmitting,
    sendFailure,
    resendIn,
    sendCount,
  } = useAuth();

  /** Where to return once signed in — set by whatever triggered the gate. */
  const { next } = useLocalSearchParams<{ next?: string }>();

  const [mode, setMode] = useState<Mode>('Sign up');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState('');
  const [touched, setTouched] = useState(false);

  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [otpState, setOtpState] = useState<OtpState>('idle');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedLabel, setLockedLabel] = useState<string | null>(null);

  const signingUp = mode === 'Sign up';
  const numberValid = isValidIndianMobile(digits);
  const numberError = touched ? phoneError(digits) : undefined;
  const nameReady = !signingUp || name.trim().length > 1;

  /** Editing the number discards the code — a code belongs to one number. */
  const changeNumber = (value: string) => {
    setDigits(value.replace(/[^0-9]/g, '').slice(0, 10));
    if (codeSent) {
      setCodeSent(false);
      setCode('');
      setOtpState('idle');
      setAttemptsLeft(null);
      setLockedLabel(null);
    }
  };

  const send = async (channel: 'sms' | 'whatsapp' = 'sms') => {
    setTouched(true);
    if (!numberValid) return;
    const sent = await sendCode(`+91${digits}`, channel);
    if (sent) setCodeSent(true);
  };

  const submit = async (value: string) => {
    if (!nameReady) return;
    setOtpState('verifying');
    const result = await verifyCode(value, signingUp ? { name, email } : undefined);

    if (result.ok) {
      /*
       * Back to the router, not straight to home.
       *
       * Auth is now the FIRST gate rather than an interruption, so the two
       * entry questions still have to run after it. `/` re-evaluates the whole
       * chain — locality, then category, then home — and lands wherever the
       * student actually is. Replacing with '/home' here would skip both and
       * drop them into a feed with no locality and no category.
       *
       * `next` is still honoured, because a deep link into a specific listing
       * should survive the sign-in.
       */
      router.replace(next ? (next as never) : '/');
      return;
    }
    if (result.reason === 'locked') {
      setLockedLabel(result.unlocksAtLabel);
      setOtpState('error');
      return;
    }
    setAttemptsLeft(result.attemptsLeft);
    setOtpState('error');
  };

  const codeError = lockedLabel
    ? `Too many wrong tries. Try again after ${lockedLabel}, or use a different number.`
    : attemptsLeft !== null
      ? `That code is wrong — ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
      : undefined;

  const failure = sendFailure ? sendFailureCopy(sendFailure, { retryAfterLabel: '9:41' }) : null;
  const whatsappOffered = sendCount >= MAX_SMS_SENDS;
  const canSubmit = codeSent && code.length === config.otpLength && nameReady && !lockedLabel;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      {/* No back affordance when auth is the first gate — there is nothing
          behind it, and a dead back button reads as a broken screen. A student
          who arrived here from a deep link can still go back. */}
      <StandardHeader title="" onBack={router.canGoBack() ? () => router.back() : undefined} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingBottom: insets.bottom + space[8],
          gap: space[5],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: space[2] }}>
          <Text variant="display2">
            {signingUp ? 'Your number, so owners can reach you' : 'Welcome back'}
          </Text>
          <Text variant="bodyLg" color="secondary">
            One code by SMS. No password to remember, and no calls from us.
          </Text>
        </View>

        <SegmentedControl
          options={MODES}
          value={mode}
          onChange={(nextMode) => {
            setMode(nextMode);
            // The name is meaningless on the sign-in path; drop it rather than
            // carrying a value the user cannot see.
            if (nextMode === 'Sign in') {
              setName('');
              setEmail('');
            }
          }}
          accessibilityLabel="Sign in or sign up"
        />

        {signingUp ? (
          <>
            <TextField
              label="Your name"
              value={name}
              onChangeText={setName}
              placeholder="Anjali Reddy"
              autoCapitalize="words"
              textContentType="name"
              helper="Owners see this when you request a bed. As on the ID you'll show at move-in."
            />
            <TextField
              label="Email"
              optional
              value={email}
              onChangeText={setEmail}
              placeholder="anjali@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
              helper="For receipts and the agreement PDF."
            />
          </>
        ) : null}

        <TextField
          label="Mobile number"
          prefix="+91"
          value={digits}
          onChangeText={changeNumber}
          onBlur={() => setTouched(true)}
          keyboardType="number-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder="98490 12345"
          maxLength={10}
          error={numberError}
          helper={
            codeSent
              ? 'Editing this sends a new code.'
              : `We'll send a ${config.otpLength}-digit code to this number.`
          }
        />

        {/* The code sits directly under the number it was sent to. */}
        {codeSent ? (
          <Animated.View
            entering={reduceMotion ? FadeIn.duration(120) : FadeIn.duration(240)}
            style={{ gap: space[3] }}
          >
            <OtpInput
              value={code}
              onChange={(nextCode) => {
                setCode(nextCode);
                if (otpState === 'error' && !lockedLabel) setOtpState('idle');
              }}
              length={config.otpLength}
              state={otpState}
              errorMessage={codeError}
              onComplete={submit}
              autoFocus
            />

            {lockedLabel ? (
              <InlineAlert
                tone="warning"
                title="Code locked"
                body={`Three wrong tries, so we have paused this code until ${lockedLabel}. The lock is on the code, not on you — change the number above and start again now.`}
              />
            ) : resendIn > 0 ? (
              <Text variant="caption" color="tertiary" style={styles.centred}>
                You can ask for another code in {resendIn}s.
              </Text>
            ) : whatsappOffered ? (
              // After three SMS sends, a fourth is unlikely to be the problem.
              <Button
                label="Get the code on WhatsApp"
                variant="secondary"
                onPress={() => resendCode('whatsapp')}
                fullWidth
              />
            ) : (
              <Button label="Resend the code" variant="ghost" onPress={() => resendCode('sms')} fullWidth />
            )}
          </Animated.View>
        ) : null}

        {/* Every failure names whose fault it is. */}
        {failure ? (
          <InlineAlert
            tone={sendFailure === 'rateLimited' ? 'warning' : 'error'}
            title={failure.headline}
            body={failure.body}
            actionLabel={failure.action}
            onAction={failure.action ? () => send('whatsapp') : undefined}
          />
        ) : null}

        <View style={{ gap: space[3] }}>
          {signingUp ? (
            // Directly above the button, not buried in a footer.
            <Text variant="caption" color="secondary">
              By continuing you agree to our Terms and Privacy Policy. We do not sell your number.
            </Text>
          ) : null}

          {codeSent ? (
            <Button
              label={signingUp ? 'Create account' : 'Sign in'}
              loadingLabel="Checking the code"
              loading={isSubmitting}
              disabled={!canSubmit}
              onPress={() => submit(code)}
              fullWidth
            />
          ) : (
            <Button
              label="Send code"
              loadingLabel="Sending the code"
              loading={isSubmitting}
              disabled={!numberValid}
              onPress={() => send('sms')}
              fullWidth
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
});
