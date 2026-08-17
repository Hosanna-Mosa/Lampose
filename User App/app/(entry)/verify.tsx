import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, InlineAlert, OtpInput, Text, type OtpState } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

/**
 * The code, on a screen of its own.
 *
 * ## Why it is not on the form any more
 *
 * It used to appear inline under the mobile number, revealed on a second
 * beat, on the reasoning that a code belongs beside the thing it verifies.
 * On a phone that reasoning lost to the keyboard: the boxes were the fourth
 * control on a scrolling form, they appeared below the fold, and the numeric
 * keypad covered exactly the half of the screen they appeared in. They could
 * not be reached, and the code could not be entered at all.
 *
 * One screen, one job. Nothing above the boxes to scroll past, and the
 * keyboard has nowhere to hide them.
 *
 * ## The rules it carries over
 *
 *  - **A wrong code does NOT clear the boxes.** One mistyped digit should be
 *    fixable, not retyped from scratch on a bus.
 *  - **The resend cooldown resets on a resend, never on a wrong code.** It is
 *    the server's number, read off its response rather than counted here.
 *  - **A lockout is on the code, not the person.** "Change number" stays live
 *    throughout, and asking for a new code clears the lock.
 *
 * ## Three ways to be wrong, and they are not interchangeable
 *
 * A wrong digit says how many tries are left. A lock says the code is spent
 * and offers a new one. Everything else — an expired code, a blocked number,
 * a database that is down — carries the server's own sentence, because only
 * the server knows which of them happened. Showing "that code is wrong, 4
 * tries left" for an expired one sends somebody retyping digits that were
 * never the problem.
 */
export default function VerifyScreen() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /** Where to return once signed in — carried through from the form. */
  const { next } = useLocalSearchParams<{ next?: string }>();

  const {
    status,
    config,
    pendingPhone,
    pendingPhoneMasked,
    verifyCode,
    resendCode,
    changeNumber,
    isSubmitting,
    resendIn,
  } = useAuth();

  const [code, setCode] = useState('');
  const [otpState, setOtpState] = useState<OtpState>('idle');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedLabel, setLockedLabel] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /**
   * Set the moment a correct code is accepted, and it exists to win a race.
   *
   * Verifying clears `pendingPhone` — the sign-in is over — and this screen
   * redirects when that is empty. Both happen in the same tick as the
   * `router.replace` below, and nothing orders them, so the redirect could
   * fire first and send the student to `/` instead of the `next` they were
   * deep-linked from. This flag says "a navigation is already happening,
   * leave it alone".
   */
  const [handedOff, setHandedOff] = useState(false);

  /*
   * No number, no screen.
   *
   * Reachable by a back gesture after signing in, by a deep link, and by a
   * reload in development — in each case there is no code in flight and
   * nothing here would work. Sent back to the form rather than left on six
   * boxes that can never be right.
   */
  if (!pendingPhone && !handedOff) {
    return <Redirect href={status === 'signedIn' ? '/' : '/(entry)/auth'} />;
  }

  const submit = async (value: string) => {
    if (value.length !== config.otpLength) return;
    setOtpState('verifying');
    setProblem(null);

    const result = await verifyCode(value);

    if (result.ok) {
      setHandedOff(true);
      /*
       * Back to the router, not straight to home.
       *
       * Auth is the FIRST gate rather than an interruption, so the two entry
       * questions still have to run after it. `/` re-evaluates the whole
       * chain — locality, then category, then home — and lands wherever the
       * student actually is. Replacing with '/home' would skip both and drop
       * them into a feed with no locality and no category.
       *
       * `next` is honoured, so a deep link into a specific listing survives
       * the sign-in.
       */
      router.replace(next ? (next as never) : '/');
      return;
    }

    if (result.reason === 'locked') {
      setLockedLabel(result.unlocksAtLabel);
      setOtpState('error');
      return;
    }

    if (result.reason === 'failed') {
      setProblem(result.message);
      setOtpState('error');
      return;
    }

    setAttemptsLeft(result.attemptsLeft);
    setOtpState('error');
  };

  const resend = async () => {
    /* The boxes are cleared here and only here. A new code makes whatever is
       in them wrong by definition, which is the one case where clearing is
       help rather than an insult. */
    setCode('');
    setOtpState('idle');
    setAttemptsLeft(null);
    setLockedLabel(null);
    setProblem(null);
    await resendCode();
  };

  /** Back to the form, with the in-flight code abandoned. */
  const useAnotherNumber = () => {
    changeNumber();
    if (router.canGoBack()) router.back();
    else router.replace('/(entry)/auth');
  };

  const codeError = lockedLabel
    ? 'That code is spent. Ask for a new one below.'
    : problem
      ?? (attemptsLeft !== null
        ? `That code is wrong — ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
        : undefined);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {/* Back is the number field, which is exactly where somebody who
          mistyped it needs to go. */}
      <StandardHeader title="" onBack={useAnotherNumber} />

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          /* Matches `auth.tsx` — the screen before this one. */
          paddingTop: space[4],
          paddingBottom: insets.bottom + space[8],
          gap: space[5],
        }}
      >
        <View style={{ gap: space[2] }}>
          <Text variant="display2">Enter the code</Text>
          <Text variant="bodyLg" color="secondary">
            {/* The masked number is the server's, which is the one that was
                actually messaged — echoing what was typed would hide a
                normalisation the server did. */}
            We sent {config.otpLength} digits to {pendingPhoneMasked ?? pendingPhone ?? 'your phone'}.
          </Text>
        </View>

        <OtpInput
          value={code}
          onChange={(nextCode) => {
            setCode(nextCode);
            /* Typing clears the error, but never the digits. A lock is not
               cleared by typing — only a new code clears that. */
            if (otpState === 'error' && !lockedLabel) {
              setOtpState('idle');
              setProblem(null);
            }
          }}
          length={config.otpLength}
          state={otpState}
          errorMessage={codeError}
          /* Submits itself on the last digit, so the common case never needs
             the button below. */
          onComplete={submit}
          autoFocus
        />

        {lockedLabel ? (
          <InlineAlert
            tone="warning"
            title="Code locked"
            body="Too many wrong tries, so this code is spent. The lock is on the code, not on you — ask for a new one, or go back and use a different number."
          />
        ) : null}

        <View style={{ gap: space[3] }}>
          <Button
            label="Verify and continue"
            loadingLabel="Checking the code"
            loading={isSubmitting}
            disabled={code.length !== config.otpLength || isSubmitting}
            onPress={() => submit(code)}
            fullWidth
          />

          {resendIn > 0 ? (
            <Text variant="caption" color="tertiary" style={styles.centred}>
              You can ask for another code in {resendIn}s.
            </Text>
          ) : (
            <Button label="Send a new code" variant="ghost" onPress={resend} fullWidth />
          )}

          {/* Always available, including while the code is locked — the lock
              is on the code, and the number was never the problem. */}
          <Button label="Use a different number" variant="ghost" onPress={useAnotherNumber} fullWidth />
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
});
