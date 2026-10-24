import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  Badge, Box, Button, DetailRow, EmptyState, ErrorState, IconButton, Screen, Skeleton, Tappable, Text,
  TextButton,
} from '@/components/common';
import {
  MODE_LABEL, ReminderButtons, STATUS_LABEL, STATUS_TONE, CHANNEL_LABEL,
  fullDayLabel, monthLabel, monthLine, ordinal, rentStyles as styles,
} from '@/components/rent-common';
import { formatINR } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { useResident } from '@/services/hooks/useRent';
import type { RentSource } from '@/services/api/rent.api';

const SOURCE_HINT: Record<RentSource, string> = {
  set: '',
  booking: 'Taken from the amount entered when they were added. Confirm it with “Edit rent”.',
  listing: 'Taken from your listed price for this room type. Confirm it with “Edit rent”.',
  none: 'No rent is known for this resident yet.',
};

/**
 * One resident's rent: the terms, every month with what was paid against it,
 * every payment with its receipt, and the two things an owner does here —
 * record money and send a reminder.
 */
export function ResidentRentScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { resident, isLoading, isError, error, isRefetching, refetch } = useResident(id);

  const header = (
    <Box style={styles.backRow}>
      <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
    </Box>
  );

  if (isLoading) {
    return (
      <Screen contentStyle={styles.stack} stickyHeader={header}>
        <Skeleton width="60%" height={26} radius={8} />
        <Skeleton width="100%" height={150} radius={16} />
        <Skeleton width="100%" height={220} radius={16} />
      </Screen>
    );
  }

  if (!resident) {
    return (
      <Screen contentStyle={styles.stack} stickyHeader={header}>
        <ErrorState
          title={isError ? 'We could not load this resident' : 'Resident not found'}
          body={error?.displayMessage}
          onRetry={refetch}
        />
      </Screen>
    );
  }

  const { rent, summary } = resident;
  const owing = resident.periods.filter((p) => p.status === 'overdue' || p.status === 'due');
  /* Oldest owing month first — that is the one a payment usually clears. */
  const oldestOwing = owing[owing.length - 1];
  const canRecord = rent.source !== 'none' && resident.periods.some((p) => p.status !== 'paid');
  const goPay = (period?: string) =>
    router.push({ pathname: '/rent/pay', params: { id: resident.id, ...(period ? { period } : {}) } } as never);

  return (
    <Screen
      contentStyle={styles.stack}
      refreshing={isRefetching}
      onRefresh={refetch}
      stickyHeader={header}
      footer={canRecord ? (
        <Button label="Record a payment" icon="rupee" onPress={() => goPay(oldestOwing?.period)} />
      ) : undefined}
    >
      <Box>
        <Text variant="screenTitle">{resident.guestName}</Text>
        <Text variant="caption" color="textTertiary">
          Room {resident.roomNumber || '—'} · {resident.shareType}
          {resident.propertyName ? ` · ${resident.propertyName}` : ''}
        </Text>
      </Box>

      {/* The rent card: terms, and where the figure came from. */}
      <Box style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        <Box style={styles.head}>
          <Text variant="label" color="textSecondary">Monthly rent</Text>
          {resident.monthlyStay ? (
            <TextButton
              label={rent.source === 'none' ? 'Set rent' : 'Edit rent'}
              onPress={() => router.push({ pathname: '/rent/terms', params: { id: resident.id } } as never)}
            />
          ) : null}
        </Box>
        <Text style={[styles.amount, { color: c.textPrimary }]}>
          {rent.monthly > 0 ? formatINR(rent.monthly) : '—'}
        </Text>
        {SOURCE_HINT[rent.source] ? (
          <Text variant="caption" color={rent.source === 'none' ? 'warningInk' : 'textTertiary'}>
            {resident.monthlyStay ? SOURCE_HINT[rent.source] : 'Hotel stays are paid by the night and have no monthly rent.'}
          </Text>
        ) : null}
        <Box style={[styles.divider, { backgroundColor: c.borderSubtle }]} />
        <DetailRow
          label="Due every month on"
          value={rent.dueDay ? `the ${ordinal(rent.dueDay)}` : `the ${ordinal(rent.effectiveDueDay)} (check-in day)`}
        />
        <DetailRow label="Checked in" value={fullDayLabel(resident.checkInDate)} />
        {resident.checkOutDate ? <DetailRow label="Checking out" value={fullDayLabel(resident.checkOutDate)} /> : null}
        <DetailRow label="Phone" value={resident.guestPhone || '—'} last />
      </Box>

      {/* What they owe now, and the reminder for it. */}
      {owing.length ? (
        <Box style={[styles.card, { borderColor: c.error, backgroundColor: c.errorTint }]}>
          <Text variant="label" color="errorInk">To collect</Text>
          <Text style={[styles.amount, { color: c.errorInk }]}>{formatINR(summary.outstanding)}</Text>
          <Text variant="caption" color="errorInk">
            {owing.length} month{owing.length === 1 ? '' : 's'}
            {summary.maxDaysLate ? ` · oldest ${summary.maxDaysLate} day${summary.maxDaysLate === 1 ? '' : 's'} late` : ' · due today'}
          </Text>
          <Box style={styles.actions}>
            <ReminderButtons
              residentId={resident.id}
              guestName={resident.guestName}
              guestPhone={resident.guestPhone}
              propertyName={resident.propertyName}
              amount={summary.outstanding}
              status={oldestOwing.status}
              period={oldestOwing.period}
              dueDate={oldestOwing.dueDate}
            />
          </Box>
          {resident.lastReminder ? (
            <Text variant="caption" color="errorInk" style={styles.message}>
              Last reminded by {CHANNEL_LABEL[resident.lastReminder.channel]} on{' '}
              {new Date(resident.lastReminder.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </Text>
          ) : null}
        </Box>
      ) : null}

      <Text variant="h3" style={styles.sectionTitle}>Months</Text>
      {resident.periods.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No rent months yet"
          body={rent.source === 'none' ? 'Set the monthly rent to see what is due.' : 'Months appear from the check-in date.'}
          style={styles.empty}
        />
      ) : (
        <Box style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface, paddingVertical: 6 }]}>
          {resident.periods.map((month, i) => (
            <Tappable
              key={month.period}
              disabled={month.status === 'paid'}
              onPress={() => goPay(month.period)}
              accessibilityRole="button"
              style={[
                styles.monthRow,
                i < resident.periods.length - 1
                  ? { borderBottomWidth: 1, borderBottomColor: c.borderSubtle }
                  : null,
              ]}
            >
              <Box style={styles.flex}>
                <Text variant="cardTitle">{monthLabel(month.period)}</Text>
                <Text variant="caption" color="textTertiary">{monthLine(month)}</Text>
              </Box>
              <Badge
                label={month.isPartial && month.status !== 'paid' ? `Partial · ${STATUS_LABEL[month.status]}` : STATUS_LABEL[month.status]}
                tone={STATUS_TONE[month.status]}
              />
            </Tappable>
          ))}
        </Box>
      )}

      <Text variant="h3" style={styles.sectionTitle}>Payments</Text>
      {resident.payments.length === 0 ? (
        <Text variant="caption" color="textTertiary">No payments recorded yet.</Text>
      ) : (
        resident.payments.map((p) => (
          <Tappable
            key={p.id}
            onPress={() => router.push({ pathname: '/rent/receipt/[id]', params: { id: p.id } } as never)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.row,
              { borderColor: c.borderCard, backgroundColor: c.surface, opacity: pressed ? 0.85 : p.voidedAt ? 0.6 : 1 },
            ]}
          >
            <Box style={styles.flex}>
              <Text variant="cardTitle">{formatINR(p.amount)} · {monthLabel(p.period)}</Text>
              <Text variant="caption" color="textTertiary">
                {fullDayLabel(p.paidOn)} · {MODE_LABEL[p.mode]} · {p.receiptNo}
              </Text>
            </Box>
            {p.voidedAt ? <Badge label="Void" tone="neutral" /> : <Badge label="Receipt" tone="success" />}
          </Tappable>
        ))
      )}

      <TextButton
        label="Open booking"
        onPress={() => router.push({ pathname: '/booking/[id]', params: { id: resident.id } } as never)}
      />
    </Screen>
  );
}
