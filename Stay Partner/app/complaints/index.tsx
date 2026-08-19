import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Badge, EmptyState } from '@/components/ui';
import { statusLabel, type Complaint } from '@/lib/complaints';
import { relativeTime } from '@/lib/notifications';
import { fetchComplaintsApi, updateComplaintStatusApi } from '@/services/api/domain.api';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { logWarn } from '@/lib/log';

export default function ComplaintsScreen() {
  const router = useRouter();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

  const loadComplaints = async () => {
    setLoading(true);
    try {
      const items = await fetchComplaintsApi();
      const mapped: Complaint[] = (items || []).map((c: any) => ({
        id: c.id || c._id,
        guestName: 'Guest',
        subject: c.title || 'Property Issue',
        description: c.description || '',
        status: (c.status === 'open' || c.status === 'in_progress' ? 'open' : 'resolved') as any,
        raisedAt: new Date(c.createdAt || Date.now()),
      }));
      setComplaints(mapped);
    } catch (err) {
      logWarn('Failed to load complaints:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const sorted = [...complaints].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.raisedAt.getTime() - a.raisedAt.getTime();
  });

  return (
    <Screen
      contentStyle={styles.stack}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>

          <Text variant="screenTitle" style={styles.title}>
            Complaints
          </Text>
        </>
      }
    >

      {sorted.length > 0 ? (
        sorted.map((c) => (
          <ComplaintCard key={c.id} complaint={c} onResolved={loadComplaints} />
        ))
      ) : (
        <EmptyState
          icon="message"
          title="No open complaints"
          body="Issues reported by guests or property staff will show up here."
        />
      )}
    </Screen>
  );
}

function ComplaintCard({ complaint, onResolved }: { complaint: Complaint; onResolved: () => void }) {
  const c = useColors();
  const open = complaint.status === 'open';
  const [resolving, setResolving] = useState(false);

  /*
   * Writes, then reloads from the server.
   *
   * Not optimistic: the row is a record of somebody's unresolved problem, and
   * flipping it to resolved on a request that then failed would hide a
   * complaint that is still open. `onResolved` re-fetches the list so the
   * screen shows what was actually stored.
   */
  const resolve = async () => {
    setResolving(true);
    try {
      await updateComplaintStatusApi(complaint.id, 'resolved');
      onResolved();
    } catch (err) {
      logWarn('Could not resolve complaint:', err);
    } finally {
      setResolving(false);
    }
  };

  return (
    <View
      style={[
        styles.card,
        { borderColor: c.borderCard, backgroundColor: c.surface, opacity: open ? 1 : 0.85 },
      ]}
    >
      <View style={styles.cardHead}>
        <Text style={styles.subject}>{complaint.subject}</Text>
        <Badge label={statusLabel(complaint.status)} tone={open ? 'warning' : 'success'} />
      </View>

      <Text variant="bodySm" color="textSecondary" style={styles.description}>
        {complaint.description}
      </Text>

      <View style={styles.metaRow}>
        <Text variant="caption" color="textTertiary">
          {complaint.guestName}
          {complaint.bookingId ? ` · #${complaint.bookingId}` : ''} · {relativeTime(complaint.raisedAt)}
        </Text>
      </View>

      {open ? (
        <Button
          label={resolving ? 'Saving…' : 'Mark resolved'}
          variant="secondary"
          size="sm"
          loading={resolving}
          disabled={resolving}
          fullWidth={false}
          onPress={resolve}
          style={styles.resolveButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -6 },
  title: { marginBottom: 4 },

  card: { borderWidth: 1, borderRadius: radius.card, padding: 14, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  subject: { flex: 1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  description: { lineHeight: 19 },
  metaRow: { flexDirection: 'row' },
  resolveButton: { marginTop: 2 },
});
