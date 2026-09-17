import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet, Button, Text } from '@/components/common';
import { useAlert } from '@/components/common';
import { maskedNumber, toPayoutMethod, type PayoutMethod } from '@/lib/payouts';
import {
  deletePaymentMethodApi, fetchPaymentMethodsApi, setPrimaryPaymentMethodApi,
} from '@/services/api/domain.api';
import { ApiError } from '@/services/api/client';

/**
 * The two things you can do to a saved account.
 *
 * ## Why this sheet did nothing at all before
 *
 * It resolved the account with `getMethod(id)` against `lib/payouts.ts`'s
 * in-memory fixture, while the list behind it came from the API. The id was
 * always a real database id and the fixture never held one, so the lookup
 * returned undefined every time: "Make default" was permanently disabled by
 * its own `!method` guard, and "Remove" looked enabled but its handler was
 * wrapped in `if (method)` and so closed the sheet without doing anything.
 * An owner could not delete a bank account from this app.
 *
 * Both actions now go to the server. "Make default" has an endpoint to call
 * for the first time — there was none, which is why the button could not have
 * worked even once it found its account.
 *
 * ## Why it re-reads rather than taking the row as a param
 *
 * A sheet opened over a stale list would otherwise offer to delete an account
 * that is already gone. One read, by id, and a refusal if it is not there.
 */
export function MethodActionsSheetScreen() {
  const router = useRouter();
  const { confirm } = useAlert();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [method, setMethod] = useState<PayoutMethod | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => router.back();

  useEffect(() => {
    let live = true;
    fetchPaymentMethodsApi()
      .then((rows) => {
        if (!live) return;
        const all = (rows || []).map(toPayoutMethod);
        setCount(all.length);
        setMethod(all.find((m) => m.id === String(id)) ?? null);
      })
      .catch(() => { if (live) setError('We could not load that account.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  const makeDefault = async () => {
    if (!method || busy) return;
    setBusy(true);
    setError('');
    try {
      await setPrimaryPaymentMethodApi(method.id);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'We could not change your default account.');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!method || busy) return;

    /* Deleting where money goes is worth a sentence and a second press. */
    const sure = await confirm({
      tone: 'warning',
      title: 'Remove this account?',
      message: `Payouts will stop going to ${maskedNumber(method)}.${
        count <= 1 ? ' This is your only saved account — add another before requesting a payout.' : ''
      }`,
      confirmLabel: 'Remove',
      cancelLabel: 'Keep it',
      destructive: true,
    });
    if (!sure) return;

    setBusy(true);
    setError('');
    try {
      await deletePaymentMethodApi(method.id);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'We could not remove that account.');
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }}
      />
      <BottomSheet
        title={method?.bankName ?? (loading ? 'Loading…' : 'Payout method')}
        subtitle={method ? maskedNumber(method) : undefined}
        onClose={close}
        footer={(
          <>
            <Button label="Close" variant="secondary" onPress={close} style={styles.action} />
            <Button
              label="Make default"
              onPress={() => { void makeDefault(); }}
              disabled={!method || method.isDefault || busy}
              loading={busy}
              style={styles.action}
            />
          </>
        )}
      >
        {method?.holderName ? (
          <Text variant="caption" color="textTertiary" style={styles.holder}>
            {method.holderName}
            {method.ifsc ? ` · ${method.ifsc}` : ''}
          </Text>
        ) : null}

        <Button
          label="Remove this account"
          variant="dangerOutline"
          disabled={!method || busy}
          onPress={() => { void remove(); }}
          style={styles.remove}
        />

        {error ? (
          <Text variant="caption" color="errorInk" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  holder: { marginBottom: 12 },
  remove: { marginBottom: 18 },
  error: { marginBottom: 12 },
  action: { flex: 1 },
});
