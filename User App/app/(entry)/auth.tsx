import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, InlineAlert, Text, TextField } from '@/components/ui';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { isValidIndianMobile, phoneError, sendFailureCopy } from '@/types/auth';
import { elevation, radius } from '@/constants/tokens';

/**
 * One door, not two.
 *
 * ## What this replaced
 *
 * A flip card with "Sign in" on one face and "Create your account" on the
 * other — the SECOND face, gathering a name, an email and a referral code,
 * used to be what a NEW student saw FIRST (`mode` defaulted to `'Sign up'`).
 * That is backwards for a product whose whole account model is a phone
 * number: there is no password to set and no separate signup step the
 * server needs — `POST /verify` creates the account itself, the moment an
 * unrecognised number's code comes back right. Asking for a name before
 * that, on the very first screen, was asking for a fact the app did not
 * need yet to do the one thing this screen is for: prove the number.
 *
 * ## Where the name went
 *
 * It is asked once, inline, the first time it is actually needed — sending
 * a stay request, which is also the first moment a name has anywhere to go
 * (an owner reads it off the request). `stayRequest.service.js` already
 * refuses a nameless request with `PROFILE_INCOMPLETE`; `confirm/[id].tsx`
 * is where that turns into a form instead of a dead end. Saved once there,
 * it is fetched back on every later sign-in — nothing on this screen has to
 * ask for it again.
 *
 * ## The referral code stayed
 *
 * It is the one field from the old sign-up face this screen still carries,
 * because dropping it would have quietly broken a working feature nobody
 * asked to remove. It rides on the SAME OTP verify call it always did
 * (`PendingProfile.referralCode`) — see AuthContext.
 */
export default function AuthScreen() {
  const { colors, space, layout, mode: themeMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { sendCode, isSubmitting, sendFailure, failureMessage, resendIn } = useAuth();

  /** Where to return once signed in — set by whatever triggered the gate. */
  const { next } = useLocalSearchParams<{ next?: string }>();

  const [digits, setDigits] = useState('');
  const [touched, setTouched] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [referralCode, setReferralCode] = useState('');

  const numberValid = isValidIndianMobile(digits);
  const numberError = touched ? phoneError(digits) : undefined;

  const changeNumber = (value: string) => {
    setDigits(value.replace(/[^0-9]/g, '').slice(0, 10));
  };

  const send = async () => {
    setTouched(true);
    if (!numberValid) return;

    const trimmedReferral = referralCode.trim();
    const result = await sendCode(
      `+91${digits}`,
      trimmedReferral ? { referralCode: trimmedReferral } : undefined,
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
         sign-in. */
      params: next ? { next } : undefined,
    } as never);
  };

  /* The retry label is the server's remaining cooldown, not a fixed clock
     time. */
  const failure = sendFailure
    ? sendFailureCopy(sendFailure, {
      retryAfterLabel: resendIn > 0 ? `${resendIn} seconds` : 'a few minutes',
    })
    : null;

  return (
    /*
     * The bottom safe-area band is owned by the SCREEN ROOT, matching every
     * other screen in the app — see the note this carried over from the two
     * screens it replaces the auth half of.
     */
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />

      {/* No opaque header bar — see the note this screen always carried:
          only the back affordance survives, and only when there is
          something to go back to. Auth is usually the first gate, where a
          dead back button would read as a broken screen. */}
      <View style={{ paddingTop: insets.top }}>
        {router.canGoBack() ? (
          <IconButton
            name="chevronLeft"
            onPress={() => router.back()}
            accessibilityLabel="Back"
            style={{ marginLeft: space[1] }}
          />
        ) : null}
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: space[6],
        }}
      >
        <View style={{ gap: space[6] }}>
          <View style={{ gap: space[2] }}>
            <Text variant="display1">Find your next stay</Text>
            <Text variant="bodyLg" color="secondary">
              Enter your number and we&apos;ll text you a code. No password, no separate sign-up.
            </Text>
          </View>

          <View
            style={[
              elevation.card,
              {
                backgroundColor: colors.surface, borderRadius: radius.card, padding: space[5], gap: space[5],
              },
            ]}
          >
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
              autoFocus
            />

            {referralOpen ? (
              <TextField
                label="Referral code"
                optional
                value={referralCode}
                onChangeText={setReferralCode}
                placeholder="e.g. LAMPOSE50"
                autoCapitalize="characters"
                helper="From an owner who invited you."
              />
            ) : (
              <Pressable
                onPress={() => setReferralOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Have a referral code?"
              >
                <Text variant="body" color="brand">
                  Have a referral code?
                </Text>
              </Pressable>
            )}

            {failure ? (
              <InlineAlert
                tone={sendFailure === 'rateLimited' ? 'warning' : 'error'}
                title={failure.headline}
                body={failureMessage ?? failure.body}
                actionLabel={failure.action}
                onAction={failure.action ? () => send() : undefined}
              />
            ) : null}

            <Button
              label="Send code"
              loadingLabel="Sending the code"
              loading={isSubmitting}
              disabled={!numberValid}
              onPress={send}
              fullWidth
            />
          </View>

          <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
            By continuing you agree to our Terms and Privacy Policy. We do not sell your number.
          </Text>
        </View>

        <View pointerEvents="none" style={{ height: space[8] }} />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
