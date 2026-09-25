import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, InlineAlert, Text, TextField, useAlert } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { ApiError, setAuthToken } from '@/services';
import {
  cancelAccountDeletion,
  fetchAccountDeletion,
  requestAccountDeletion,
  type AccountDeletion,
} from '@/services/api/accountDeletion.api';

/**
 * Delete account — a student leaving, from inside the app.
 *
 * The App Store and Google Play both require that an account created in the
 * app can be deleted from the app. This is that door; lampose.com/delete-account
 * is the other one, and both reach the same eraser.
 *
 * What the screen promises is what the server does: the account is deleted on
 * the tap, not scheduled. The token dies with it (every later call answers
 * `ACCOUNT_GONE`), so success signs the student out on the spot and returns to
 * the entry route, exactly as Log out does.
 *
 * `status: 'requested'` is only ever an account that asked while deletion was
 * still scheduled; it keeps a way to withdraw that older request.
 *
 * Reached from BOTH profiles — the stay side's and Food's — because it is one
 * account either way.
 */

const WHAT_GOES = [
  'Your profile — name, email and mobile number',
  'Saved places, favourites and your address book',
  'App and notification preferences',
];

const messageOf = (caught: unknown) =>
  caught instanceof ApiError ? caught.displayMessage : 'Something went wrong. Please try again.';

export default function DeleteAccountScreen() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { alert, confirm } = useAlert();
  const { signOut } = useAuth();

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
      title: 'Delete your account now?',
      message: 'This deletes your Lampose account immediately and cannot be undone. '
        + 'Bookings, orders, payments and a copy of your account details are kept for legal and '
        + 'accounting records.',
      confirmLabel: 'Delete my account',
      cancelLabel: 'Keep my account',
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    setProblem(null);
    let result;
    try {
      result = await requestAccountDeletion(reason);
    } catch (caught) {
      setProblem(messageOf(caught));
      setBusy(false);
      return;
    }
    if (!result.deleted && result.status !== 'completed') {
      setBusy(false);
      setProblem('Something went wrong. Please try again.');
      return;
    }

    /*
     * The account is gone, and so is its token. Dropped from the client first
     * so the revoke and device-unregister calls inside `signOut` go out
     * without it — sent with it, each answers `ACCOUNT_GONE` and the app
     * would follow a deletion with a "Session expired" alert. Everything else
     * is the ordinary Log out, then the same route it takes.
     */
    setAuthToken(null);
    await signOut();
    router.replace('/');
    void alert({ title: 'Your account has been deleted', tone: 'success', dismissLabel: 'Close' });
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

  const legacyRequest = state?.status === 'requested';
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
        ) : (
          <>
            <Text variant="body" color="secondary">
              Deleting your Lampose account happens immediately and cannot be undone. You will be
              signed out, and this account cannot be restored.
            </Text>

            {legacyRequest ? (
              <View style={{ gap: space[2] }}>
                <InlineAlert
                  tone="info"
                  title="You have an older deletion request pending"
                  body="Deleting now replaces it. If you would rather keep your account, cancel that request."
                />
                <Button
                  label="Cancel request"
                  loadingLabel="Cancelling"
                  variant="secondary"
                  loading={busy}
                  disabled={busy}
                  fullWidth
                  onPress={undo}
                />
              </View>
            ) : null}

            {inFlight > 0 ? (
              <InlineAlert
                tone="warning"
                title={`${inFlight} ${inFlight === 1 ? 'order or stay' : 'orders or stays'} still in progress`}
                body="They stay exactly as they are, but you will no longer be able to manage them from this account."
              />
            ) : null}

            <View style={{ gap: space[2] }}>
              <Text variant="bodyStrong">What is deleted</Text>
              {WHAT_GOES.map((line) => (
                <Text key={line} variant="body">{`•  ${line}`}</Text>
              ))}
              <Text variant="caption" color="tertiary">
                Bookings, orders, payments and a copy of your account details are kept for legal and
                accounting records.
              </Text>
            </View>

            <TextField
              label="Why are you leaving?"
              optional
              value={reason}
              onChangeText={setReason}
              multiline
              helper="Optional — it helps us improve."
            />

            <Button
              label="Delete my account"
              loadingLabel="Deleting"
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
