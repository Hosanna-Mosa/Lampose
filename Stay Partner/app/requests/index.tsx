import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  IconButton,
  Segmented,
  EmptyState,
  RequestCard,
  type BookingRequest,
} from '@/components/ui';
import {
  REQUESTS,
  categoryOf,
  consumeLastAddedId,
  grossOf,
  subscribeRequests,
  type RequestCategory,
  type RequestDetail,
} from '@/lib/requests';
import { formatINR, formatRange } from '@/lib/format';

const CATEGORIES: readonly RequestCategory[] = ['pending', 'approved', 'rejected'];
const CATEGORY_LABELS: Record<RequestCategory, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};
const EMPTY_COPY: Record<RequestCategory, { title: string; body: string }> = {
  pending: {
    title: 'No requests right now',
    body: 'New booking requests arrive here, and you’ll get a notification when they do.',
  },
  approved: {
    title: 'Nothing approved yet',
    body: 'Accept a pending request and it lands here, ready for KYC.',
  },
  rejected: {
    title: 'Nothing here',
    body: 'Declined and expired requests show up in this list.',
  },
};

function toBookingRequest(r: RequestDetail): BookingRequest {
  return {
    id: r.id,
    guest: r.guest,
    dates: formatRange(r.checkIn, r.checkOut),
    roomType: r.roomType,
    amount: formatINR(grossOf(r)),
    status: r.status,
    expiresAt: r.expiresAt,
  };
}

export default function RequestsInbox() {
  const router = useRouter();
  const [category, setCategory] = useState<RequestCategory>('pending');

  // Accepting or declining a request changes which tab it lives in — the
  // inbox has to actually move it, not just leave the count stale.
  const [revision, setRevision] = useState(0);
  useEffect(
    () =>
      subscribeRequests(() => {
        setRevision((r) => r + 1);
        // A customer added by hand from any tab should be easy to find right
        // after saving, not require switching to Approved yourself.
        if (consumeLastAddedId()) setCategory('approved');
      }),
    [],
  );

  const grouped = useMemo(() => {
    const groups: Record<RequestCategory, RequestDetail[]> = { pending: [], approved: [], rejected: [] };
    for (const r of REQUESTS) groups[categoryOf(r)].push(r);
    // Soonest-expiring first for pending — that's the one thing actually racing a clock.
    groups.pending.sort((a, b) => a.expiresAt - b.expiresAt);
    groups.approved.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
    groups.rejected.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision forces a re-read
  }, [revision]);

  const list = grouped[category];

  return (
    <Screen
      contentStyle={styles.stack} key={revision}
      stickyHeader={
        <>
          {/*
            The design draws no back affordance here — it assumes you arrive from a
            tab. This screen is pushed from the dashboard, so it gets the same inline
            chevron every other pushed screen in the set uses.
          */}
          <View style={styles.headerRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
            <IconButton
              name="plus"
              label="Add customer"
              onPress={() => router.push('/requests/add-customer')}
            />
          </View>

          <Text variant="screenTitle">Requests</Text>
        </>
      }
    >

      <Segmented options={CATEGORIES} value={category} onChange={setCategory} labels={CATEGORY_LABELS} />

      {list.length > 0 ? (
        list.map((r) => (
          <RequestCard
            key={r.id}
            request={toBookingRequest(r)}
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
});
