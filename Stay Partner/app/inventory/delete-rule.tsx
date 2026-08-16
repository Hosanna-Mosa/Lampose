import { StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet, Button } from '@/components/ui';
import { formatINR } from '@/lib/format';
import { deleteRule, getRule } from '@/lib/pricing';

/**
 * Deleting a pricing rule is destructive and instant, so it asks first. The
 * design has no confirmation for this — it has a 16px trash icon.
 */
export default function DeleteRuleSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const rule = getRule(id);
  const close = () => router.back();

  return (
    <>
      <Stack.Screen
        options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }}
      />
      <BottomSheet
        title="Delete this rule?"
        subtitle={rule ? `${rule.name} · ${rule.period} · ${formatINR(rule.amount)}` : undefined}
        onClose={close}
        footer={
          <>
            <Button label="Keep it" variant="secondary" onPress={close} style={styles.action} />
            <Button
              label="Delete rule"
              variant="destructive"
              onPress={() => {
                if (rule) deleteRule(rule.id);
                close();
              }}
              style={styles.action}
            />
          </>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({ action: { flex: 1 } });
