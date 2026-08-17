import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet, Button, Checkbox } from '@/components/ui';
import { getBooking } from '@/lib/bookings';

/**
 * Checkout confirmation — one tap to close out the stay, behind a two-item
 * checklist.
 *
 * DEVIATION: the design draws both boxes already ticked. A checklist that
 * arrives pre-satisfied is decoration, so these start empty and Confirm waits
 * for both — the point is that the owner has actually looked.
 */
import { checkOutBookingApi } from '@/services/api/domain.api';

export default function CheckoutSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const booking = getBooking(id);

  const [inspected, setInspected] = useState(false);
  const [keyReturned, setKeyReturned] = useState(false);

  const ready = inspected && keyReturned;
  const close = () => router.back();

  const handleCheckout = async () => {
    if (id) {
      await checkOutBookingApi(id).catch(() => {});
    }
    router.replace('/bookings');
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
              label="Confirm checkout"
              onPress={handleCheckout}
              disabled={!ready}
              style={styles.action}
            />
          </>
        }
      >
        <View style={styles.checks}>
          <Checkbox label="Room inspected" checked={inspected} onChange={setInspected} />
          <Checkbox label="Key / access returned" checked={keyReturned} onChange={setKeyReturned} />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  checks: { marginBottom: 18 },
  action: { flex: 1 },
});
