import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Input } from '@/components/ui';
import { bankNameForIFSC, isValidIFSC } from '@/lib/payouts';
import { addPaymentMethodApi } from '@/services/api/domain.api';
import { ApiError } from '@/services/api/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Where an owner's money goes.
 *
 * ## Three things this screen used to get wrong
 *
 * The holder name was pre-filled with a fictional person, so an owner who did
 * not overwrite it registered an account in somebody else's name — which is
 * exactly what a bank bounces a transfer on.
 *
 * The Save button was gated on recognising the IFSC's bank, from a list of
 * eight. Every other bank in India was refused by the app while the server
 * would have taken it. Validity is a question about the CODE'S SHAPE, and
 * that is all that is asked now; the bank's name is shown when we happen to
 * know it and left blank when we do not.
 *
 * And a failed save navigated away exactly like a successful one, because the
 * error was swallowed and the redirect sat in a `finally`. An owner walked
 * away believing their account was on file and found out when a payout had
 * nowhere to land. A failure now stays on the screen and says why.
 *
 * ## Nothing is kept locally
 *
 * The account goes to `PartnerPaymentMethod` and the list is re-read from
 * there. The app holds no copy — it never sees the full number again after
 * this screen: the server keeps the number but never sends it back, so every
 * other screen can only show the last four digits.
 */
export default function AddMethodScreen() {
  const router = useRouter();
  const { partner } = useAuth();

  /* Seeded from the OWNER'S OWN profile name — a sensible starting point that
     is at least about them — and freely editable, because the bank's spelling
     is what matters and it is often not the one we hold. */
  const [holderName, setHolderName] = useState(partner?.name ?? '');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [ifscTouched, setIfscTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const cleanAccount = accountNumber.replace(/\D/g, '');
  const cleanIfsc = ifsc.trim().toUpperCase();
  const bankName = bankNameForIFSC(cleanIfsc);
  const ifscValid = isValidIFSC(cleanIfsc);
  const ifscInvalid = ifscTouched && cleanIfsc.length > 0 && !ifscValid;

  /* The same three rules the server applies. A form is never the last word on
     what reaches a payment rail, but it should not disagree with it either. */
  const canSave =
    holderName.trim().length > 0 &&
    cleanAccount.length >= 6 &&
    ifscValid &&
    !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      await addPaymentMethodApi({
        type: 'bank_account',
        accountName: holderName.trim(),
        accountNumber: cleanAccount,
        ifsc: cleanIfsc,
      });
      /* Only on success. */
      router.replace('/earnings/methods');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.displayMessage
          : 'We could not save that account. Check your connection and try again.',
      );
      setSaving(false);
    }
  };

  return (
    <Screen
      padX={22}
      contentStyle={styles.fill}
      footer={(
        <Button
          label={saving ? 'Saving…' : 'Save payout method'}
          onPress={() => { void save(); }}
          loading={saving}
          disabled={!canSave}
        />
      )}
      stickyHeader={(
        <View style={styles.backRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </View>
      )}
    >

      <Text variant="pageTitleSm" style={styles.title}>
        Add bank account
      </Text>

      <Input
        label="Account holder name"
        value={holderName}
        onChangeText={setHolderName}
        placeholder="Exactly as your bank has it"
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
        placeholder="HDFC0001234"
        autoCapitalize="characters"
        error={ifscInvalid ? 'An IFSC looks like HDFC0001234 — four letters, a zero, then six more.' : undefined}
        containerStyle={styles.field}
      />

      {/* Shown when we recognise the bank, absent when we do not. It is a
          courtesy, never a condition of saving — see `bankNameForIFSC`. */}
      {bankName ? (
        <Text variant="caption" color="textTertiary" style={styles.bank}>
          {bankName}
        </Text>
      ) : null}

      {error ? (
        <Text variant="caption" color="errorInk" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View style={styles.spacer} />

      <Text variant="caption" color="textTertiary" style={styles.privacy}>
        Your account details are stored securely and used only to pay you. This screen is the
        last place the full number is shown.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 4 },
  title: { marginBottom: 20 },
  field: { marginBottom: 16 },
  bank: { marginTop: -8, marginBottom: 8 },
  error: { marginTop: 4 },
  spacer: { flex: 1, minHeight: 6 },
  privacy: { marginBottom: 8 },
});
