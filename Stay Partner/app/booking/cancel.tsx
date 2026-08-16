import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Icon,
  Chip,
  ChipRow,
  Input,
  EmptyState,
} from '@/components/ui';
import { getBooking } from '@/lib/bookings';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

const REASONS = ['Property unavailable', 'Maintenance issue', 'Guest request', 'Other'];

const HOURS_48 = 48 * 60 * 60 * 1000;

export default function CancelBookingScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const booking = getBooking(id);

  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');

  if (!booking) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <EmptyState
          icon="search"
          title="Booking not found"
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  // The design shows one warning, worded as though check-in is always imminent.
  // Whether it actually is changes what this cancellation costs the owner.
  const imminent = booking.checkIn.getTime() - Date.now() < HOURS_48;

  return (
    <Screen
      padX={22}
      contentStyle={styles.fill}
      footer={
        <View style={styles.actions}>
          <Button
            label="Go back"
            variant="secondary"
            onPress={() => router.back()}
            style={styles.action}
          />
          <Button
            label="Cancel booking"
            variant="destructive"
            onPress={() => router.replace('/bookings')}
            disabled={!reason}
            style={styles.action}
          />
        </View>
      }
    >
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <Text variant="screenTitle" style={styles.title}>
        Cancel booking
      </Text>

      <View style={[styles.warning, { backgroundColor: c.warningTint }]}>
        <Icon name="alert-circle" size={16} color={c.warningOnTint} strokeWidth={2} />
        <Text style={[styles.warningText, { color: c.warningInk }]}>
          {imminent
            ? 'Check-in is within 48 hours. Cancelling now refunds the guest in full and may lower your response rating.'
            : 'Owner cancellations within 48h of check-in may lower your response rating and refund the guest in full.'}
        </Text>
      </View>

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
        placeholder="Add a short note…"
        multiline
        minHeight={72}
      />

      <View style={styles.spacer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 4 },
  title: { marginBottom: 14 },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: radius.control,
    marginBottom: 20,
  },
  warningText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17.5 },
  label: { marginBottom: 4 },
  chips: { marginBottom: 12 },
  spacer: { flex: 1, minHeight: 16 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
});
