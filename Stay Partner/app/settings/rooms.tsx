import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Screen,
  TopHeader,
  Text,
  Card,
  Badge,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { ApiError, fetchMyProperties, type BackendListing } from '@/services';
import { fetchShareTypesApi } from '@/services/api/domain.api';
import { formatINR } from '@/lib/format';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Rooms & amenities.
 *
 * Replaces the "never designed" stub, and reads two sources because the answer
 * genuinely lives in two places:
 *
 *   rooms      `partner_share_types` — the sharing options this owner sells,
 *              with their price and their bed counts. Owner-scoped and
 *              writable, so occupancy here is a live figure.
 *   amenities  the property record, via `GET /partners/properties`. Amenities
 *              are catalogue data written during onboarding, not something an
 *              owner edits per room.
 *
 * ## Beds free is the number this screen exists for
 *
 * An owner opening "Rooms" is almost always answering one question — can I
 * take this person — and that is `availableBeds` against `totalBeds`. It leads,
 * and it is never rounded or defaulted: a share type with zero beds free reads
 * as full, because that is what it is.
 *
 * ## Read-only, like property details
 *
 * Prices and bed counts are set during onboarding, and the one thing an owner
 * CAN change — whether they are accepting bookings at all — already has its own
 * screen and its own switch on the dashboard. Duplicating that control here
 * would be a second place for the same state to drift.
 */

type ShareType = {
  id?: string;
  shareTypeId?: string;
  name?: string;
  monthlyPrice?: number;
  totalBeds?: number;
  availableBeds?: number;
  isAvailable?: boolean;
};

export default function RoomsAndAmenitiesScreen() {
  const [rooms, setRooms] = useState<ShareType[] | null>(null);
  const [properties, setProperties] = useState<BackendListing[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      /* Both at once — they are independent reads and the screen needs both
         before it can render anything meaningful. */
      const [shareTypes, props] = await Promise.all([
        fetchShareTypesApi(),
        fetchMyProperties(),
      ]);
      setRooms(Array.isArray(shareTypes) ? shareTypes : []);
      setProperties(props);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'We could not load your rooms.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Amenities are a property fact, so they are collected across the owner's
     properties and de-duplicated — an owner with two PGs should not read
     "Wi-Fi" twice. */
  const amenities = Array.from(
    new Set(
      properties
        .flatMap((p: any) => (Array.isArray(p.amenities) ? p.amenities : []))
        .map((a: any) => (typeof a === 'string' ? a : a?.label ?? a?.name))
        .filter(Boolean)
        .map((a: string) => String(a).trim()),
    ),
  );

  return (
    <Screen header={<TopHeader title="Rooms & amenities" showBack />} background="bg">
      {error ? (
        <ErrorState title="We could not load this" body={error} onRetry={load} />
      ) : rooms === null ? (
        <View style={styles.stack}>
          <Skeleton width="100%" height={92} radius={16} />
          <Skeleton width="100%" height={92} radius={16} />
        </View>
      ) : (
        <View style={styles.stack}>
          <Text variant="overline" color="textTertiary">
            Rooms
          </Text>

          {rooms.length === 0 ? (
            <EmptyState
              icon="bed"
              title="No room types set up"
              body="Sharing types, their prices and their bed counts are set up with Lampose during onboarding. Message us and we will add them."
            />
          ) : (
            rooms.map((room) => (
              <RoomCard key={room.id ?? room.shareTypeId ?? room.name} room={room} />
            ))
          )}

          <Text variant="overline" color="textTertiary" style={styles.sectionGap}>
            Amenities
          </Text>

          {amenities.length === 0 ? (
            <Card style={styles.amenityCard}>
              <Text variant="bodySm" color="textSecondary" style={styles.body}>
                No amenities are recorded against your properties yet.
              </Text>
            </Card>
          ) : (
            <Card style={styles.amenityCard}>
              <Text variant="bodySm" color="textSecondary" style={styles.body}>
                {amenities.join(' · ')}
              </Text>
            </Card>
          )}

          <Text variant="caption" color="textTertiary" style={styles.note}>
            Prices, bed counts and amenities are set by Lampose during onboarding. To change
            them, message us. Whether you are accepting bookings is on the dashboard.
          </Text>
        </View>
      )}
    </Screen>
  );
}

function RoomCard({ room }: { room: ShareType }) {
  const c = useColors();

  const total = Number(room.totalBeds ?? 0);
  const free = Number(room.availableBeds ?? 0);
  /* `isAvailable` is the owner's switch; a full room is closed regardless of
     it, so both have to be true for the row to read as open. */
  const open = room.isAvailable !== false && free > 0;

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
          {room.name?.trim() || 'Unnamed room type'}
        </Text>
        <Badge
          label={open ? 'Accepting' : free === 0 ? 'Full' : 'Paused'}
          tone={open ? 'success' : 'neutral'}
        />
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.beds, { color: free > 0 ? c.accentInkDeep : c.textTertiary }]}>
          {free} of {total} free
        </Text>
        <Text variant="bodySm" color="textSecondary">
          {Number.isFinite(Number(room.monthlyPrice))
            ? `${formatINR(Number(room.monthlyPrice))} / month`
            : 'Price not recorded'}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  sectionGap: { marginTop: 10 },
  card: { padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  beds: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  amenityCard: { padding: 14 },
  body: { lineHeight: 20 },
  note: { lineHeight: 18, marginTop: 6 },
});
