import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Chip,
  ChipRow,
  Input,
  Select,
  EvidenceGrid,
} from '@/components/ui';
import { ALL_BOOKINGS, type Booking } from '@/lib/bookings';
import { createTicket, TICKET_CATEGORIES, type TicketCategory } from '@/lib/support';

/** "#LB-1182 · Arjun Kapoor" — the exact format the design shows for a linked booking. */
function bookingLabel(b: Booking): string {
  return `#${b.id} · ${b.guest}`;
}

export default function NewTicketScreen() {
  const router = useRouter();

  const [category, setCategory] = useState<TicketCategory | null>(null);
  const [bookingLabelValue, setBookingLabelValue] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  // Fake evidence — no real picker exists to wire up and verify here; see the
  // build record. The count is what's real: add and remove genuinely happen.
  const [evidenceCount, setEvidenceCount] = useState(0);

  const bookingOptions = ALL_BOOKINGS.map(bookingLabel);
  const linkedBooking = ALL_BOOKINGS.find((b) => bookingLabel(b) === bookingLabelValue);

  const canSubmit = Boolean(category) && description.trim().length > 0;

  const submit = () => {
    if (!category || !canSubmit) return;
    createTicket({
      category,
      description: description.trim(),
      linkedBookingId: linkedBooking?.id,
      evidenceCount: evidenceCount || undefined,
    });
    router.replace('/support');
  };

  return (
    <Screen
      padX={22}
            contentStyle={styles.fill}
            footer={<Button label="Submit ticket" onPress={submit} disabled={!canSubmit} />}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>
        </>
      }
    >

      <Text variant="pageTitleSm" style={styles.title}>
        New support ticket
      </Text>

      <Text variant="label" style={styles.label}>
        Category
      </Text>
      <ChipRow style={styles.field}>
        {TICKET_CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            label={cat}
            selected={category === cat}
            onPress={() => setCategory(category === cat ? null : cat)}
          />
        ))}
      </ChipRow>

      <View style={styles.field}>
        <Select
          label="Linked booking"
          optional
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
        minHeight={100}
        containerStyle={styles.field}
      />

      <Text variant="label" style={styles.label}>
        Attach evidence
        <Text variant="badge" color="textTertiary">
          {'  '}Optional
        </Text>
      </Text>
      <EvidenceGrid count={evidenceCount} onChange={setEvidenceCount} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 2 },
  title: { marginBottom: 18 },
  label: { marginBottom: 8 },
  field: { marginBottom: 16 },
});
