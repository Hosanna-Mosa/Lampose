import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, TextButton, IconButton, Button, Badge, EmptyState } from '@/components/ui';
import { useEarnings, usePayouts, useRequestPayout } from '@/services/hooks/useEarnings';
import { ApiError } from '@/services/api/client';
import { formatINR } from '@/lib/format';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

const STATUS_TONE: Record<PayoutStatus, 'warning' | 'accent' | 'success' | 'error'> = {
  pending: 'warning',
  processing: 'accent',
  completed: 'success',
  failed: 'error',
};

const STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: 'Requested',
  processing: 'Processing',
  completed: 'Paid',
  failed: 'Failed',
};

/**
 * Earnings and payouts, for real.
 *
 * The dashboard's Earnings tile has been a dead end since the screen it used
 * to open was removed — see the comment still sitting next to it in
 * `app/(tabs)/index.tsx`. This is that screen, rebuilt against
 * `payout.service.js`: what a `completed` booking has actually earned, what
 * is already reserved into a payout, and the button that reserves the rest.
 *
 * Dispatching a requested payout over RazorpayX is an administrator's own
 * action (`payout.service.js`'s `processPayout`) — this screen only ever
 * creates the `pending` row. A payout sitting `pending` for a while is
 * expected, not stuck.
 */
export default function EarningsScreen() {
  const c = useColors();
  const router = useRouter();

  const { earnings, isLoading: loadingEarnings } = useEarnings();
  const { payouts, isLoading: loadingPayouts } = usePayouts();
  const { requestPayout, isRequesting, error } = useRequestPayout();

  const [requestMessage, setRequestMessage] = useState<string | null>(null);

  const onRequest = async () => {
    setRequestMessage(null);
    try {
      const created = await requestPayout();
      setRequestMessage(`Requested ${formatINR(Number(created?.amount) || 0)}. It is now with Lampose to process.`);
    } catch {
      /* `error` below renders the reason. */
    }
  };

  const available = Number(earnings?.availableBalance) || 0;
  const hasPending = Boolean(earnings?.pendingPayout);

  return (
    <Screen
      contentStyle={styles.stack}
      stickyHeader={
        <View style={styles.backRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </View>
      }
    >
      <View style={styles.head}>
        <Text variant="screenTitle">Earnings</Text>
        <TextButton label="Payout methods" onPress={() => router.push('/earnings/methods')} />
      </View>

      <View style={styles.statRow}>
        <StatTile label="Today" value={earnings?.todayEarnings ?? '₹0'} loading={loadingEarnings} />
        <StatTile label="This week" value={earnings?.weekEarnings ?? '₹0'} loading={loadingEarnings} />
      </View>

      <View style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        <Text variant="label" color="textSecondary">
          Available to request
        </Text>
        <Text style={[styles.amount, { color: c.textPrimary }]}>{formatINR(available)}</Text>
        <Text variant="caption" color="textTertiary" style={styles.hint}>
          From bookings marked complete that have not already been requested.
        </Text>

        {hasPending ? (
          <View style={[styles.pendingRow, { backgroundColor: c.surfaceSunken }]}>
            <Badge label={STATUS_LABEL[(earnings?.pendingPayout?.status as PayoutStatus) ?? 'pending']} tone={STATUS_TONE[(earnings?.pendingPayout?.status as PayoutStatus) ?? 'pending']} />
            <Text variant="bodySm" color="textSecondary" style={styles.flex}>
              {formatINR(Number(earnings?.pendingPayout?.amount) || 0)} already requested
            </Text>
          </View>
        ) : (
          <Button
            label="Request payout"
            onPress={onRequest}
            disabled={available <= 0 || isRequesting}
            loading={isRequesting}
            style={styles.requestButton}
          />
        )}

        {requestMessage ? (
          <Text variant="caption" color="success" style={styles.message}>
            {requestMessage}
          </Text>
        ) : null}
        {error ? (
          <Text variant="caption" color="error" style={styles.message}>
            {error instanceof ApiError ? error.displayMessage : 'Could not request a payout. Try again.'}
          </Text>
        ) : null}
      </View>

      <Text variant="h3" style={styles.historyTitle}>
        Payout history
      </Text>

      {loadingPayouts ? null : payouts.length > 0 ? (
        payouts.map((p: any) => (
          <View key={p.id} style={[styles.payoutRow, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
            <View style={styles.flex}>
              <Text variant="cardTitle">{formatINR(Number(p.amount) || 0)}</Text>
              <Text variant="caption" color="textTertiary">
                {p.bankAccount || 'Payout method on file'}
                {p.payoutDate ? ` · ${p.payoutDate}` : ''}
              </Text>
              {p.status === 'failed' && p.failureReason ? (
                <Text variant="caption" color="error" style={styles.failureReason}>
                  {p.failureReason}
                </Text>
              ) : null}
            </View>
            <Badge
              label={STATUS_LABEL[(p.status as PayoutStatus) ?? 'pending']}
              tone={STATUS_TONE[(p.status as PayoutStatus) ?? 'pending']}
            />
          </View>
        ))
      ) : (
        <EmptyState
          icon="rupee"
          title="No payouts yet"
          body="Requested payouts show up here once you have earnings to move."
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

function StatTile({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.statTile, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
      <Text style={[styles.statValue, { color: c.textPrimary }]}>{loading ? '…' : value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -8 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  statRow: { flexDirection: 'row', gap: 10 },
  statTile: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 20 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 4 },
  amount: { fontFamily: fonts.extrabold, fontSize: 30, marginTop: 2 },
  hint: { marginBottom: 6 },
  requestButton: { marginTop: 8 },
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginTop: 8,
  },
  flex: { flex: 1 },
  message: { marginTop: 6 },
  historyTitle: { marginTop: 6 },
  payoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14,
  },
  failureReason: { marginTop: 2 },
  empty: { minHeight: 180, borderRadius: radius.card },
});
