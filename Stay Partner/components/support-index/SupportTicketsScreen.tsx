import { useMemo, useState } from 'react';
import { Box, Tappable } from '@/components/common';
import { useRouter } from 'expo-router';
import { Screen, Text, TextButton, IconButton, Chip, ChipRow, Badge, EmptyState } from '@/components/common';
import { useSupportTickets } from '@/services/hooks/useSupport';
import type { BackendPartnerTicket, SupportTicketStatus } from '@/services/api/support.api';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { TicketRow } from '@/components/support-index/organisms/TicketRow/TicketRow';
import { styles } from '@/components/support-index/styles';

/*
 * The owner's support inbox, for real.
 *
 * Used to read `TICKETS`, a fixture array in `lib/support.ts` that nothing
 * ever wrote to — a new ticket vanished on the next app restart, and a
 * guest's own ticket about this owner's property had nowhere to appear at
 * all. This reads `/partners/support/tickets`, which is BOTH: this owner's
 * own filed tickets, and every ticket a student filed about one of their
 * properties (see `linkedPartnerId` — the "Guest issue" chip below is the
 * only thing that tells the two apart, because they belong in one inbox
 * rather than two screens an owner has to check separately).
 */

type Filter = 'all' | 'open' | 'resolved';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
];

export function SupportTicketsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const { data, isLoading, isError, isRefetching, refetch } = useSupportTickets();

  const tickets = data?.tickets ?? [];

  const filtered = useMemo(() => {
    if (filter === 'all') return tickets;
    if (filter === 'resolved') return tickets.filter((t) => t.status === 'resolved' || t.status === 'closed');
    return tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed');
  }, [tickets, filter]);

  return (
    <Screen
      contentStyle={styles.stack}
      refreshing={isRefetching}
      onRefresh={refetch}
      stickyHeader={
        <Box style={styles.backRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </Box>
      }
    >
      <Box style={styles.head}>
        <Text variant="screenTitle">Support</Text>
        <TextButton label="+ New ticket" onPress={() => router.push('/support/new')} />
      </Box>

      <ChipRow style={styles.filters}>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            size="sm"
            tone="neutral"
            selected={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ChipRow>

      {isLoading ? (
        <EmptyState icon="clock" title="Loading" body="Fetching your support tickets…" style={styles.empty} />
      ) : isError ? (
        <EmptyState
          icon="alert-circle"
          title="Could not load tickets"
          body="Check your connection and try again."
          style={styles.empty}
        />
      ) : filtered.length > 0 ? (
        filtered.map((t) => (
          <TicketRow
            key={t.reference}
            ticket={t}
            onPress={() => router.push(`/support/ticket?id=${t.reference}`)}
          />
        ))
      ) : (
        <EmptyState
          icon="message"
          title="No tickets here"
          body="Switch filters, or raise a new ticket if something needs attention."
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

