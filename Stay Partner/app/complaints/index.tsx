import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Badge } from '@/components/ui';
import {
  COMPLAINTS,
  resolveComplaint,
  statusLabel,
  subscribeComplaints,
  type Complaint,
} from '@/lib/complaints';
import { relativeTime } from '@/lib/notifications';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

export default function ComplaintsScreen() {
  const router = useRouter();

  // Resolving one has to actually move it out of "open" for real, on this
  // same screen — same subscription shape as every other mutable list here.
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeComplaints(() => setRevision((r) => r + 1)), []);

  // Open first, most recent within each group first — what needs a decision
  // belongs above what's already settled.
  const sorted = [...COMPLAINTS].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.raisedAt.getTime() - a.raisedAt.getTime();
  });

  return (
    <Screen contentStyle={styles.stack} key={revision}>
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <Text variant="screenTitle" style={styles.title}>
        Complaints
      </Text>

      {sorted.map((c) => (
        <ComplaintCard key={c.id} complaint={c} />
      ))}
    </Screen>
  );
}

function ComplaintCard({ complaint }: { complaint: Complaint }) {
  const c = useColors();
  const open = complaint.status === 'open';

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
          label="Mark resolved"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() => resolveComplaint(complaint.id)}
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
