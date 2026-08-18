import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  IconButton,
  Segmented,
  Card,
  Badge,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { useMyRequests, useMarkRequestsRead } from '@/services/hooks/usePortfolio';
import type { BackendPartnerRequest, BackendRequestStatus } from '@/services';
import { fonts } from '@/constants/typography';

/**
 * Requests — visit requests customers have sent to this owner's properties.
 *
 * Replaces a screen that was entirely fixture data: five invented guests with
 * invented Aadhar numbers, an "Accept booking" button, and a price breakdown,
 * none of which the backend has ever supported. What the backend actually has
 * is `VisitRequest` — someone proved their own phone number through the User
 * App and asked to see a property; the owner's only real response happens
 * over WhatsApp (`AVAILABLE` / `NOT AVAILABLE`), not a button in this app.
 * `useMyRequests` already read the real thing — the dashboard's pending count
 * has used it for a while — this screen just hadn't been wired to it.
 */

type Category = 'pending' | 'confirmed' | 'closed';
const CATEGORIES: readonly Category[] = ['pending', 'confirmed', 'closed'];
const CATEGORY_LABELS: Record<Category, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  closed: 'Closed',
};
const EMPTY_COPY: Record<Category, { title: string; body: string }> = {
  pending: {
    title: 'No requests right now',
    body: 'A visit request lands here the moment a customer verifies their number and asks to see this property.',
  },
  confirmed: {
    title: 'Nothing confirmed yet',
    body: 'Requests you replied AVAILABLE to on WhatsApp show up here.',
  },
  closed: {
    title: 'Nothing here',
    body: 'Declined and expired requests show up in this list.',
  },
};

function categoryOf(status: BackendRequestStatus): Category {
  if (status === 'confirmed') return 'confirmed';
  if (status === 'declined' || status === 'expired') return 'closed';
  return 'pending';
}

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

/** Everything the server actually recorded about what they're after, in one line. */
function intentSummary(request: BackendPartnerRequest): string {
  const intent = request.intent;
  if (!intent) return 'Details not recorded';

  const parts: string[] = [];
  if (intent.stayType) parts.push(intent.stayType === 'short' ? 'Short stay' : 'Long stay');
  if (intent.duration && intent.durationUnit) parts.push(`${intent.duration} ${intent.durationUnit}`);
  if (intent.rateAmount && intent.rateUnit) {
    parts.push(`₹${intent.rateAmount.toLocaleString('en-IN')}/${intent.rateUnit}`);
  }
  return parts.length ? parts.join(' · ') : 'Details not recorded';
}

export default function RequestsInbox() {
  const router = useRouter();
  const [category, setCategory] = useState<Category>('pending');
  const { requests, unread, isLoading, error, refetch } = useMyRequests();
  useMarkRequestsRead(unread, !isLoading);

  const list = requests.filter((r) => categoryOf(r.status) === category);

  return (
    <Screen
      contentStyle={styles.stack}
      stickyHeader={
        <>
          {/*
            The design draws no back affordance here — it assumes you arrive from a
            tab. This screen is pushed from the dashboard, so it gets the same inline
            chevron every other pushed screen in the set uses.
          */}
          <View style={styles.headerRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>

          <Text variant="screenTitle">Requests</Text>
        </>
      }
    >
      <Segmented options={CATEGORIES} value={category} onChange={setCategory} labels={CATEGORY_LABELS} />

      {error ? (
        <ErrorState title="We could not load this" body={error.displayMessage} onRetry={refetch} style={styles.empty} />
      ) : isLoading ? (
        <View style={styles.stack}>
          <Skeleton width="100%" height={92} radius={16} />
          <Skeleton width="100%" height={92} radius={16} />
        </View>
      ) : list.length > 0 ? (
        list.map((r) => (
          <RequestRow
            key={r.id}
            request={r}
            onPress={() => router.push({ pathname: '/requests/[id]', params: { id: r.id } })}
          />
        ))
      ) : (
        <EmptyState
          icon="bookings"
          title={EMPTY_COPY[category].title}
          body={EMPTY_COPY[category].body}
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

function RequestRow({ request, onPress }: { request: BackendPartnerRequest; onPress: () => void }) {
  return (
    <Card variant="elevated" onPress={onPress} style={styles.row}>
      <View style={styles.rowTop}>
        <Text variant="bodyMedium" style={styles.guest} numberOfLines={1}>
          {request.customer.name || 'Unnamed guest'}
        </Text>
        <Badge label={statusLabel(request.status)} tone={statusTone(request.status)} />
      </View>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {request.propertyName || 'Property not recorded'}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {intentSummary(request)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  headerRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: -10,
    marginRight: -10,
    marginBottom: -4,
  },
  empty: { minHeight: 320 },
  row: { gap: 5 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  guest: { flex: 1, fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
});
