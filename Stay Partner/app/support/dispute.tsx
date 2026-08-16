import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Icon,
  Chip,
  ChipRow,
  Input,
  Select,
  EvidenceGrid,
} from '@/components/ui';
import { ALL_BOOKINGS, type Booking } from '@/lib/bookings';
import { createTicket, DISPUTE_REASONS, type DisputeReason } from '@/lib/support';
import { radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

/** "#LB-1182 · Arjun Kapoor" — same linked-booking label as New ticket. */
function bookingLabel(b: Booking): string {
  return `#${b.id} · ${b.guest}`;
}

/**
 * Structurally this is New ticket's twin — same info banner, chips, linked
 * booking, description, evidence shape. What differs: the reason chips are
 * dispute-specific, the linked booking is required (the design shows no
 * "(optional)" annotation here, unlike New ticket), and there's no separate
 * disputes list anywhere in the design set — a submitted dispute files as a
 * support ticket under category "Dispute", so it surfaces on the real
 * Support list rather than vanishing into nothing.
 */
export default function RaiseDisputeScreen() {
  const c = useColors();
  const router = useRouter();

  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [bookingLabelValue, setBookingLabelValue] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  // Fake evidence, same as New ticket — add/remove is real, no camera/picker is.
  const [evidenceCount, setEvidenceCount] = useState(0);

  const bookingOptions = ALL_BOOKINGS.map(bookingLabel);
  const linkedBooking = ALL_BOOKINGS.find((b) => bookingLabel(b) === bookingLabelValue);

  const canSubmit = Boolean(reason) && Boolean(linkedBooking) && description.trim().length > 0;

  const submit = () => {
    if (!reason || !linkedBooking || !canSubmit) return;
    createTicket({
      category: 'Dispute',
      subject: reason,
      description: description.trim(),
      linkedBookingId: linkedBooking.id,
      evidenceCount: evidenceCount || undefined,
    });
    router.replace('/support');
  };

  return (
    <Screen
      padX={22}
      contentStyle={styles.fill}
      footer={<Button label="Submit dispute" onPress={submit} disabled={!canSubmit} />}
    >
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <Text variant="pageTitleSm" style={styles.title}>
        Raise a dispute
      </Text>

      <View style={[styles.banner, { backgroundColor: c.accentTint }]}>
        <Icon name="info" size={16} color={c.accent} strokeWidth={2} style={styles.bannerIcon} />
        <Text variant="bodySm" color="accentInkDeep" style={styles.bannerText}>
          Disputes are reviewed within 3–5 business days. Add as much evidence as you can.
        </Text>
      </View>

      <Text variant="label" style={styles.label}>
        Reason
      </Text>
      <ChipRow style={styles.field}>
        {DISPUTE_REASONS.map((r) => (
          <Chip
            key={r}
            label={r}
            selected={reason === r}
            onPress={() => setReason(reason === r ? null : r)}
          />
        ))}
      </ChipRow>

      <View style={styles.field}>
        <Select
          label="Linked booking"
          options={bookingOptions}
          value={bookingLabelValue}
          onChange={setBookingLabelValue}
          placeholder="Select a booking"
        />
      </View>

      <Input
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Describe what happened…"
        multiline
        minHeight={90}
        containerStyle={styles.field}
      />

      <Text variant="label" style={styles.label}>
        Evidence photos
      </Text>
      <EvidenceGrid count={evidenceCount} onChange={setEvidenceCount} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 2 },
  title: { marginBottom: 14 },

  banner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderRadius: radius.control,
    padding: 12,
    marginBottom: 16,
  },
  bannerIcon: { marginTop: 1 },
  bannerText: { flex: 1, lineHeight: 17 },

  label: { marginBottom: 8 },
  field: { marginBottom: 16 },
});
