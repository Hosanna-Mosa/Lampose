import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, TextButton, IconButton, Chip, ChipRow, Badge, EmptyState } from '@/components/ui';
import {
  STATUS_TONE,
  TICKETS,
  statusLabel,
  subscribeTickets,
  ticketTimeLabel,
  type SupportTicket,
} from '@/lib/support';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

type Filter = 'all' | 'open' | 'resolved';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
];

export default function SupportTicketsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');

  // A new ticket has to actually show up here, not just on the screen that
  // created it.
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeTickets(() => setRevision((r) => r + 1)), []);

  const tickets = useMemo(() => {
    if (filter === 'all') return TICKETS;
    if (filter === 'resolved') return TICKETS.filter((t) => t.status === 'resolved');
    // "Open" groups both active states — a ticket being worked on is still open
    // to the owner, even once support has picked it up.
    return TICKETS.filter((t) => t.status !== 'resolved');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision forces a re-read
  }, [filter, revision]);

  return (
    <Screen
      contentStyle={styles.stack}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>
        </>
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

      {tickets.length > 0 ? (
        tickets.map((t) => (
          <TicketRow
            key={t.id}
            ticket={t}
            onPress={() => router.push(`/support/ticket?id=${t.id}`)}
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

function TicketRow({ ticket, onPress }: { ticket: SupportTicket; onPress: () => void }) {
  const c = useColors();
  // Resolved tickets recede — the design dims the whole card and drops a
  // weight, since a closed ticket is a record, not something to act on.
  const dimmed = ticket.status === 'resolved';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.subject}. ${statusLabel(ticket.status)}. ${ticket.category}, ${ticketTimeLabel(ticket.updatedAt)}`}
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
        {ticket.hasUnreadUpdate ? <View style={[styles.dot, { backgroundColor: c.accent }]} /> : null}
      </View>

      <View style={styles.metaRow}>
        <Badge label={statusLabel(ticket.status)} tone={STATUS_TONE[ticket.status]} />
        <Text variant="caption" color="textCaption" style={styles.metaText}>
          {ticket.category} · {ticketTimeLabel(ticket.updatedAt)}
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12 },
  empty: { minHeight: 260, borderRadius: radius.card },
});
