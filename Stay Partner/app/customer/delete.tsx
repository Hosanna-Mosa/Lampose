import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet, Button, Text } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { deleteCustomer } from '@/services/api/addCustomer.api';

/**
 * Deleting a customer record is destructive and permanent, so it asks first —
 * the same shape `inventory/delete-rule.tsx` uses for the same reason.
 *
 * The subtitle names the guest rather than saying "this record". A confirm
 * dialog that does not say what it is about is one people learn to tap through,
 * and the row underneath it is somebody's identity documents.
 *
 * The Aadhar photograph goes with the row: the server deletes the Cloudinary
 * asset off the stored `publicId`. Dropping the record and leaving a scan of
 * somebody's ID on a public CDN would be the worst of both outcomes, and the
 * copy says so plainly rather than leaving it to be assumed.
 */
export default function DeleteCustomerSheet() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => router.back();

  const remove = async () => {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCustomer(id);
      /* Back to the list, which refetches on focus and will no longer hold it. */
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'We could not delete that.');
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }}
      />
      <BottomSheet
        title="Delete this customer?"
        subtitle={
          name
            ? `${name} — their details and the Aadhar photograph are removed for good.`
            : 'Their details and the Aadhar photograph are removed for good.'
        }
        onClose={close}
        footer={
          <>
            <Button label="Keep it" variant="secondary" onPress={close} style={styles.action} />
            <Button
              label={busy ? 'Deleting…' : 'Delete'}
              variant="destructive"
              loading={busy}
              disabled={busy}
              onPress={remove}
              style={styles.action}
            />
          </>
        }
      >
        {error ? (
          <Text variant="badge" color="error" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  error: { marginTop: 4 },
});
