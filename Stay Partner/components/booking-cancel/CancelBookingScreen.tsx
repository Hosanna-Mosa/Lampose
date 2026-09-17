import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Box, Spinner } from '@/components/common';
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
  Toast,
  EmptyState,
} from '@/components/common';
import { useAlert } from '@/components/common';
import { useBooking, useBookingActions } from '@/services/hooks/useBookings';
import { ApiError } from '@/services/api/client';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { backRowBase, centred } from '@/components/common/utils/styles';

const REASONS = ['Property unavailable', 'Maintenance issue', 'Guest request', 'Other'];

const HOURS_48 = 48 * 60 * 60 * 1000;

/**
 * Calling off a confirmed booking.
 *
 * ## Why this screen looked broken
 *
 * It read `getBooking(id)` — the fixture array in `lib/bookings.ts`, whose ids
 * are `LB-1182` and friends. A real booking id matched nothing, so tapping
 * "Cancel booking" on the detail screen navigated here and landed on "Booking
 * not found": from the outside, a button that did nothing. It reads the server
 * now, through the same hook every other booking screen uses.
 *
 * ## And why it would have lied even when it worked
 *
 * The old handler was `await cancelBookingApi(id).catch(() => {})` followed
 * unconditionally by `router.replace('/bookings')`. A cancellation refused by
 * the server, or one that never left the handset, looked exactly like one that
 * succeeded. An owner who believes a booking is cancelled and finds the guest
 * at the door has been lied to by the app, so the failure is now shown and the
 * screen stays put.
 *
 * ## The second ask
 *
 * Cancelling is irreversible, it hands the bed back, and it sends the student
 * a notification saying their room is gone. The reason chips are not a
 * confirmation — they are a form, and people fill forms in without deciding.
 * So the destructive button asks once more, natively, and only the second tap
 * calls the server.
 */
export function CancelBookingScreen() {
  const c = useColors();
  const { confirm } = useAlert();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { booking, notFound, isPending } = useBooking(id);
  const { cancel } = useBookingActions(id);

  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const commit = () => {
    if (!reason || !id) return;
    setFailure(null);
    cancel.mutate(
      { reason, note: note.trim() || undefined },
      {
        onSuccess: () => {
          /* `replace`, not `back`: the detail screen underneath is showing a
             booking that no longer exists in that state, and returning to it
             would offer Start check-in on a cancelled stay. */
          router.replace('/bookings');
        },
        onError: (err) => {
          setFailure(
            err instanceof ApiError
              ? err.displayMessage
              : 'We could not cancel that booking. Nothing has changed.',
          );
        },
      },
    );
  };

  /*
   * The second ask.
   *
   * It used to be the PLATFORM dialog, on the reasoning that this is "the one
   * dialog in the flow that must not look like part of the form it is
   * guarding". The instinct was right and the tool was wrong: the OS dialog
   * does not look like part of the form because it does not look like part of
   * the APP — different face, different shape on each OS, and a filled blue
   * "Cancel booking" sitting exactly where a thumb rests.
   *
   * `AppAlert` separates it the way this app separates things: a scrim, a
   * card lifted off the page, the destructive choice as an outline, and the
   * safe one underneath it where the thumb actually is.
   */
  const askThenCancel = async () => {
    if (!reason || !booking) return;
    const ok = await confirm({
      title: 'Cancel this booking?',
      message: `${booking.guest}'s booking will be cancelled and they will be told straight away. `
        + 'The bed goes back on your availability. This cannot be undone.',
      confirmLabel: 'Cancel booking',
      cancelLabel: 'Keep booking',
      destructive: true,
    });
    if (ok) commit();
  };

  if (isPending && !booking) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <Box style={styles.loading}>
          <Spinner color={c.accent} />
        </Box>
      </Screen>
    );
  }

  if (!booking) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <EmptyState
          icon="search"
          title="Booking not found"
          body={notFound ? 'It may already have been cancelled.' : 'We could not load this booking.'}
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
        <Box style={styles.actions}>
          <Button
            label="Go back"
            variant="secondary"
            onPress={() => router.back()}
            disabled={cancel.isPending}
            style={styles.action}
          />
          <Button
            label={cancel.isPending ? 'Cancelling…' : 'Cancel booking'}
            variant="destructive"
            onPress={() => { void askThenCancel(); }}
            loading={cancel.isPending}
            disabled={!reason || cancel.isPending}
            style={styles.action}
          />
        </Box>
      }
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>

          <Text variant="screenTitle" style={styles.title}>
            Cancel booking
          </Text>
        </>
      }
    >
      {/* The server's own words. "Already cancelled" and "you are offline" need
          different things from an owner. */}
      {failure ? <Toast message={failure} tone="error" onDismiss={() => setFailure(null)} /> : null}

      <Text variant="bodySm" color="textSecondary" style={styles.who}>
        {booking.guest} · {booking.roomType || 'Room not set'}
      </Text>

      <Box style={[styles.warning, { backgroundColor: c.warningTint }]}>
        <Icon name="alert-circle" size={16} color={c.warningOnTint} strokeWidth={2} />
        <Text style={[styles.warningText, { color: c.warningInk }]}>
          {imminent
            ? 'Check-in is within 48 hours. Cancelling now refunds the guest in full and may lower your response rating.'
            : 'Owner cancellations within 48h of check-in may lower your response rating and refund the guest in full.'}
        </Text>
      </Box>

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

      <Box style={styles.spacer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { ...centred },
  backRow: { ...backRowBase, marginBottom: 4 },
  title: { marginBottom: 6 },
  who: { marginBottom: 14 },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: radius.control,
    marginBottom: 20,
  },
  warningText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 17.5 },
  label: { marginBottom: 4 },
  chips: { marginBottom: 12 },
  spacer: { flex: 1, minHeight: 16 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
});
