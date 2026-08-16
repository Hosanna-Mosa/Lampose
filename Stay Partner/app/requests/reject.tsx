import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet, Button, Chip, ChipRow, Input, Text } from '@/components/ui';
import { formatRange } from '@/lib/format';
import { declineRequest, getRequest } from '@/lib/requests';

const REASONS = [
  'Dates unavailable',
  'Price too low',
  'Under maintenance',
  'Requirements not met',
  'Other',
];

/**
 * Reject reason — quick-select chips plus an optional note, over the detail.
 *
 * Declared as a transparent modal so the scrim sits on top of the screen behind
 * it and the back gesture dismisses it without extra handling.
 */
export default function RejectSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const request = getRequest(id);

  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const close = () => router.back();

  const confirm = () => {
    if (!id) return;
    declineRequest(id);
    // The request leaves Pending, so returning to the detail would strand you
    // on a screen for something that's no longer live.
    router.replace('/requests');
  };

  const subtitle = request
    ? `${request.guest} · ${formatRange(request.checkIn, request.checkOut)}`
    : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          headerShown: false,
        }}
      />
      <BottomSheet
        title="Reject this request?"
        subtitle={subtitle}
        onClose={close}
        footer={
          <>
            <Button label="Cancel" variant="secondary" onPress={close} style={styles.action} />
            <Button
              label="Confirm reject"
              variant="destructive"
              onPress={confirm}
              disabled={!reason}
              style={styles.action}
            />
          </>
        }
      >
        <Text variant="label" style={styles.label}>
          Reason
        </Text>
        <ChipRow style={styles.chips}>
          {REASONS.map((r) => (
            <Chip
              key={r}
              label={r}
              tone="danger"
              selected={reason === r}
              onPress={() => setReason(reason === r ? null : r)}
            />
          ))}
        </ChipRow>

        <Input
          label="Note"
          optional
          value={note}
          onChangeText={setNote}
          placeholder="Add a short note for the guest…"
          multiline
          minHeight={72}
          containerStyle={styles.note}
        />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 4 },
  chips: { marginBottom: 8 },
  note: { marginBottom: 16 },
  action: { flex: 1 },
});
