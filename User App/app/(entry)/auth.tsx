import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, InlineAlert, SegmentedControl, Text, TextField } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { isValidIndianMobile, phoneError, sendFailureCopy } from '@/types/auth';

/**
 * Who you are and how to reach you. The code is the screen after this one.
 *
 * The two paths differ by two fields, not by two screens: signing up adds a
 * name and an optional email above the number. A toggle at the top says which
 * you are doing, so nothing is guessed from the number.
 *
 * ## The code moved to its own screen
 *
 * It used to appear inline, below the number, on a second beat. The reasoning
 * was that a code belongs next to the thing it verifies — which is true, and
 * was outweighed by what actually happened on a phone: the boxes were the
 * fourth control on a scrolling form, they appeared below the fold with the
 * numeric keyboard already covering that half of the screen, and they could
 * not be reached or typed into.
 *
 * A screen of its own has one job, one control, and nothing above it to
 * scroll past. `(entry)/verify.tsx`.
 */

const MODES = ['Sign in', 'Sign up'] as const;
type Mode = (typeof MODES)[number];

export default function AuthScreen() {
  const { colors, space, layout, mode: themeMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { sendCode, isSubmitting, sendFailure, failureMessage, resendIn } = useAuth();

  /** Where to return once signed in — set by whatever triggered the gate. */
  const { next } = useLocalSearchParams<{ next?: string }>();

  const [mode, setMode] = useState<Mode>('Sign up');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState('');
  const [touched, setTouched] = useState(false);

  const signingUp = mode === 'Sign up';
  const numberValid = isValidIndianMobile(digits);
  const numberError = touched ? phoneError(digits) : undefined;
  const nameReady = !signingUp || name.trim().length > 1;

  const changeNumber = (value: string) => {
    setDigits(value.replace(/[^0-9]/g, '').slice(0, 10));
  };

  const send = async () => {
    setTouched(true);
    if (!numberValid || !nameReady) return;

    const result = await sendCode(
      `+91${digits}`,
      signingUp ? { name: name.trim(), email: email.trim() } : undefined,
    );

    /*
     * `pending` advances too.
     *
     * It means the server refused because it sent a code moments ago — so one
     * is already in the student's messages, and holding them on this form to
     * wait out a cooldown for a code they can read right now would be
     * perverse. Only an outright failure keeps them here, where the alert
     * below says what went wrong.
     */
    if (result === 'failed') return;

    router.push({
      pathname: '/(entry)/verify',
      /* `next` rides along so a deep link into a listing still survives the
         sign-in, now that there is a screen between here and the router. */
      params: next ? { next } : undefined,
    } as never);
  };

  /* The retry label is the server's remaining cooldown, not a fixed clock
     time. It used to be the literal string '9:41'. */
  const failure = sendFailure
    ? sendFailureCopy(sendFailure, {
        retryAfterLabel: resendIn > 0 ? `${resendIn} seconds` : 'a few minutes',
      })
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      {/* No back affordance when auth is the first gate — there is nothing
          behind it, and a dead back button reads as a broken screen. A student
          who arrived here from a deep link can still go back. */}
      <StandardHeader title="" onBack={router.canGoBack() ? () => router.back() : undefined} />

      {/* The mobile number is the third field on the sign-up path, below the
          name and the email, and on a 6" phone it sits under the keyboard the
          moment it is focused — which is where this screen was being typed
          into blind. */}
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          /* Every other screen opens its scroll body on a gutter. Without one
             the headline sits flush against the header's hairline and the two
             read as a single squashed block. */
          paddingTop: space[4],
          paddingBottom: insets.bottom + space[8],
          gap: space[5],
        }}
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
          helper="We'll send a code to this number on the next screen."
        />

        {/* Every failure names whose fault it is. The body is the server's own
            sentence where it wrote one — it knows whether the gateway refused
            the message or the number is blocked, and the generic copy does
            not. */}
        {failure ? (
          <InlineAlert
            tone={sendFailure === 'rateLimited' ? 'warning' : 'error'}
            title={failure.headline}
            body={failureMessage ?? failure.body}
            actionLabel={failure.action}
            onAction={failure.action ? () => send() : undefined}
          />
        ) : null}

        <View style={{ gap: space[3] }}>
          {signingUp ? (
            // Directly above the button, not buried in a footer.
            <Text variant="caption" color="secondary">
              By continuing you agree to our Terms and Privacy Policy. We do not sell your number.
            </Text>
          ) : null}

          <Button
            label="Send code"
            loadingLabel="Sending the code"
            loading={isSubmitting}
            /* The name is a gate on the sign-up path: it is written in the
               same request that proves the number, and the owner sees it on
               a request. Letting the send through without one would create
               the account nameless. */
            disabled={!numberValid || !nameReady}
            onPress={send}
            fullWidth
          />
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

