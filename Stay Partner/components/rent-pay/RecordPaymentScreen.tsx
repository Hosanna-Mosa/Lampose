import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  Box, Button, Chip, ErrorState, IconButton, Input, Screen, Skeleton, Text,
} from '@/components/common';
import {
  MODE_LABEL, monthLabel, monthLine, rentStyles as styles, todayYmd,
} from '@/components/rent-common';
import { formatDateInput, formatINR, parseDateInput } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { useRecordPayment, useResident } from '@/services/hooks/useRent';
import type { PaymentMode } from '@/services/api/rent.api';

const MODES: PaymentMode[] = ['cash', 'upi', 'bank', 'other'];

const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Record rent a resident handed over.
 *
 * Partial payments are the ordinary case in a PG — half now, half on payday —
 * so the amount starts at what is left for the month and can be lowered. The
 * server refuses more than is left for a month; the rest goes on the next.
 */
export function RecordPaymentScreen() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; period?: string }>();
  const { resident, isLoading, error } = useResident(params.id);
  const { run, isPending, error: saveError } = useRecordPayment();

  /* Months that can take money, oldest first. */
  const payable = useMemo(
    () => (resident?.periods ?? []).filter((p) => p.status !== 'paid').slice().reverse(),
    [resident],
  );

  const [period, setPeriod] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [when, setWhen] = useState<'today' | 'yesterday' | 'other'>('today');
  const [dateDigits, setDateDigits] = useState('');
  const [note, setNote] = useState('');

  const month = payable.find((p) => p.period === period) ?? null;

  /* Start on the month asked for, else the oldest one owing, with its balance. */
  useEffect(() => {
    if (period || !payable.length) return;
    const start = payable.find((p) => p.period === params.period) ?? payable[0];
    setPeriod(start.period);
    setAmount(String(start.balance));
  }, [payable, params.period, period]);

  const pickMonth = (next: string) => {
    setPeriod(next);
    const m = payable.find((p) => p.period === next);
    if (m) setAmount(String(m.balance));
  };

  const today = todayYmd();
  const paidOn = when === 'today'
    ? today
    : when === 'yesterday'
      ? toYmd(new Date(new Date(`${today}T12:00:00`).getTime() - 86_400_000))
      : (() => {
        const d = parseDateInput(dateDigits);
        return d ? toYmd(d) : null;
      })();

  const value = Number(amount);
  const amountError = !amount
    ? undefined
    : !Number.isInteger(value) || value < 1
      ? 'Enter whole rupees.'
      : month && value > month.balance
        ? `Only ${formatINR(month.balance)} is left for ${monthLabel(month.period)}.`
        : undefined;
  const dateError = when === 'other' && dateDigits.length === 8 && (!paidOn || paidOn > today)
    ? 'Pick a real date, not in the future.'
    : undefined;

  const canSave = Boolean(month && paidOn && paidOn <= today && amount && !amountError && !isPending);

  const save = async () => {
    if (!canSave || !month || !paidOn || !resident) return;
    try {
      const payment = await run({
        id: resident.id,
        input: { period: month.period, amount: value, paidOn, mode, note: note.trim() || undefined },
      });
      router.replace({ pathname: '/rent/receipt/[id]', params: { id: payment.id, fresh: '1' } } as never);
    } catch {
      /* `saveError` renders the server's sentence. */
    }
  };

  const header = (
    <>
      <Box style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </Box>
      <Text variant="screenTitle">Record a payment</Text>
    </>
  );

  if (isLoading) {
    return (
      <Screen contentStyle={styles.stack} stickyHeader={header}>
        <Skeleton width="100%" height={60} radius={14} />
        <Skeleton width="100%" height={200} radius={16} />
      </Screen>
    );
  }

  if (!resident) {
    return (
      <Screen contentStyle={styles.stack} stickyHeader={header}>
        <ErrorState title="We could not load this resident" body={error?.displayMessage} />
      </Screen>
    );
  }

  if (!payable.length) {
    return (
      <Screen contentStyle={styles.stack} stickyHeader={header}>
        <ErrorState
          title={resident.rent.source === 'none' ? 'Set the rent first' : 'Nothing left to pay'}
          body={resident.rent.source === 'none'
            ? 'This resident has no monthly rent yet.'
            : 'Every month on record is paid in full.'}
        />
      </Screen>
    );
  }

  return (
    <Screen
      contentStyle={styles.stack}
      stickyHeader={header}
      footer={
        <Box style={styles.footer}>
          {saveError ? (
            <Text variant="caption" color="error">{saveError.displayMessage}</Text>
          ) : null}
          <Button
            label={value > 0 ? `Save ${formatINR(value)}` : 'Save payment'}
            onPress={save}
            disabled={!canSave}
            loading={isPending}
          />
        </Box>
      }
    >
      <Text variant="bodySm" color="textSecondary">
        From {resident.guestName} · Room {resident.roomNumber || '—'}
      </Text>

      <Text variant="label" color="textSecondary">For the month of</Text>
      <Box style={styles.chips}>
        {payable.map((p) => (
          <Chip
            key={p.period}
            size="sm"
            label={monthLabel(p.period)}
            selected={period === p.period}
            tone={p.status === 'overdue' ? 'danger' : 'accent'}
            onPress={() => pickMonth(p.period)}
          />
        ))}
      </Box>
      {month ? (
        <Text variant="caption" color={month.status === 'overdue' ? 'error' : 'textTertiary'}>
          {monthLine(month)} · {formatINR(month.balance)} left
        </Text>
      ) : null}

      <Input
        label="Amount received (₹)"
        prefix="₹"
        keyboardType="number-pad"
        value={amount}
        onChangeText={(t) => setAmount(t.replace(/\D/g, '').slice(0, 7))}
        error={amountError}
      />
      {month && value > 0 && value < month.balance ? (
        <Text variant="caption" color="warningInk">
          Partial payment — {formatINR(month.balance - value)} will still be owed for {monthLabel(month.period)}.
        </Text>
      ) : null}

      <Text variant="label" color="textSecondary">Paid by</Text>
      <Box style={styles.chips}>
        {MODES.map((m) => (
          <Chip key={m} size="sm" label={MODE_LABEL[m]} selected={mode === m} onPress={() => setMode(m)} />
        ))}
      </Box>

      <Text variant="label" color="textSecondary">Paid on</Text>
      <Box style={styles.chips}>
        <Chip size="sm" label="Today" selected={when === 'today'} onPress={() => setWhen('today')} />
        <Chip size="sm" label="Yesterday" selected={when === 'yesterday'} onPress={() => setWhen('yesterday')} />
        <Chip size="sm" label="Another day" selected={when === 'other'} onPress={() => setWhen('other')} />
      </Box>
      {when === 'other' ? (
        <Input
          placeholder="DD/MM/YYYY"
          keyboardType="number-pad"
          value={formatDateInput(dateDigits)}
          onChangeText={(t) => setDateDigits(t.replace(/\D/g, '').slice(0, 8))}
          error={dateError}
        />
      ) : null}

      <Input
        label="Note"
        optional
        placeholder="UPI reference, who collected it…"
        value={note}
        onChangeText={(t) => setNote(t.slice(0, 300))}
      />

      <Box style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surfaceSunken }]}>
        <Text variant="caption" color="textSecondary">
          Recording rent does not move money through Lampose. It keeps your own record and makes a
          receipt you can share with the resident.
        </Text>
      </Box>
    </Screen>
  );
}
