import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet, Button, Checkbox, Text } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { useBooking, useBookingActions } from '@/services/hooks/useBookings';

/**
 * Checkout confirmation — one tap to close out the stay, behind a two-item
 * checklist.
 *
 * DEVIATION: the design draws both boxes already ticked. A checklist that
 * arrives pre-satisfied is decoration, so these start empty and Confirm waits
 * for both — the point is that the owner has actually looked.
 */
export default function CheckoutSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  /* Was `getBooking(id)`, the fixture lookup, so the subtitle was blank for
     every real booking. See `services/hooks/useBookings.ts`. */
  const { booking } = useBooking(id);
  const { checkOut } = useBookingActions(id);

  const [inspected, setInspected] = useState(false);
  const [keyReturned, setKeyReturned] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const ready = inspected && keyReturned && !checkOut.isPending;
  const close = () => router.back();

  /*
   * Checking out gives the bed back, so a failure that looked like a success
   * would leave an owner believing a room was free that the server still has
   * occupied. It used to be `.catch(() => {})` followed by an unconditional
   * navigation; now the sheet stays open and says what went wrong.
   */
  const handleCheckout = () => {
    if (!id) return;
    setFailure(null);
    checkOut.mutate(undefined, {
      onSuccess: () => router.replace('/bookings'),
      onError: (err) => {
        setFailure(
          err instanceof ApiError
            ? err.displayMessage
            : 'We could not check them out. Nothing has changed.',
        );
      },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }}
      />
      <BottomSheet
        title="Confirm checkout"
        subtitle={booking ? `${booking.guest} · ${booking.roomType}` : undefined}
        onClose={close}
        footer={
          <>
            <Button label="Not yet" variant="secondary" onPress={close} style={styles.action} />
            <Button
              label={checkOut.isPending ? 'Checking out…' : 'Confirm checkout'}
              onPress={handleCheckout}
              loading={checkOut.isPending}
              disabled={!ready}
              style={styles.action}
            />
          </>
        }
      >
        <View style={styles.checks}>
          <Checkbox label="Room inspected" checked={inspected} onChange={setInspected} />
          <Checkbox label="Key / access returned" checked={keyReturned} onChange={setKeyReturned} />
          {failure ? (
            <Text variant="bodySm" color="error" style={styles.failure}>
              {failure}
            </Text>
          ) : null}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  checks: { marginBottom: 18 },
  failure: { marginTop: 10, lineHeight: 18 },
  action: { flex: 1 },
});
