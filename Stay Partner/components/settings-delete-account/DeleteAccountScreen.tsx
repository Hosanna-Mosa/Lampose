/*
 * Delete account — a property owner leaving, from inside the app.
 *
 * The App Store and Google Play both require that an account created in the app
 * can be deleted from the app. This is that door; lampose.com/delete-account is
 * the other one, and both land on the same record.
 *
 * What the screen promises is what the server does: the account is deleted ON
 * THE TAP. There is no window and no way back, so the confirm says so plainly.
 * Open bookings are kept but can no longer be managed from here, and the token
 * is dead the moment the reply arrives — which is why success signs out with
 * the same `signOut` the Menu's Log out uses, rather than reading anything else.
 *
 * `requested` is legacy: an owner who asked under the old 30-day schedule. They
 * see a note and can still withdraw it; Delete still deletes immediately.
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Box, Button, Card, Input, Screen, Text, TopHeader, useAlert } from '@/components/common';
import {
  cancelAccountDeletion,
  fetchAccountDeletion,
  requestAccountDeletion,
  type AccountDeletion,
} from '@/services/api/accountDeletion.api';
import { ApiError, setAuthToken } from '@/services';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

const WHAT_GOES = [
  'Your owner profile — name, email and business name',
  'Your mobile number and address',
  'Bank and payout details',
  'Staff you invited and your notifications',
];

const messageOf = (caught: unknown) =>
  caught instanceof ApiError ? caught.displayMessage : 'Something went wrong. Please try again.';

export function DeleteAccountScreen() {
  const c = useColors();
  const router = useRouter();
  const { confirm, alert } = useAlert();
  const { signOut } = useAuth();

  const [state, setState] = useState<AccountDeletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'delete' | 'cancel' | null>(null);
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
      message: 'Your Stay Partner account is deleted immediately. This cannot be undone.',
      confirmLabel: 'Yes, delete my account',
      cancelLabel: 'Keep my account',
      destructive: true,
    });
    if (!ok) return;

    setBusy('delete');
    setProblem(null);
    try {
      const result = await requestAccountDeletion(reason);
      if (result.deleted === true || result.status === 'completed') {
        /* The token is already dead. Drop it from the client FIRST: `signOut`
           unregisters this phone's push token over the API, and with the dead
           token attached that call answers ACCOUNT_GONE — which the client
           treats as an expired session and follows with a "Session expired"
           alert on top of this one. The server already removed every device
           when it erased the account, so nothing is lost by skipping it. */
        setAuthToken(null);
        await signOut();
        router.replace('/login');
        alert({ title: 'Your account has been deleted', tone: 'success' });
        return;
      }
      setProblem('Your account could not be deleted. Please try again.');
    } catch (caught) {
      setProblem(messageOf(caught));
    } finally {
      setBusy(null);
    }
  };

  /* Legacy only: withdraws a request made under the old 30-day schedule. */
  const undo = async () => {
    setBusy('cancel');
    setProblem(null);
    try {
      setState(await cancelAccountDeletion());
    } catch (caught) {
      setProblem(messageOf(caught));
    } finally {
      setBusy(null);
    }
  };

  const legacyRequest = state?.status === 'requested';
  const support = state?.supportEmail || 'contact@lampose.com';

  return (
    <Screen header={<TopHeader title="Delete account" showBack />} background="bg">
      <Box style={styles.container}>
        {loading && !state ? (
          <Text variant="body" color="textSecondary">Checking your account…</Text>
        ) : (
          <>
            {legacyRequest ? (
              <Card style={[styles.card, { backgroundColor: c.warningTint }]}>
                <Text variant="label" style={{ color: c.warningOnTint, fontFamily: fonts.semibold }}>
                  An earlier deletion request is pending
                </Text>
                <Text variant="bodySm" style={{ color: c.warningOnTint }}>
                  You can withdraw it and keep your account, or delete it now below.
                </Text>
                <Button
                  label={busy === 'cancel' ? 'Cancelling…' : 'Cancel request'}
                  variant="secondary"
                  loading={busy === 'cancel'}
                  disabled={busy !== null}
                  onPress={undo}
                />
              </Card>
            ) : null}

            <Text variant="body" color="textSecondary">
              Deleting your Lampose Stay Partner account happens immediately and cannot be undone.
            </Text>

            <Card style={styles.card}>
              <Text variant="label" style={{ fontFamily: fonts.semibold }}>What is deleted</Text>
              {WHAT_GOES.map((line) => (
                <Text key={line} variant="bodySm">{`•  ${line}`}</Text>
              ))}
              <Text variant="bodySm">
                Your properties come off Lampose. Open bookings stay as they are, but can no longer
                be managed from this account.
              </Text>
              <Text variant="caption" color="textSecondary">
                Bookings, payments and a copy of your account details are kept for legal and
                accounting records.
              </Text>
            </Card>

            {state?.activeBookings ? (
              <Text variant="bodySm" color="textSecondary">
                {state.activeBookings} booking{state.activeBookings === 1 ? ' is' : 's are'} still
                open at your property.
              </Text>
            ) : null}

            <Input
              label="Why are you leaving?"
              optional
              value={reason}
              onChangeText={setReason}
              placeholder="Anything you would like us to know"
              maxLength={500}
              multiline
            />

            <Button
              label={busy === 'delete' ? 'Deleting…' : 'Delete my account'}
              variant="dangerOutline"
              loading={busy === 'delete'}
              disabled={busy !== null}
              onPress={submit}
            />
          </>
        )}

        {problem ? (
          <Text variant="bodySm" color="error">{problem}</Text>
        ) : null}

        <Text variant="caption" color="textSecondary">
          Need help? Write to{' '}
          <Text
            variant="caption"
            color="accent"
            onPress={() => Linking.openURL(`mailto:${support}`).catch(() => {})}
          >
            {support}
          </Text>
          .
        </Text>
      </Box>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16, paddingBottom: 24 },
  card: { padding: 16, borderRadius: 16, gap: 10 },
});
