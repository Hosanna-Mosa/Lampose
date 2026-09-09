import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, IconButton, TextButton, Badge, EmptyState, Chip } from '@/components/ui';
import { useSupportTickets } from '@/services/hooks/useSupport';
import type { BackendPartnerTicket } from '@/services/api/support.api';
import { relativeTime } from '@/lib/notifications';
import { radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

/**
 * Guest reports — the owner's complaints, as conversations with Lampose.
 *
 * ## What changed
 *
 * This screen read `partner_complaints`, a collection with exactly one
 * reader: this screen. The owner could mark their own complaint resolved and
 * nobody at Lampose ever saw it. It now lists the owner's support tickets in
 * the `guest` category — the same rows the console's queue works — so a
 * report has a thread, gets an answer, and is resolved by the team rather
 * than by the person who raised it.
 *
 * ## Why it is still its own screen
 *
 * The dashboard's Complaints tile and the menu row both come here, and an
 * owner thinking "a guest did something" should not have to know that the
 * answer is called Support. It is a filtered view of the same list.
 */
type Tab = 'open' | 'resolved';

const isClosed = (t: BackendPartnerTicket) => t.status === 'resolved' || t.status === 'closed';

export default function ComplaintsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, isRefetching, refetch } = useSupportTickets();
  const [tab, setTab] = useState<Tab>('open');

  const reports = useMemo(
    () => (data?.tickets ?? []).filter((t) => t.category === 'guest'),
    [data],
  );
  const openCount = reports.filter((t) => !isClosed(t)).length;
  const rows = useMemo(
    () => reports
      .filter((t) => (tab === 'open' ? !isClosed(t) : isClosed(t)))
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()),
    [reports, tab],
  );

  return (
    <Screen
      contentStyle={styles.stack}
      refreshing={isRefetching}
      onRefresh={refetch}
      stickyHeader={(
        <>
          <View style={styles.headRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
            <TextButton label="+ New" onPress={() => router.push('/complaints/new')} />
          </View>
          <Text variant="screenTitle" style={styles.title}>Guest reports</Text>
          <Text variant="caption" color="textTertiary" style={styles.lede}>
            Problems with a guest, sent to the Lampose team. Replies arrive here and as a notification.
          </Text>
          {/* The same pill pair the Bookings tab uses. */}
          <View style={styles.tabs}>
            <Chip
              label={`Open${openCount ? ` · ${openCount}` : ''}`}
              size="sm"
              selected={tab === 'open'}
              onPress={() => setTab('open')}
            />
            <Chip label="Resolved" size="sm" selected={tab === 'resolved'} onPress={() => setTab('resolved')} />
          </View>
        </>
      )}
    >
      {isLoading ? (
        <EmptyState icon="clock" title="Loading" body="Fetching your reports…" style={styles.empty} />
      ) : isError ? (
        <EmptyState icon="alert-circle" title="Could not load" body="Check your connection and try again." actionLabel="Retry" onAction={() => { void refetch(); }} style={styles.empty} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="message"
          title={tab === 'open' ? 'Nothing open' : 'Nothing resolved yet'}
          body={tab === 'open'
            ? 'When something goes wrong with a guest, report it here and the Lampose team will pick it up.'
            : 'Reports the team has closed will appear here.'}
          style={styles.empty}
        />
      ) : (
        rows.map((t) => (
          <Pressable
            key={t.reference}
            onPress={() => router.push(`/support/ticket?id=${t.reference}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`${t.subject}. ${t.status}. ${relativeTime(new Date(t.lastActivityAt))}`}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? c.surfaceSunken : c.surface, borderColor: t.unread ? c.accent : c.borderCard, borderRadius: radius.card },
            ]}
          >
            <View style={styles.rowTop}>
              <Text variant="cardTitle" numberOfLines={1} style={styles.flex}>{t.subject}</Text>
              <Badge
                label={t.status === 'awaiting_customer' ? 'Reply needed' : t.status === 'open' ? 'With Lampose' : t.status === 'resolved' ? 'Resolved' : 'Closed'}
                tone={t.status === 'awaiting_customer' ? 'warning' : t.status === 'open' ? 'accent' : 'success'}
              />
            </View>
            {t.placeLabel ? (
              <Text variant="caption" color="textSecondary" numberOfLines={1}>{t.placeLabel}</Text>
            ) : null}
            <Text variant="bodySm" color="textSecondary" numberOfLines={2}>{t.lastMessagePreview}</Text>
            <Text variant="caption" color="textTertiary">
              {relativeTime(new Date(t.lastActivityAt))}{t.unread ? ' · new reply' : ''}
            </Text>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, marginLeft: -10 },
  title: { marginTop: 4 },
  lede: { marginTop: 2, marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  row: { borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  empty: { marginTop: 40 },
});
