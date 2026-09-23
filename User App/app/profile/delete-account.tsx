import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, InlineAlert, Text, TextField, useAlert } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useTheme } from '@/context/ThemeContext';
import { ApiError } from '@/services';
import {
  cancelAccountDeletion,
  fetchAccountDeletion,
  requestAccountDeletion,
  type AccountDeletion,
} from '@/services/api/accountDeletion.api';

/**
 * Delete account — a student asking to leave, from inside the app.
 *
 * The App Store and Google Play both require that an account created in the
 * app can be deleted from the app. This is that door; lampose.com/delete-account
 * is the other one, and both write the same request.
 *
 * What the screen promises is what the server does: the account is SCHEDULED
 * for deletion `graceDays` out, not emptied on the tap. A stay in progress or a
 * food order on its way carries on and refunds owed are still paid — so the
 * screen says so, and inside the window it offers the way back.
 *
 * Reached from BOTH profiles — the stay side's and Food's — because it is one
 * account either way.
 */

const WHAT_GOES = [
  'Your profile — name and email',
  'Your mobile number, once the request is carried out',
  'Saved places, favourites and your address book',
  'App and notification preferences',
];

/** "12 October 2026" — a date somebody can hold against a calendar. */
const longDate = (value: string | null | undefined) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

const messageOf = (caught: unknown) =>
  caught instanceof ApiError ? caught.displayMessage : 'Something went wrong. Please try again.';

export default function DeleteAccountScreen() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { confirm } = useAlert();

  const [state, setState] = useState<AccountDeletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    try {
      setState(await fetchAccountDeletion());
    } catch (caught) {
      setProblem(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const ok = await confirm({
      title: 'Delete your account?',
      message: 'Your Lampose account will be scheduled for deletion. You can cancel from this '
        + 'screen until the date we give you.',
      confirmLabel: 'Yes, delete my account',
      cancelLabel: 'Keep my account',
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    setProblem(null);
    try {
      setState(await requestAccountDeletion(reason));
    } catch (caught) {
      setProblem(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setState(await cancelAccountDeletion());
      setReason('');
    } catch (caught) {
      setProblem(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const requested = state?.status === 'requested';
  const days = state?.graceDays ?? 30;
  const support = state?.supportEmail || 'contact@lampose.com';
  const inFlight = (state?.activeOrders ?? 0) + (state?.activeBookings ?? 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Delete account" onBack={() => router.back()} />

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{ padding: layout.gutter, gap: space[5] }}
        keyboardShouldPersistTaps="handled"
      >
        {loading && !state ? (
          <Text variant="body" color="secondary">Checking your account…</Text>
        ) : requested ? (
          <>
            <InlineAlert
              tone="warning"
              title={`Scheduled for deletion on ${longDate(state?.scheduledFor)}`}
              body="Until then your account works as normal. After that date your account and its personal data are deleted."
            />
            {inFlight > 0 ? (
              <InlineAlert
                tone="info"
                title={`${inFlight} ${inFlight === 1 ? 'order or stay' : 'orders or stays'} still in progress`}
                body="They carry on as normal, and any refund owed to you is still paid."
              />
            ) : null}
            <View style={{ gap: space[1] }}>
              <Text variant="caption" color="tertiary">
                Requested {longDate(state?.requestedAt) || '—'}
              </Text>
            </View>
            <View style={{ gap: space[2] }}>
              <Button
                label="Cancel deletion request"
                loadingLabel="Cancelling"
                variant="secondary"
                loading={busy}
                disabled={busy}
                fullWidth
                onPress={undo}
              />
              <Text variant="caption" color="tertiary">
                Cancelling keeps your account exactly as it is — bookings, saved places and all.
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text variant="body" color="secondary">
              Deleting your Lampose account is permanent once it is carried out. We schedule it{' '}
              {days} days from today, so anything in progress can finish, any refund owed to you can
              be paid, and you can change your mind.
            </Text>

            <View style={{ gap: space[2] }}>
              <Text variant="bodyStrong">What is deleted</Text>
              {WHAT_GOES.map((line) => (
                <Text key={line} variant="body">{`•  ${line}`}</Text>
              ))}
              <Text variant="caption" color="tertiary">
                Completed bookings, rental agreements, food orders and payments are kept for as long
                as the law requires, separately from your profile — you may need them too.
              </Text>
            </View>

            <TextField
              label="Why are you leaving?"
              optional
              value={reason}
              onChangeText={setReason}
              multiline
              helper="It does not affect the request."
            />

            <Button
              label="Delete my account"
              loadingLabel="Sending"
              variant="destructive"
              loading={busy}
              disabled={busy}
              fullWidth
              onPress={submit}
            />
          </>
        )}

        {problem ? <InlineAlert tone="error" title="That did not work" body={problem} /> : null}

        <Text variant="caption" color="tertiary">
          Need help? Write to{' '}
          <Text
            variant="caption"
            style={{ color: colors.brandInk }}
            onPress={() => Linking.openURL(`mailto:${support}`).catch(() => {})}
          >
            {support}
          </Text>
          .
        </Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
