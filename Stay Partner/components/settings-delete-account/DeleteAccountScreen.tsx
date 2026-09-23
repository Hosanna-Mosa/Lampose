/*
 * Delete account — a property owner asking to leave, from inside the app.
 *
 * The App Store and Google Play both require that an account created in the app
 * can be deleted from the app. This is that door; lampose.com/delete-account is
 * the other one, and both write the same request.
 *
 * What the screen promises is what the server does: the account is SCHEDULED for
 * deletion `graceDays` out, not emptied on the tap. Guests already staying are not
 * stranded and payouts owed are still paid — so the screen says so, and inside the
 * window it offers the way back.
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Card, Input, Screen, Text, TopHeader, useAlert } from '@/components/common';
import {
  cancelAccountDeletion,
  fetchAccountDeletion,
  requestAccountDeletion,
  type AccountDeletion,
} from '@/services/api/accountDeletion.api';
import { ApiError } from '@/services';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

const WHAT_GOES = [
  'Your owner profile — name, email and business name',
  'Your mobile number and address',
  'Bank and payout details',
  'Staff you invited and your notifications',
];

/** "12 October 2026" — a date somebody can hold against a calendar. */
const longDate = (value: string | null | undefined) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

const messageOf = (caught: unknown) =>
  caught instanceof ApiError ? caught.displayMessage : 'Something went wrong. Please try again.';

export function DeleteAccountScreen() {
  const c = useColors();
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
      message: 'Your Stay Partner account will be scheduled for deletion. You can cancel from this '
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

  return (
    <Screen header={<TopHeader title="Delete account" showBack />} background="bg">
      <View style={styles.container}>
        {loading && !state ? (
          <Text variant="body" color="textSecondary">Checking your account…</Text>
        ) : requested ? (
          <>
            <Card style={[styles.card, { backgroundColor: c.warningTint }]}>
              <Text variant="label" style={{ color: c.warningOnTint, fontFamily: fonts.semibold }}>
                Scheduled for deletion on {longDate(state?.scheduledFor)}
              </Text>
              <Text variant="bodySm" style={{ color: c.warningOnTint }}>
                Until then your account works as normal and anything owed to you is paid. After that
                date your account and its personal data are deleted.
              </Text>
            </Card>
            {state?.activeBookings ? (
              <Text variant="bodySm" color="textSecondary">
                {state.activeBookings} booking{state.activeBookings === 1 ? ' is' : 's are'} still
                running at your property. Guests already staying are not affected.
              </Text>
            ) : null}
            <Card style={styles.card}>
              <View style={styles.fact}>
                <Text variant="bodySm" color="textSecondary">Requested</Text>
                <Text variant="bodySm">{longDate(state?.requestedAt) || '—'}</Text>
              </View>
              <View style={styles.fact}>
                <Text variant="bodySm" color="textSecondary">Deleted on or after</Text>
                <Text variant="bodySm">{longDate(state?.scheduledFor) || '—'}</Text>
              </View>
            </Card>
            <Button
              label={busy ? 'Cancelling…' : 'Cancel deletion request'}
              variant="secondary"
              loading={busy}
              onPress={undo}
            />
            <Text variant="caption" color="textSecondary">
              Cancelling keeps your account exactly as it is — properties, bookings, payout details
              and all.
            </Text>
          </>
        ) : (
          <>
            <Text variant="body" color="textSecondary">
              Deleting your Lampose Stay Partner account is permanent once it is carried out. We
              schedule it {days} days from today, so anything owed to you can be paid and you can
              change your mind.
            </Text>

            <Card style={styles.card}>
              <Text variant="label" style={{ fontFamily: fonts.semibold }}>What is deleted</Text>
              {WHAT_GOES.map((line) => (
                <Text key={line} variant="bodySm">{`•  ${line}`}</Text>
              ))}
              <Text variant="caption" color="textSecondary">
                Booking and payout records are kept for as long as the law requires, separately from
                your profile. Your property listing is held separately — say so below if you also
                want it taken off Lampose.
              </Text>
            </Card>

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
              label={busy ? 'Sending…' : 'Delete my account'}
              variant="dangerOutline"
              loading={busy}
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16, paddingBottom: 24 },
  card: { padding: 16, borderRadius: 16, gap: 10 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
});
