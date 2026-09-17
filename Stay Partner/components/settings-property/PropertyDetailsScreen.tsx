import { useCallback, useState } from 'react';
import { Box, Tappable } from '@/components/common';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Screen,
  TopHeader,
  Text,
  Card,
  Badge,
  Button,
  DetailRow,
  EmptyState,
  ErrorState,
  Icon,
  Skeleton,
  Switch,
} from '@/components/common';
import { useAlert } from '@/components/common';
import { ApiError, fetchMyProperties, type BackendListing } from '@/services';
import { removeMyProperty, setPropertyAvailability } from '@/services/api/portfolio.api';
import { formatDateLong, formatINR } from '@/lib/format';
import { fonts } from '@/constants/typography';
import { PropertyCard } from '@/components/settings-property/organisms/PropertyCard/PropertyCard';
import { Block } from '@/components/settings-property/molecules/Block/Block';
import { dash } from '@/components/settings-property/utils';
import { styles } from '@/components/settings-property/styles';

/**
 * Property details.
 *
 * Replaces the "never designed" stub. Started as a deliberately READ-ONLY
 * view: a property was written by the v1 onboarding surface, whose writes
 * need an administrator's grant an owner does not have, and an edit form
 * here would either need that privilege or quietly bypass the verification
 * the catalogue depends on.
 *
 * The "Edit details" button on each card is the resolution of that, not a
 * reversal of it: it opens `settings/property-edit.tsx`, which writes
 * through a narrower, purpose-built endpoint gated on ownership rather than
 * an employee grant — see `propertyEdit.controller.js` on the backend for the
 * actual boundary and what it costs (no admin review before a save lands).
 *
 * ## Every value is the server's
 *
 * `GET /partners/properties`, scoped to the phone number this partner proved.
 * A field the catalogue has not recorded renders as "Not recorded" rather than
 * a plausible-looking stand-in — an owner reading their own listing has to be
 * able to tell a real rent from a placeholder, and knows from the button that
 * a "Not recorded" field is one they can now fill in themselves.
 */

export function PropertyDetailsScreen() {
  const router = useRouter();
  const { alert, confirm } = useAlert();
  const [properties, setProperties] = useState<BackendListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProperties(await fetchMyProperties());
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'We could not load your properties.');
    }
  }, []);

  /*
   * Refetched every time the screen comes back into focus.
   *
   * "Edit details" pushes `settings/property-edit`, which `back()`s here on a
   * successful save. A plain mount effect would leave this card showing the
   * rent, photos and amenities the owner has just changed — the same reason
   * `customers.tsx` reloads on focus rather than on mount.
   */
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /*
   * Pausing or resuming ONE listing.
   *
   * Optimistic, then reconciled: the switch moves under the thumb and the
   * list is reloaded from the server afterwards, so what is finally on screen
   * is the server's answer rather than the tap's. A failure puts the switch
   * back and says why — a toggle that silently stayed where you left it while
   * the server disagreed is how an owner comes to believe a listing is off.
   */
  const toggleAvailability = useCallback(async (id: string, next: boolean) => {
    setProperties((prev) => prev && prev.map((p) => (
      (p.id ?? p._id) === id ? { ...p, isAvailable: next } : p
    )));
    try {
      await setPropertyAvailability(id, next);
    } catch (err) {
      setProperties((prev) => prev && prev.map((p) => (
        (p.id ?? p._id) === id ? { ...p, isAvailable: !next } : p
      )));
      void alert({
        title: 'Could not change that',
        message: err instanceof ApiError ? err.displayMessage : 'Please try again.',
        tone: 'error',
      });
    } finally {
      load();
    }
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  /*
   * Deleting a listing from Lampose.
   *
   * The server does the actual bookkeeping — this is soft, `partner_bookings`
   * and payouts against it are untouched, and it is refused with a clear
   * reason while a guest is currently staying/due or a student is waiting on
   * an answer. What this does is ask, then act on what the server actually
   * decided: the card is only dropped from the list once the request has
   * succeeded, never optimistically — an owner acting on the wrong card here
   * has no undo.
   */
  const removeProperty = useCallback(async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete "${dash(name)}"?`,
      message: 'This takes it off Lampose for good — students will no longer find it, and it '
        + 'stops taking requests. Past bookings, payouts and reviews are kept. This cannot be '
        + 'undone from the app; message us if you need it back.',
      confirmLabel: 'Delete listing',
      cancelLabel: 'Keep it',
      destructive: true,
    });
    if (!ok) return;

    setRemovingId(id);
    try {
      await removeMyProperty(id);
      setProperties((prev) => (prev ? prev.filter((p) => (p.id ?? p._id) !== id) : prev));
    } catch (err) {
      void alert({
        title: 'Could not delete this listing',
        message: err instanceof ApiError ? err.displayMessage : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setRemovingId(null);
    }
  }, [alert, confirm]);

  return (
    <Screen
      header={<TopHeader title="Property details" showBack />}
      background="bg"
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {error ? (
        <ErrorState title="We could not load this" body={error} onRetry={load} />
      ) : properties === null ? (
        <Box style={styles.stack}>
          <Skeleton width="100%" height={132} radius={16} />
          <Skeleton width="100%" height={132} radius={16} />
        </Box>
      ) : properties.length === 0 ? (
        /*
         * A real and common state, not a bug — three of the properties in the
         * catalogue have no owner mobile recorded at all, so their owner
         * matches nothing. The copy says which number was used, because that
         * is the one fact that makes the support call short.
         */
        <EmptyState
          icon="home"
          title="No properties linked yet"
          body="Nothing in the catalogue is recorded against your mobile number. If you have a listing with Lampose, message us and we will link it to this account."
        />
      ) : (
        <Box style={styles.stack}>
          {properties.map((p) => {
            const id = p.id ?? p._id;
            return (
              <PropertyCard
                key={id ?? p.name}
                property={p}
                onEdit={id ? () => router.push({ pathname: '/settings/property-edit', params: { id } }) : undefined}
                onAvailability={id ? (next) => toggleAvailability(id, next) : undefined}
                onRemove={id ? () => removeProperty(id, p.name ?? '') : undefined}
                removing={id != null && id === removingId}
              />
            );
          })}

          <Text variant="caption" color="textTertiary" style={styles.note}>
            This is your listing exactly as guests see it. Tap "Edit details" on a card to add
            or correct anything onboarding missed.
          </Text>
        </Box>
      )}
    </Screen>
  );
}

