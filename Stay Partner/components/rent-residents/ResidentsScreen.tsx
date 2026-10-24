import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';

import {
  Box, Button, Chip, EmptyState, ErrorState, IconButton, Input, Screen, Skeleton, Text,
} from '@/components/common';
import { ResidentRow, rentStyles as styles } from '@/components/rent-common';
import { useResidents } from '@/services/hooks/useRent';
import type { Resident } from '@/services/api/rent.api';

type Filter = 'all' | 'owing' | 'paid' | 'unset';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'owing', label: 'Owing' },
  { key: 'paid', label: 'Up to date' },
  { key: 'unset', label: 'No rent set' },
];

const matches = (r: Resident, filter: Filter) => {
  if (filter === 'owing') return r.summary.status === 'overdue' || r.summary.status === 'due';
  if (filter === 'paid') return r.rent.source !== 'none' && (r.summary.status === 'paid' || r.summary.status === 'upcoming');
  if (filter === 'unset') return r.rent.source === 'none';
  return true;
};

/**
 * Everybody living in the owner's PG right now — every booking still holding
 * a bed, walk-ins and app bookings alike — searchable by name, room or phone.
 *
 * Adding a resident is the existing Add Customer flow (phone verified, KYC
 * checked); it is linked here rather than rebuilt.
 */
export function ResidentsScreen() {
  const router = useRouter();
  const { residents, isLoading, isError, error, isRefetching, refetch } = useResidents();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return residents.filter((r) => matches(r, filter) && (!q
      || r.guestName.toLowerCase().includes(q)
      || (r.roomNumber || '').toLowerCase().includes(q)
      || (r.guestPhone || '').includes(q)));
  }, [residents, query, filter]);

  return (
    <Screen
      contentStyle={styles.stack}
      refreshing={isRefetching}
      onRefresh={refetch}
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>
          <Text variant="screenTitle">Your Residents</Text>
        </>
      }
    >
      <Button
        label="Add a resident"
        icon="plus"
        variant="secondary"
        onPress={() => router.push('/requests/add-customer')}
      />

      <Input
        placeholder="Search by name, room or phone"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        containerStyle={styles.search}
      />

      <Box style={styles.chips}>
        {FILTERS.map((f) => (
          <Chip key={f.key} size="sm" label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </Box>

      {isError && !residents.length ? (
        <ErrorState title="We could not load your residents" body={error?.displayMessage} onRetry={refetch} />
      ) : isLoading ? (
        <Box style={styles.stack}>
          <Skeleton width="100%" height={84} radius={14} />
          <Skeleton width="100%" height={84} radius={14} />
          <Skeleton width="100%" height={84} radius={14} />
        </Box>
      ) : residents.length === 0 ? (
        <EmptyState
          icon="users"
          title="No residents yet"
          body="Guests staying with you — walk-ins you add and bookings from the app — appear here with their rent."
          actionLabel="Add a resident"
          onAction={() => router.push('/requests/add-customer')}
          style={styles.empty}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon="search" title="Nobody matches" body="Try another name, room or filter." style={styles.empty} />
      ) : (
        <>
          <Text variant="caption" color="textSecondary">
            {shown.length} of {residents.length} resident{residents.length === 1 ? '' : 's'}
          </Text>
          {shown.map((r) => (
            <ResidentRow
              key={r.id}
              resident={r}
              onPress={() => router.push({ pathname: '/rent/resident/[id]', params: { id: r.id } } as never)}
            />
          ))}
        </>
      )}
    </Screen>
  );
}
