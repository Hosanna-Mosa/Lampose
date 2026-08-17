import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Select, EmptyState } from '@/components/ui';
import { METHODS, defaultMethod, shortLabel } from '@/lib/payouts';
import { availablePoints, canWithdraw, withdraw, MIN_WITHDRAW_POINTS } from '@/lib/referrals';
import { formatINR } from '@/lib/format';
import { radius } from '@/constants/layout';
import { fonts, type } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Cash-out reuses the payout methods already set up for bookings — referral
 * money lands in the same bank account, not a second wallet nobody asked for.
 */
export default function WithdrawReferralsScreen() {
  const c = useColors();
  const router = useRouter();

  const available = availablePoints();
  const eligible = canWithdraw();
  const hasMethods = METHODS.length > 0;

  const [methodLabel, setMethodLabel] = useState<string | null>(() => {
    const d = defaultMethod();
    return d ? shortLabel(d) : null;
  });
  const [done, setDone] = useState(false);

  const methodOptions = METHODS.map(shortLabel);
  const selectedMethod = METHODS.find((m) => shortLabel(m) === methodLabel);

  const backRow = (
    <View style={styles.backRow}>
      <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
    </View>
  );

  // Guards a direct link — the real entry point already gates this behind
  // "unlocked," but nothing stops someone from navigating here by hand.
  if (!eligible) {
    return (
      <Screen scroll={false} padX={20} background="bg" stickyHeader={backRow}>
        <EmptyState
          icon="wallet"
          title="Not enough points yet"
          body={`You need at least ${MIN_WITHDRAW_POINTS} points to withdraw — you have ${available}.`}
        />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen scroll={false} padX={20} background="bg" stickyHeader={backRow}>
        <EmptyState
          icon="check-circle"
          title="Withdrawal started"
          body={`${formatINR(available)} is on its way to ${selectedMethod ? shortLabel(selectedMethod) : 'your account'}. Transfers usually settle within a few business days.`}
          actionLabel="Done"
          onAction={() => router.replace('/referrals')}
        />
      </Screen>
    );
  }

  const submit = () => {
    if (!selectedMethod) return;
    withdraw(selectedMethod.id);
    setDone(true);
  };

  return (
    <Screen
      padX={22}
      contentStyle={styles.fill}
      stickyHeader={
        <>
          {backRow}
          <Text variant="pageTitleSm" style={styles.title}>
            Withdraw
          </Text>
        </>
      }
      footer={
        <Button
          label={`Withdraw ${formatINR(available)}`}
          onPress={submit}
          disabled={!selectedMethod}
        />
      }
    >

      <View style={[styles.amountCard, { backgroundColor: c.successTint }]}>
        <Text variant="badge" style={{ color: c.successOnTint }}>
          Available to withdraw
        </Text>
        <Text tabular style={[styles.amount, { color: c.successInkDeep }]}>
          {formatINR(available)}
        </Text>
        <Text variant="caption" style={{ color: c.successInk }}>
          {available} points
        </Text>
      </View>

      {hasMethods ? (
        <View style={styles.field}>
          <Select
            label="Payout method"
            options={methodOptions}
            value={methodLabel}
            onChange={setMethodLabel}
            placeholder="Select a method"
          />
        </View>
      ) : (
        <View style={[styles.noMethod, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
          <Text variant="bodySm" color="textSecondary" style={styles.noMethodText}>
            No payout method saved yet — add one to withdraw.
          </Text>
          <Button
            label="Add payout method"
            variant="secondary"
            onPress={() => router.push('/earnings/add-method')}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 2 },
  title: { marginBottom: 18 },

  amountCard: { borderRadius: radius.card, padding: 18, gap: 4, marginBottom: 20, alignItems: 'center' },
  amount: { ...type.metric },

  field: { marginBottom: 16 },
  noMethod: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 12, alignItems: 'center' },
  noMethodText: { textAlign: 'center' },
});
