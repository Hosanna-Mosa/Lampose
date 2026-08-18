import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  IconButton,
  Card,
  DetailRow,
  Badge,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { useMyRequest } from '@/services/hooks/usePortfolio';
import { formatDateLong } from '@/lib/format';
import type { BackendRequestStatus } from '@/services';

/**
 * One visit request, read-only.
 *
 * Replaces a screen that ran entirely on invented data: a countdown to an
 * `expiresAt` the server has never sent, an "Accept booking" button with a
 * fabricated price breakdown, and a KYC form that saved to nowhere. None of
 * that has a real counterpart — a visit request isn't a booking, and the
 * owner's only real reply to one happens over WhatsApp
 * (`AVAILABLE` / `NOT AVAILABLE`), not a button here. This shows exactly what
 * `GET /partners/requests/:id` actually recorded, and nothing it didn't.
 */

function statusTone(status: BackendRequestStatus): 'warning' | 'success' | 'error' | 'neutral' {
  if (status === 'confirmed') return 'success';
  if (status === 'declined') return 'error';
  if (status === 'expired') return 'neutral';
  return 'warning';
}

function statusLabel(status: BackendRequestStatus): string {
  if (status === 'pending_owner') return 'Awaiting your reply';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'declined') return 'Declined';
  return 'Expired';
}

const dash = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text.length ? text : 'Not recorded';
};

export default function RequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { request, isLoading, error, refetch } = useMyRequest(id);

  const backRow = (
    <View style={styles.backRow}>
      <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
    </View>
  );

  if (error) {
    return (
      <Screen scroll={false} padX={22} background="bg" stickyHeader={backRow}>
        <ErrorState title="We could not load this" body={error.displayMessage} onRetry={refetch} />
      </Screen>
    );
  }

  if (isLoading || !request) {
    return (
      <Screen padX={22} background="bg" stickyHeader={backRow}>
        <View style={styles.stack}>
          <Skeleton width="100%" height={90} radius={16} />
          <Skeleton width="100%" height={140} radius={16} />
          <Skeleton width="100%" height={140} radius={16} />
        </View>
      </Screen>
    );
  }

  const intent = request.intent;

  return (
    <Screen padX={22} contentStyle={styles.stack} stickyHeader={backRow}>
      <View style={styles.headRow}>
        <Text variant="h3" style={styles.guestName} numberOfLines={2}>
          {dash(request.customer.name)}
        </Text>
        <Badge label={statusLabel(request.status)} tone={statusTone(request.status)} />
      </View>

      <Card>
        <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
          Contact
        </Text>
        <DetailRow label="Phone" value={dash(request.customer.phone)} />
        <DetailRow label="Email" value={dash(request.customer.email)} last />
      </Card>

      <Card>
        <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
          Property &amp; timing
        </Text>
        <DetailRow label="Property" value={dash(request.propertyName)} />
        <DetailRow label="Preferred date" value={dash(request.preferredDate)} />
        <DetailRow label="Preferred time" value={dash(request.preferredTime)} last />
      </Card>

      <Card>
        <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
          What they&apos;re looking for
        </Text>
        {intent ? (
          <>
            <DetailRow
              label="Stay type"
              value={intent.stayType === 'short' ? 'Short stay' : intent.stayType === 'long' ? 'Long stay' : 'Not recorded'}
            />
            <DetailRow
              label="Duration"
              value={intent.duration && intent.durationUnit ? `${intent.duration} ${intent.durationUnit}` : 'Not recorded'}
            />
            <DetailRow
              label="Joining"
              value={
                intent.joiningDate
                  ? formatDateLong(new Date(intent.joiningDate))
                  : intent.flexibleJoin
                    ? 'Flexible'
                    : 'Not recorded'
              }
            />
            <DetailRow
              label="Rate"
              value={intent.rateAmount && intent.rateUnit ? `₹${intent.rateAmount.toLocaleString('en-IN')} / ${intent.rateUnit}` : 'Not recorded'}
              last
            />
          </>
        ) : (
          <DetailRow label="Details" value="Not recorded" last />
        )}
      </Card>

      <Text variant="caption" color="textTertiary" style={styles.note}>
        {request.status === 'pending_owner'
          ? "Lampose has messaged you on WhatsApp about this request — reply AVAILABLE or NOT AVAILABLE there to respond."
          : 'This request was answered over WhatsApp.'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -4 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  guestName: { flex: 1 },
  sectionLabel: { marginBottom: 4 },
  note: { lineHeight: 18, marginTop: 4 },
});
