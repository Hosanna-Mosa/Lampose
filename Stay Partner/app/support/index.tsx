import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, TextButton, IconButton, Chip, ChipRow, Badge, EmptyState } from '@/components/ui';
import { useSupportTickets } from '@/services/hooks/useSupport';
import type { BackendPartnerTicket, SupportTicketStatus } from '@/services/api/support.api';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

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

const STATUS_TONE: Record<SupportTicketStatus, 'warning' | 'accent' | 'success' | 'neutral'> = {
  open: 'warning',
  awaiting_customer: 'accent',
  resolved: 'success',
  closed: 'neutral',
};

const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  open: 'Open',
  awaiting_customer: 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** "3 min", "2 h", "5 d". */
function timeLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export default function SupportTicketsScreen() {
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
        <View style={styles.backRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </View>
      }
    >
      <View style={styles.head}>
        <Text variant="screenTitle">Support</Text>
        <TextButton label="+ New ticket" onPress={() => router.push('/support/new')} />
      </View>

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

function TicketRow({ ticket, onPress }: { ticket: BackendPartnerTicket; onPress: () => void }) {
  const c = useColors();
  const dimmed = ticket.status === 'resolved' || ticket.status === 'closed';
  const fromGuest = Boolean(ticket.linkedPartnerId);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.subject}. ${STATUS_LABEL[ticket.status]}. ${ticket.category ?? ''}, ${timeLabel(ticket.lastActivityAt)}`}
      style={({ pressed }) => [
        styles.card,
        { borderColor: c.borderCard, backgroundColor: c.surface, opacity: pressed ? 0.75 : dimmed ? 0.75 : 1 },
      ]}
    >
      <View style={styles.titleRow}>
        <Text
          style={[styles.subject, { fontFamily: dimmed ? fonts.semibold : fonts.bold }]}
          numberOfLines={1}
        >
          {ticket.subject}
        </Text>
        {ticket.unread ? <View style={[styles.dot, { backgroundColor: c.accent }]} /> : null}
      </View>

      <View style={styles.metaRow}>
        <Badge label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />
        {fromGuest && (
          /* This owner did not file this one — a student did, about one of
             their properties. See the header for why it is one inbox. */
          <Badge label="Guest issue" tone="neutral" />
        )}
        <Text variant="caption" color="textCaption" style={styles.metaText}>
          {ticket.category ?? 'Report'} · {timeLabel(ticket.lastActivityAt)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -8 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  filters: { marginBottom: 4 },

  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  subject: { flex: 1, fontSize: 14, lineHeight: 19 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 5, flexShrink: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaText: { fontSize: 12 },
  empty: { minHeight: 260, borderRadius: radius.card },
});
