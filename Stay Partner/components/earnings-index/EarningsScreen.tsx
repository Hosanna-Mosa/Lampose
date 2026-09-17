import { useState } from 'react';
import { Box } from '@/components/common';
import { useRouter } from 'expo-router';
import { Screen, Text, TextButton, IconButton, Button, Badge, EmptyState } from '@/components/common';
import { useEarnings, usePayouts, useRequestPayout } from '@/services/hooks/useEarnings';
import { ApiError } from '@/services/api/client';
import { useAlert } from '@/components/common';
import { formatINR } from '@/lib/format';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { StatTile } from '@/components/earnings-index/molecules/StatTile/StatTile';
import { styles } from '@/components/earnings-index/styles';

type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

const STATUS_TONE: Record<PayoutStatus, 'warning' | 'accent' | 'success' | 'error'> = {
  pending: 'warning',
  processing: 'accent',
  completed: 'success',
  failed: 'error',
};

/* The same four words the payout badge and the admin console use. An owner
   comparing what they see with what support sees must not find two
   vocabularies for one row. */
const STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: 'Requested',
  processing: 'With the bank',
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
export function EarningsScreen() {
  const c = useColors();
  const router = useRouter();

  const {
    earnings, isLoading: loadingEarnings, isRefetching: refetchingEarnings, refetch: refetchEarnings,
  } = useEarnings();
  const {
    payouts, isLoading: loadingPayouts, isRefetching: refetchingPayouts, refetch: refetchPayouts,
  } = usePayouts();
  const { requestPayout, isRequesting, error } = useRequestPayout();

  const onRefresh = () => {
    refetchEarnings();
    refetchPayouts();
  };

  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const { confirm } = useAlert();

  const onRequest = async () => {
    setRequestMessage(null);
    try {
      const created = await requestPayout();
      setRequestMessage(
        `Requested ${formatINR(Number(created?.amount) || 0)}. It is now with Lampose to pay.`,
      );
    } catch (err) {
      /*
       * No bank account is not an error to read — it is a thing to do.
       *
       * The server refuses with `NO_PAYMENT_METHOD` because it cannot address
       * a transfer to nothing. Showing that sentence in red at the bottom of
       * the card leaves the owner to work out that there is a form on another
       * screen; this offers to take them there instead.
       */
      if (err instanceof ApiError && err.code === 'NO_PAYMENT_METHOD') {
        const go = await confirm({
          title: 'Where should we send it?',
          message: 'We need a bank account before we can pay you. It takes a minute.',
          confirmLabel: 'Add bank account',
          cancelLabel: 'Not now',
        });
        if (go) router.push('/earnings/add-method');
      }
      /* Anything else falls through to `error` below, which renders it. */
    }
  };

  const available = Number(earnings?.availableBalance) || 0;
  /* Hotel money a guest has already paid whose stay has not started. Visible
     but not requestable — see `payout.service.js#heldBalance`. */
  const held = Number(earnings?.heldBalance) || 0;
  const hasPending = Boolean(earnings?.pendingPayout);

  return (
    <Screen
      contentStyle={styles.stack}
      refreshing={refetchingEarnings || refetchingPayouts}
      onRefresh={onRefresh}
      stickyHeader={
        <Box style={styles.backRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </Box>
      }
    >
      <Box style={styles.head}>
        <Text variant="screenTitle">Earnings</Text>
        <TextButton label="Payout methods" onPress={() => router.push('/earnings/methods')} />
      </Box>

      <Box style={styles.statRow}>
        <StatTile label="Today" value={earnings?.todayEarnings ?? '₹0'} loading={loadingEarnings} />
        <StatTile label="This week" value={earnings?.weekEarnings ?? '₹0'} loading={loadingEarnings} />
      </Box>

      <Box style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        <Text variant="label" color="textSecondary">
          Available to request
        </Text>
        <Text style={[styles.amount, { color: c.textPrimary }]}>{formatINR(available)}</Text>
        <Text variant="caption" color="textTertiary" style={styles.hint}>
          From completed bookings and hotel stays whose guest has checked in.
        </Text>

        {/*
          Held money, stated rather than hidden.

          A hotel guest who paid last night is money in Lampose's account that
          the owner cannot have until the guest actually turns up — because
          until then it may have to be refunded. Not showing it makes a payment
          look lost; showing it without the reason makes us look like we are
          holding on to it. So it says both.
        */}
        {held > 0 ? (
          <Box style={[styles.heldRow, { borderColor: c.borderCard }]}>
            <Text variant="bodySm" color="textSecondary" style={styles.flex}>
              {formatINR(held)} held until your guests check in
            </Text>
          </Box>
        ) : null}

        {hasPending ? (
          <Box style={[styles.pendingRow, { backgroundColor: c.surfaceSunken }]}>
            <Badge label={STATUS_LABEL[(earnings?.pendingPayout?.status as PayoutStatus) ?? 'pending']} tone={STATUS_TONE[(earnings?.pendingPayout?.status as PayoutStatus) ?? 'pending']} />
            <Text variant="bodySm" color="textSecondary" style={styles.flex}>
              {formatINR(Number(earnings?.pendingPayout?.amount) || 0)} already requested
            </Text>
          </Box>
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
      </Box>

      <Text variant="h3" style={styles.historyTitle}>
        Payout history
      </Text>

      {loadingPayouts ? null : payouts.length > 0 ? (
        payouts.map((p: any) => (
          <Box key={p.id} style={[styles.payoutRow, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
            <Box style={styles.flex}>
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
              {/* The transfer's reference, once it has been made. Whoever
                  paid typed it in; it is what an owner quotes to their bank
                  when they ring to ask where the money went. */}
              {p.razorpayReferenceId ? (
                <Text variant="caption" color="textTertiary">
                  Ref {p.razorpayReferenceId}
                </Text>
              ) : null}
            </Box>
            <Badge
              label={STATUS_LABEL[(p.status as PayoutStatus) ?? 'pending']}
              tone={STATUS_TONE[(p.status as PayoutStatus) ?? 'pending']}
            />
          </Box>
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

