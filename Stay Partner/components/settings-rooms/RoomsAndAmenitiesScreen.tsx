import { useCallback, useEffect, useState } from 'react';
import { Box } from '@/components/common';
import {
  Screen,
  TopHeader,
  Text,
  Card,
  Badge,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/common';
import { ApiError, fetchMyProperties, type BackendListing } from '@/services';
import { fetchShareTypesApi } from '@/services/api/domain.api';
import { formatINR } from '@/lib/format';
import { fonts } from '@/constants/typography';
import { RoomCard } from '@/components/settings-rooms/organisms/RoomCard/RoomCard';
import { ShareType } from '@/components/settings-rooms/utils';
import { styles } from '@/components/settings-rooms/styles';

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

export function RoomsAndAmenitiesScreen() {
  const [rooms, setRooms] = useState<ShareType[] | null>(null);
  const [properties, setProperties] = useState<BackendListing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
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
    <Screen
      header={<TopHeader title="Rooms & amenities" showBack />}
      background="bg"
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {error ? (
        <ErrorState title="We could not load this" body={error} onRetry={load} />
      ) : rooms === null ? (
        <Box style={styles.stack}>
          <Skeleton width="100%" height={92} radius={16} />
          <Skeleton width="100%" height={92} radius={16} />
        </Box>
      ) : (
        <Box style={styles.stack}>
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
        </Box>
      )}
    </Screen>
  );
}

