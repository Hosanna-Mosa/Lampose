import { useEffect, useState } from 'react';
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
} from '@/components/ui';
import { fetchBookings } from '@/services/api/domain.api';
import { toBooking, type Booking } from '@/lib/bookings';
import { useSupportActions } from '@/services/hooks/useSupport';
import { ApiError } from '@/services/api/client';
import { radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

const DISPUTE_REASONS = ['Guest damage', 'False review', 'Booking manipulation', 'Other'] as const;
type DisputeReason = (typeof DISPUTE_REASONS)[number];

/** "#LB-1182 · Arjun Kapoor". */
function bookingLabel(b: Booking): string {
  return `#${b.id} · ${b.guest}`;
}

/**
 * A dispute — for real. This was `New ticket`'s twin in name only: it posted
 * to `createTicket` in `lib/support.ts`, a fake that appended to an
 * in-memory array and reset on every restart, and nothing in the app ever
 * linked to this screen either — the "Get help" button on an active booking
 * sent a `topic: 'guest'` param that nothing read. Both are fixed here: this
 * now files a REAL ticket (`category: 'guest'` — see `support.audiences.js`),
 * and `booking/active.tsx` opens this screen directly instead of dropping
 * that param on the floor.
 */
export default function RaiseDisputeScreen() {
  const c = useColors();
  const router = useRouter();
  const { create } = useSupportActions();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [bookingLabelValue, setBookingLabelValue] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  useEffect(() => {
    fetchBookings()
      .then((raw) => setBookings((raw || []).map((b: any) => toBooking(b))))
      .catch(() => setBookings([]));
  }, []);

  const bookingOptions = bookings.map(bookingLabel);
  const linkedBooking = bookings.find((b) => bookingLabel(b) === bookingLabelValue);

  const canSubmit = Boolean(reason) && Boolean(linkedBooking) && description.trim().length > 0 && !create.isPending;

  const submit = async () => {
    if (!reason || !linkedBooking || !canSubmit) return;
    try {
      const body = `${reason} — booking #${linkedBooking.id} (${linkedBooking.guest}, `
        + `${linkedBooking.roomType}).\n\n${description.trim()}`;
      const thread = await create.mutateAsync({
        category: 'guest',
        body,
        placeLabel: linkedBooking.roomType,
      });
      router.replace(`/support/ticket?id=${thread.reference}`);
    } catch {
      /* create.error renders below. */
    }
  };

  return (
    <Screen
      padX={22}
      contentStyle={styles.fill}
      footer={<Button label="Submit dispute" onPress={submit} disabled={!canSubmit} loading={create.isPending} />}
      stickyHeader={
        <View style={styles.backRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </View>
      }
    >
      <Text variant="pageTitleSm" style={styles.title}>
        Raise a dispute
      </Text>

      <View style={[styles.banner, { backgroundColor: c.accentTint }]}>
        <Icon name="info" size={16} color={c.accent} strokeWidth={2} style={styles.bannerIcon} />
        <Text variant="bodySm" color="accentInkDeep" style={styles.bannerText}>
          This goes to Lampose support as a ticket, same as anything else you raise — you can
          follow it from the Support tab.
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

      {create.error ? (
        <Text variant="bodySm" color="error" style={styles.field}>
          {create.error instanceof ApiError ? create.error.displayMessage : 'Could not send that. Try again.'}
        </Text>
      ) : null}
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
