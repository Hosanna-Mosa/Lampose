import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Select, EmptyState } from '@/components/ui';
import { METHODS, defaultMethod, shortLabel } from '@/lib/payouts';
import { MIN_WITHDRAW_POINTS } from '@/lib/referrals';
import { formatINR } from '@/lib/format';
import { ApiError } from '@/services/api/client';
import { fetchReferralsApi, withdrawReferralApi } from '@/services/api/domain.api';
import { radius } from '@/constants/layout';
import { fonts, type } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Cash-out.
 *
 * The balance and the withdraw action both used to run on `lib/referrals.ts`'s
 * in-memory fixture — a completely separate number from the real one
 * `PartnerReferral.points` holds and the main Refer & Earn screen actually
 * displays. Pressing Withdraw here changed a mock array; it never reached
 * the backend, so the real balance was never zeroed and a second visit could
 * "withdraw" the same points again. Both now read and write the real
 * `/partners/referrals` endpoints.
 *
 * The payout METHOD picker below is still the fixture (`lib/payouts.ts`) —
 * the backend has real payment-method endpoints
 * (`partnerDomains.controller.js#getPaymentMethods`/`addPaymentMethod`) but
 * nothing in this app calls them yet. That is a separate, pre-existing gap;
 * fixing it is not what made this screen's numbers wrong.
 */
export default function WithdrawReferralsScreen() {
  const c = useColors();
  const router = useRouter();

  const [available, setAvailable] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasMethods = METHODS.length > 0;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchReferralsApi();
        if (active) setAvailable(typeof data?.points === 'number' ? data.points : 0);
      } catch (err) {
        if (active) setLoadError(err instanceof ApiError ? err.displayMessage : 'We could not load your balance.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const eligible = typeof available === 'number' && available >= MIN_WITHDRAW_POINTS;

  const [methodLabel, setMethodLabel] = useState<string | null>(() => {
    const d = defaultMethod();
    return d ? shortLabel(d) : null;
  });
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const methodOptions = METHODS.map(shortLabel);
  const selectedMethod = METHODS.find((m) => shortLabel(m) === methodLabel);

  const backRow = (
    <View style={styles.backRow}>
      <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
    </View>
  );

  if (loadError) {
    return (
      <Screen scroll={false} padX={20} background="bg" stickyHeader={backRow}>
        <EmptyState icon="alert-circle" title="We could not load this" body={loadError} />
      </Screen>
    );
  }

  // Still fetching the real balance — nothing to gate on yet.
  if (available === null) {
    return (
      <Screen scroll={false} padX={20} background="bg" stickyHeader={backRow}>
        <View />
      </Screen>
    );
  }

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

  const submit = async () => {
    if (!selectedMethod || withdrawing) return;
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      await withdrawReferralApi();
      setDone(true);
    } catch (err) {
      setWithdrawError(err instanceof ApiError ? err.displayMessage : 'We could not start that withdrawal.');
    } finally {
      setWithdrawing(false);
    }
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
          label={withdrawing ? 'Withdrawing…' : `Withdraw ${formatINR(available)}`}
          onPress={submit}
          loading={withdrawing}
          disabled={!selectedMethod || withdrawing}
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

      {withdrawError ? (
        <Text variant="badge" color="error" style={styles.withdrawError}>
          {withdrawError}
        </Text>
      ) : null}

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
  withdrawError: { marginBottom: 16 },

  field: { marginBottom: 16 },
  noMethod: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 12, alignItems: 'center' },
  noMethodText: { textAlign: 'center' },
});
