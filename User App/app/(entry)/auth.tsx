import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthFlipCard } from '@/components/auth';
import { Button, IconButton, InlineAlert, Text, TextField } from '@/components/ui';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { isValidIndianMobile, phoneError, sendFailureCopy } from '@/types/auth';

/**
 * Who you are and how to reach you. The code is the screen after this one.
 *
 * The two paths differ by two fields, not by two screens: signing up adds a
 * name and an optional email above the number. What changed from the earlier
 * version of this screen is only how that difference is presented — a single
 * scrolling form with a segmented toggle read as two states of one list, not
 * two distinct things you are choosing between. The card now holds each path
 * on its own face and turns between them, so "Sign in" and "Sign up" are
 * unmistakably two doors rather than one form with a switch on it.
 *
 * ## The code still moved to its own screen
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

type Mode = 'Sign in' | 'Sign up';

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
  const [referralCode, setReferralCode] = useState('');
  const [digits, setDigits] = useState('');
  const [touched, setTouched] = useState(false);

  const signingUp = mode === 'Sign up';
  const numberValid = isValidIndianMobile(digits);
  const numberError = touched ? phoneError(digits) : undefined;
  const nameReady = !signingUp || name.trim().length > 1;

  const changeNumber = (value: string) => {
    setDigits(value.replace(/[^0-9]/g, '').slice(0, 10));
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    // The name is meaningless on the sign-in path; drop it rather than
    // carrying a value the user cannot see on the face they're looking at.
    if (nextMode === 'Sign in') {
      setName('');
      setEmail('');
      setReferralCode('');
    }
  };

  const send = async () => {
    setTouched(true);
    if (!numberValid || !nameReady) return;

    const result = await sendCode(
      `+91${digits}`,
      signingUp ? { name: name.trim(), email: email.trim(), referralCode: referralCode.trim() } : undefined,
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

  // Every failure names whose fault it is. The body is the server's own
  // sentence where it wrote one — it knows whether the gateway refused the
  // message or the number is blocked, and the generic copy does not. Shown
  // only on the face the send was attempted from.
  const failureAlert = failure ? (
    <InlineAlert
      tone={sendFailure === 'rateLimited' ? 'warning' : 'error'}
      title={failure.headline}
      body={failureMessage ?? failure.body}
      actionLabel={failure.action}
      onAction={failure.action ? () => send() : undefined}
    />
  ) : null;

  const mobileField = (
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
  );

  const sendButton = (
    <Button
      label="Send code"
      loadingLabel="Sending the code"
      loading={isSubmitting}
      /* The name is a gate on the sign-up path: it is written in the same
         request that proves the number, and the owner sees it on a request.
         Letting the send through without one would create the account
         nameless. */
      disabled={!numberValid || !nameReady}
      onPress={send}
      fullWidth
    />
  );

  const switchLink = (label: string, action: string, onPress: () => void) => (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${label} ${action}`}>
      <Text variant="bodyLg" color="secondary" style={{ textAlign: 'center' }}>
        {label}{' '}
        <Text variant="bodyStrong" color="brand">
          {action}
        </Text>
      </Text>
    </Pressable>
  );

  const frontFace = (
    <View style={{ gap: space[5] }}>
      <View style={{ gap: space[2] }}>
        <Text variant="display1">Welcome back</Text>
        <Text variant="bodyLg" color="secondary">
          One code by SMS. No password to remember, and no calls from us.
        </Text>
      </View>

      <View style={{ gap: space[4] }}>
        {mobileField}
        {!signingUp ? failureAlert : null}
      </View>

      <View style={{ gap: space[4] }}>
        {sendButton}
        {switchLink("Don't have an account?", 'Sign up', () => switchMode('Sign up'))}
      </View>
    </View>
  );

  const backFace = (
    <View style={{ gap: space[5] }}>
      <View style={{ gap: space[2] }}>
        <Text variant="display1">Create your account</Text>
        <Text variant="bodyLg" color="secondary">
          One code by SMS. No password to remember, and no calls from us.
        </Text>
      </View>

      <View style={{ gap: space[4] }}>
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
        <TextField
          label="Referral code"
          optional
          value={referralCode}
          onChangeText={setReferralCode}
          placeholder="e.g. LAMPOSE50"
          autoCapitalize="characters"
          helper="Have a referral code from a friend? Enter it here."
        />
        {mobileField}
        {signingUp ? failureAlert : null}
      </View>

      <View style={{ gap: space[3] }}>
        {/* Directly above the button, not buried in a footer. */}
        <Text variant="caption" color="secondary">
          By continuing you agree to our Terms and Privacy Policy. We do not sell your number.
        </Text>
        {sendButton}
        {switchLink('Already have an account?', 'Sign in', () => switchMode('Sign in'))}
      </View>
    </View>
  );

  return (
    /*
     * The bottom safe-area band is owned by the SCREEN ROOT, matching every
     * other screen in the app.
     *
     * It sat in the scroll content until now — first as `contentContainerStyle`
     * padding, then as a spacer `<View>` once it turned out a keyboard-aware
     * scroller manages its own content-container inset and can overwrite that
     * padding. Both only ever guaranteed the LAST element cleared the
     * navigation bar; the viewport still ran underneath it, so mid-scroll the
     * form visibly slid under the gesture bar.
     *
     * On the root it ends the viewport above the bar instead. It also puts this
     * padding somewhere the keyboard-aware scroller cannot reach at all — it is
     * a property of the parent View, not of the scroll content — which is what
     * the spacer was working around.
     */
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />

      {/* No opaque header bar here — the flip card is meant to float on the
          screen's own ground, and a solid toolbar above it would put a flat
          edge across an otherwise chrome-free page. Only the back affordance
          survives, floating, and only when there is something to go back to:
          when auth is the first gate there is nothing behind it, and a dead
          back button reads as a broken screen. */}
      <View style={{ paddingTop: insets.top, height: insets.top + space[7] }}>
        {router.canGoBack() ? (
          <IconButton
            name="chevronLeft"
            onPress={() => router.back()}
            accessibilityLabel="Back"
            style={{ marginLeft: space[1] }}
          />
        ) : null}
      </View>

      {/*
        The safe-area inset is NOT repeated here — the screen root above owns
        it, which is what bounds the viewport above the navigation bar. This
        spacer is now only breathing room under the card, so the "Sign in" link
        does not sit flush against the end of the scroll.

        It carried `Math.max(insets.bottom, 36) + space[8]` for a while, which
        both cleared the bar AND floored the clearance at 36 in case the
        platform under-reported the inset. Once the root took the inset that
        floor was being added on top of it — roughly 76pt of dead space below
        the card on a device that reports a normal inset. If the floor turns
        out to be load-bearing on real hardware it belongs on the root, and in
        one shared place rather than on this screen alone.

        `justifyContent: 'center'` stays omitted from `contentContainerStyle`:
        the sign-up face is taller than a short phone, and top-aligning is the
        arrangement that cannot tuck it under either bar.
      */}
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: space[4],
        }}
      >
        <AuthFlipCard flipped={signingUp} front={frontFace} back={backFace} frontLabel="Sign in" backLabel="Sign up" />
        <View pointerEvents="none" style={{ height: space[8] }} />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
