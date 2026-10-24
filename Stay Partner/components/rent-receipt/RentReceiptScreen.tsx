import { Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  Badge, Box, Button, DetailRow, ErrorState, IconButton, Screen, Skeleton, Text, useAlert,
} from '@/components/common';
import {
  MODE_LABEL, fullDayLabel, rentStyles as styles,
} from '@/components/rent-common';
import { formatINR } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { useReceipt, useVoidPayment } from '@/services/hooks/useRent';
import type { Receipt } from '@/services/api/rent.api';

/** The receipt as text, for WhatsApp or any app the owner shares it to. */
function receiptText(r: Receipt): string {
  const from = r.receivedBy.businessName || r.propertyName || r.receivedBy.name;
  return [
    `RENT RECEIPT · ${r.receiptNo}`,
    from ? `${from}` : '',
    '',
    `Received from: ${r.guestName}${r.roomNumber ? ` (Room ${r.roomNumber})` : ''}`,
    `Amount: ${formatINR(r.amount)}`,
    `For: ${r.periodLabel} rent`,
    `Paid on: ${fullDayLabel(r.paidOn)} by ${MODE_LABEL[r.mode]}`,
    r.note ? `Note: ${r.note}` : '',
    '',
    `Received by ${r.receivedBy.name || from}${r.receivedBy.phone ? ` · ${r.receivedBy.phone}` : ''}`,
  ].filter((line, i, all) => line !== '' || (all[i - 1] ?? '') !== '').join('\n');
}

/**
 * One payment's receipt. Shared as text, because that is what lands cleanly
 * in a resident's WhatsApp. A payment recorded by mistake is voided here —
 * kept and marked, never deleted, so a receipt already sent still has an
 * explanation behind it.
 */
export function RentReceiptScreen() {
  const c = useColors();
  const router = useRouter();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { receipt, isLoading, error, refetch } = useReceipt(id);
  const { run: voidPayment, isPending: voiding } = useVoidPayment();
  const { confirm, alert } = useAlert();

  const header = (
    <Box style={styles.backRow}>
      <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
    </Box>
  );

  if (isLoading) {
    return (
      <Screen contentStyle={styles.stack} stickyHeader={header}>
        <Skeleton width="100%" height={320} radius={16} />
      </Screen>
    );
  }
  if (!receipt) {
    return (
      <Screen contentStyle={styles.stack} stickyHeader={header}>
        <ErrorState title="We could not load this receipt" body={error?.displayMessage} onRetry={refetch} />
      </Screen>
    );
  }

  const share = () => {
    Share.share({ message: receiptText(receipt) }).catch(() => {});
  };

  const onVoid = async () => {
    const yes = await confirm({
      title: 'Void this payment?',
      message: `${formatINR(receipt.amount)} from ${receipt.guestName} will no longer count. The receipt is kept, marked void.`,
      confirmLabel: 'Void payment',
      cancelLabel: 'Keep it',
      destructive: true,
    });
    if (!yes) return;
    try {
      await voidPayment({ id: receipt.id, reason: 'Recorded by mistake' });
      await refetch();
    } catch (err: any) {
      await alert({ title: 'Could not void it', message: err?.displayMessage ?? 'Try again.' });
    }
  };

  const voided = Boolean(receipt.voidedAt);

  return (
    <Screen
      contentStyle={styles.stack}
      stickyHeader={header}
      footer={voided ? undefined : <Button label="Share receipt" icon="send" onPress={share} />}
    >
      {fresh === '1' && !voided ? (
        <Box style={[styles.card, { borderColor: c.success, backgroundColor: c.successTint }]}>
          <Text variant="cardTitle" color="successInk">Payment recorded</Text>
          <Text variant="caption" color="successInk">Share the receipt with {receipt.guestName} below.</Text>
        </Box>
      ) : null}

      <Box style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        <Box style={styles.head}>
          <Text variant="label" color="textSecondary">Rent receipt</Text>
          {voided ? <Badge label="Void" tone="error" /> : <Badge label="Paid" tone="success" />}
        </Box>
        <Text style={[styles.amount, { color: voided ? c.textTertiary : c.textPrimary }]}>
          {formatINR(receipt.amount)}
        </Text>
        <Text variant="caption" color="textTertiary">{receipt.receiptNo}</Text>
        <Box style={[styles.divider, { backgroundColor: c.borderSubtle }]} />
        <DetailRow label="Received from" value={receipt.guestName} />
        {receipt.roomNumber ? <DetailRow label="Room" value={receipt.roomNumber} /> : null}
        {receipt.propertyName ? <DetailRow label="Property" value={receipt.propertyName} /> : null}
        <DetailRow label="For" value={`${receipt.periodLabel} rent`} />
        <DetailRow label="Paid on" value={fullDayLabel(receipt.paidOn)} />
        <DetailRow label="Paid by" value={MODE_LABEL[receipt.mode]} />
        {receipt.note ? <DetailRow label="Note" value={receipt.note} /> : null}
        <DetailRow label="Received by" value={receipt.receivedBy.name || receipt.receivedBy.businessName || '—'} last />
      </Box>

      {voided ? (
        <Text variant="caption" color="textTertiary">
          Voided{receipt.voidReason ? ` — ${receipt.voidReason}` : ''}. It no longer counts towards what was paid.
        </Text>
      ) : (
        <Button label="Void this payment" variant="dangerOutline" size="sm" onPress={onVoid} loading={voiding} />
      )}
    </Screen>
  );
}
