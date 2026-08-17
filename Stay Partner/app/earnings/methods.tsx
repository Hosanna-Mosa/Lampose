import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Icon, Badge, EmptyState } from '@/components/ui';
import { METHODS, maskedNumber, subscribeMethods, type PayoutMethod } from '@/lib/payouts';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

import { fetchPaymentMethodsApi } from '@/services/api/domain.api';

export default function PayoutMethodsScreen() {
  const router = useRouter();
  const [methods, setMethods] = useState<PayoutMethod[]>([]);

  const loadMethods = async () => {
    try {
      const items = await fetchPaymentMethodsApi();
      const mapped: PayoutMethod[] = (items || []).map((m: any) => ({
        id: m.id || m._id,
        bankName: m.type === 'upi' ? 'UPI' : 'Bank Account',
        accountHolder: m.accountName || 'Account Holder',
        accountNumber: m.accountNumber || m.upiId || 'XXXX4321',
        ifscCode: m.ifsc || 'HDFC0001234',
        isDefault: Boolean(m.isPrimary),
      }));
      setMethods(mapped);
    } catch (err) {
      console.warn('Failed to load payment methods:', err);
    }
  };

  useEffect(() => {
    loadMethods();
  }, []);

  return (
    <Screen
      contentStyle={styles.stack}
            footer={
              <Button
                label="+ Add payout method"
                variant="secondary"
                onPress={() => router.push('/earnings/add-method')}
              />
            }
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>

          <Text variant="screenTitle" style={styles.title}>
            Payout methods
          </Text>
        </>
      }
    >

      {methods.length > 0 ? (
        methods.map((m) => (
          <MethodRow
            key={m.id}
            method={m}
            onPress={
              m.isDefault
                ? undefined
                : () => router.push(`/earnings/method-actions?id=${m.id}`)
            }
          />
        ))
      ) : (
        // Without a method there is nowhere for money to go, so this says so.
        <EmptyState
          icon="bank"
          title="No payout method"
          body="Add a bank account so your earnings have somewhere to land."
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

function MethodRow({ method, onPress }: { method: PayoutMethod; onPress?: () => void }) {
  const c = useColors();
  const isDefault = method.isDefault;

  const content = (
    <>
      <View
        style={[
          styles.tile,
          { backgroundColor: isDefault ? c.accentTint : c.surfaceSunken },
        ]}
      >
        <Icon name="bank" size={18} color={isDefault ? c.accent : c.textSecondary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.bank}>{method.bankName}</Text>
        <Text variant="badge" color="textSecondary" tabular style={styles.number}>
          {maskedNumber(method)}
        </Text>
      </View>
      {isDefault ? (
        <Badge label="Default" tone="accent" style={styles.defaultBadge} />
      ) : (
        <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
      )}
    </>
  );

  const skin = {
    borderWidth: isDefault ? 1.5 : 1,
    borderColor: isDefault ? c.accent : c.borderCard,
    backgroundColor: c.surface,
  };

  if (!onPress) {
    return <View style={[styles.row, skin]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${method.bankName} ending ${method.last4}. Options`}
      style={({ pressed }) => [styles.row, skin, { opacity: pressed ? 0.75 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -8 },
  title: { marginBottom: 2 },
  row: {
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  bank: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  number: { fontSize: 12, marginTop: 2 },
  defaultBadge: { paddingHorizontal: 9, paddingVertical: 4 },
  empty: { minHeight: 260 },
});
