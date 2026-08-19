import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet, Button, Chip, ChipRow, Input, Text } from '@/components/ui';
import { useAnswerRequest, useStayRequest } from '@/services/hooks/useStayRequests';

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

  const { request } = useStayRequest(id);
  const answer = useAnswerRequest(id);

  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const close = () => router.back();

  const confirm = () => {
    if (!id) return;

    /*
     * The chip, plus whatever they typed.
     *
     * Sent as the owner's own words and kept apart from the server's
     * machine-readable reason, which on this path is always OWNER_DECLINED.
     * The student is shown neither — a decline reads as "no availability"
     * to them, because "price too low" is a negotiation this product does not
     * have and "requirements not met" is a sentence nobody should receive
     * about themselves.
     */
    const written = [reason, note.trim()].filter(Boolean).join(' — ');

    answer.decline.mutate(written || null, {
      onSuccess: () => {
        /* The request leaves Pending, so returning to the detail would strand
           you on a screen for something that is no longer live. */
        router.replace('/requests');
      },
      onError: (error) => {
        /* Somebody got there first: the student withdrew, the clock ran out,
           or this owner accepted it on another device. The server names
           which, and closing the sheet puts them back on a detail screen that
           is already showing the real outcome. */
        Alert.alert('Could not decline', (error as { displayMessage?: string }).displayMessage
          ?? 'This request can no longer be changed.');
        router.back();
      },
    });
  };

  const subtitle = request
    ? `${request.customer?.name ?? 'A student'}${request.sharing?.label ? ` · ${request.sharing.label}` : ''}`
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
              label={answer.decline.isPending ? 'Declining…' : 'Confirm reject'}
              variant="destructive"
              onPress={confirm}
              /* A reason is required by this screen, not by the server — an
                 owner who declines without saying why leaves nothing to look
                 back at when a property's acceptance rate is questioned. */
              disabled={!reason || answer.isBusy}
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
