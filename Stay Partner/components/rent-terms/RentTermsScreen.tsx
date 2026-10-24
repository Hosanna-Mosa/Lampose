import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  Box, Button, Chip, ErrorState, IconButton, Input, Screen, Skeleton, Text,
} from '@/components/common';
import { ordinal, rentStyles as styles } from '@/components/rent-common';
import { formatINR } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { useResident, useUpdateRentTerms } from '@/services/hooks/useRent';

const QUICK_DAYS = [1, 5, 10];

/**
 * A resident's monthly rent and due day.
 *
 * A changed amount applies from this month on — months already behind them
 * keep the rent they fell due at, so a raise never reopens a settled month.
 * Due days stop at the 28th so the date exists in every month.
 */
export function RentTermsScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { resident, isLoading, error } = useResident(id);
  const { run, isPending, error: saveError } = useUpdateRentTerms();

  const [monthly, setMonthly] = useState('');
  /* null = the check-in day. */
  const [dueDay, setDueDay] = useState<number | null>(null);
  const [customDay, setCustomDay] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!resident || ready) return;
    setMonthly(resident.rent.monthly > 0 ? String(resident.rent.monthly) : '');
    setDueDay(resident.rent.dueDay);
    if (resident.rent.dueDay && !QUICK_DAYS.includes(resident.rent.dueDay)) setCustomDay(String(resident.rent.dueDay));
    setReady(true);
  }, [resident, ready]);

  const header = (
    <>
      <Box style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </Box>
      <Text variant="screenTitle">Monthly rent</Text>
    </>
  );

  if (isLoading) {
    return (
      <Screen contentStyle={styles.stack} stickyHeader={header}>
        <Skeleton width="100%" height={180} radius={16} />
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

  const amount = Number(monthly);
  const amountError = monthly && (!Number.isInteger(amount) || amount < 1) ? 'Enter whole rupees.' : undefined;
  const custom = Number(customDay);
  const customError = customDay && (!Number.isInteger(custom) || custom < 1 || custom > 28)
    ? 'Pick a day from 1 to 28.'
    : undefined;
  const checkInDay = Number(resident.checkInDate.slice(8, 10)) || 1;
  const canSave = Boolean(monthly && !amountError && !customError && !isPending);

  const save = async () => {
    if (!canSave) return;
    try {
      const changedAmount = amount !== resident.rent.monthly || resident.rent.source !== 'set';
      await run({
        id: resident.id,
        ...(changedAmount ? { monthly: amount } : {}),
        dueDay,
      });
      router.back();
    } catch {
      /* `saveError` renders it. */
    }
  };

  return (
    <Screen
      contentStyle={styles.stack}
      stickyHeader={header}
      footer={
        <Box style={styles.footer}>
          {saveError ? <Text variant="caption" color="error">{saveError.displayMessage}</Text> : null}
          <Button label="Save" onPress={save} disabled={!canSave} loading={isPending} />
        </Box>
      }
    >
      <Text variant="bodySm" color="textSecondary">
        {resident.guestName} · Room {resident.roomNumber || '—'}
      </Text>

      <Input
        label="Rent per month (₹)"
        prefix="₹"
        keyboardType="number-pad"
        value={monthly}
        onChangeText={(t) => setMonthly(t.replace(/\D/g, '').slice(0, 7))}
        error={amountError}
      />
      {resident.rent.source === 'set' && amount > 0 && amount !== resident.rent.monthly ? (
        <Text variant="caption" color="warningInk">
          {formatINR(amount)} applies from this month. Earlier months stay at {formatINR(resident.rent.monthly)}.
        </Text>
      ) : null}

      <Text variant="label" color="textSecondary">Rent is due every month on</Text>
      <Box style={styles.chips}>
        <Chip
          size="sm"
          label={`Check-in day (${ordinal(checkInDay)})`}
          selected={dueDay === null}
          onPress={() => { setDueDay(null); setCustomDay(''); }}
        />
        {QUICK_DAYS.map((d) => (
          <Chip
            key={d}
            size="sm"
            label={`${ordinal(d)}`}
            selected={dueDay === d && !customDay}
            onPress={() => { setDueDay(d); setCustomDay(''); }}
          />
        ))}
      </Box>
      <Input
        label="Another day"
        optional
        placeholder="1 – 28"
        keyboardType="number-pad"
        value={customDay}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '').slice(0, 2);
          setCustomDay(digits);
          const n = Number(digits);
          if (n >= 1 && n <= 28) setDueDay(n);
        }}
        error={customError}
      />

      <Box style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surfaceSunken }]}>
        <Text variant="caption" color="textSecondary">
          The first month is always due on the check-in date. Later months fall due on the day you pick.
        </Text>
      </Box>
    </Screen>
  );
}
