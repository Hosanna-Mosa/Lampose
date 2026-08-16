import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet, Button, Input } from '@/components/ui';
import type { RoomType } from '@/lib/inventory';
import { BASE_PRICE, setBasePrice } from '@/lib/pricing';

/** One-field editor behind the base-price card's edit affordance. */
export default function BasePriceSheet() {
  const router = useRouter();
  const { room } = useLocalSearchParams<{ room: RoomType }>();
  const current = room ? BASE_PRICE[room] : 0;
  const [value, setValue] = useState(String(current));

  const parsed = Number(value.replace(/[^\d]/g, ''));
  const valid = parsed > 0;
  const close = () => router.back();

  return (
    <>
      <Stack.Screen
        options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }}
      />
      <BottomSheet
        title="Base price"
        subtitle={room ? `${room} · per night` : undefined}
        onClose={close}
        footer={
          <>
            <Button label="Cancel" variant="secondary" onPress={close} style={styles.action} />
            <Button
              label="Save"
              disabled={!valid}
              onPress={() => {
                if (room && valid) setBasePrice(room, parsed);
                close();
              }}
              style={styles.action}
            />
          </>
        }
      >
        <View style={styles.body}>
          <Input
            label="Price per night"
            prefix="₹"
            value={value}
            onChangeText={setValue}
            keyboardType="number-pad"
            autoFocus
            error={value.length > 0 && !valid ? 'Enter an amount above zero.' : undefined}
          />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({ body: { marginBottom: 18 }, action: { flex: 1 } });
