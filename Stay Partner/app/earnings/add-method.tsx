import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Input } from '@/components/ui';
import { addMethod, bankNameForIFSC } from '@/lib/payouts';

/**
 * The design shows "Bank name" already filled and greyed — derived, then
 * locked. It's wired to a real (if small) IFSC lookup here, so typing a
 * different code actually changes what's shown rather than the field being a
 * static prop dressed up as a derivation.
 */
import { addPaymentMethodApi } from '@/services/api/domain.api';

export default function AddMethodScreen() {
  const router = useRouter();

  const [holderName, setHolderName] = useState('Anjali Rao');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [ifscTouched, setIfscTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const bankName = bankNameForIFSC(ifsc);
  const ifscLooksComplete = ifsc.trim().length >= 11;
  const ifscInvalid = ifscTouched && ifscLooksComplete && !bankName;

  const canSave =
    holderName.trim().length > 0 &&
    accountNumber.replace(/\D/g, '').length >= 9 &&
    Boolean(bankName) &&
    !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await addPaymentMethodApi({
        type: 'bank_account',
        accountName: holderName.trim(),
        accountNumber,
        ifsc,
        isPrimary: true,
      });
      addMethod({ holderName: holderName.trim(), accountNumber, ifsc });
    } catch (err) {
      console.warn('Failed to save payment method:', err);
    } finally {
      setSaving(false);
      router.replace('/earnings/methods');
    }
  };

  return (
    <Screen
      padX={22}
            contentStyle={styles.fill}
            footer={<Button label="Save payout method" onPress={save} disabled={!canSave} />}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>
        </>
      }
    >

      <Text variant="pageTitleSm" style={styles.title}>
        Add bank account
      </Text>

      <Input
        label="Account holder name"
        value={holderName}
        onChangeText={setHolderName}
        autoCapitalize="words"
        textContentType="name"
        containerStyle={styles.field}
      />

      <Input
        label="Account number"
        value={accountNumber}
        onChangeText={(v) => setAccountNumber(v.replace(/[^\d\s]/g, ''))}
        keyboardType="number-pad"
        containerStyle={styles.field}
      />

      <Input
        label="IFSC code"
        value={ifsc}
        onChangeText={(v) => setIfsc(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        onBlur={() => setIfscTouched(true)}
        autoCapitalize="characters"
        error={ifscInvalid ? "That IFSC code isn't recognised." : undefined}
        containerStyle={styles.field}
      />

      <Input
        label="Bank name"
        value={bankName ?? ''}
        placeholder="Derived from the IFSC code"
        disabled
        containerStyle={styles.field}
      />

      <View style={styles.spacer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 4 },
  title: { marginBottom: 20 },
  field: { marginBottom: 16 },
  spacer: { flex: 1, minHeight: 6 },
});
