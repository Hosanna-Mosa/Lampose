import { StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet, Button } from '@/components/ui';
import { METHODS, getMethod, maskedNumber, removeMethod, setDefaultMethod } from '@/lib/payouts';

/**
 * The design puts a chevron on non-default methods but has no screen behind it.
 * These are the only two things you can do to a saved account, so they live in
 * a sheet rather than an invented detail page.
 */
export default function MethodActionsSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const method = getMethod(id);
  const close = () => router.back();

  // Removing the last account would leave payouts with nowhere to land.
  const canRemove = METHODS.length > 1;

  return (
    <>
      <Stack.Screen
        options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }}
      />
      <BottomSheet
        title={method?.bankName ?? 'Payout method'}
        subtitle={method ? maskedNumber(method) : undefined}
        onClose={close}
        footer={
          <>
            <Button label="Close" variant="secondary" onPress={close} style={styles.action} />
            <Button
              label="Make default"
              onPress={() => {
                if (method) setDefaultMethod(method.id);
                close();
              }}
              disabled={!method || method.isDefault}
              style={styles.action}
            />
          </>
        }
      >
        <Button
          label={canRemove ? 'Remove this account' : 'Add another account to remove this one'}
          variant="dangerOutline"
          disabled={!canRemove}
          onPress={() => {
            if (method) removeMethod(method.id);
            close();
          }}
          style={styles.remove}
        />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  remove: { marginBottom: 18 },
  action: { flex: 1 },
});
