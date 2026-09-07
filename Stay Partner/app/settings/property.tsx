import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
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
  Skeleton,
  Switch,
} from '@/components/ui';
import { ApiError, fetchMyProperties, type BackendListing } from '@/services';
import { setPropertyAvailability } from '@/services/api/portfolio.api';
import { formatDateLong, formatINR } from '@/lib/format';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

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

const dash = (value: unknown): string => {
  if (value === null || value === undefined) return 'Not recorded';
  const text = String(value).trim();
  return text.length ? text : 'Not recorded';
};

const money = (value: unknown): string => {
  const n = Number(value);
  /* `0` is a real deposit and must not be swallowed by a falsy check — a
     zero-deposit property is a selling point, not a missing field. */
  return Number.isFinite(n) && value !== null && value !== undefined
    ? formatINR(n)
    : 'Not recorded';
};

/**
 * "Aug 15, 2026" rather than "2026-08-15T07:16:53.330Z".
 *
 * The raw ISO string was going straight onto the row. It is unreadable, it is
 * three times too wide for a value column, and the milliseconds and timezone
 * are noise on a date whose only job is to say roughly when the listing went
 * up.
 */
const listedOn = (value: unknown): string => {
  if (!value) return 'Not recorded';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? 'Not recorded' : formatDateLong(date);
};

export default function PropertyDetailsScreen() {
  const router = useRouter();
  const [properties, setProperties] = useState<BackendListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      Alert.alert(
        'Could not change that',
        err instanceof ApiError ? err.displayMessage : 'Please try again.',
      );
    } finally {
      load();
    }
  }, [load]);

  return (
    <Screen header={<TopHeader title="Property details" showBack />} background="bg">
      {error ? (
        <ErrorState title="We could not load this" body={error} onRetry={load} />
      ) : properties === null ? (
        <View style={styles.stack}>
          <Skeleton width="100%" height={132} radius={16} />
          <Skeleton width="100%" height={132} radius={16} />
        </View>
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
        <View style={styles.stack}>
          {properties.map((p) => {
            const id = p.id ?? p._id;
            return (
              <PropertyCard
                key={id ?? p.name}
                property={p}
                onEdit={id ? () => router.push({ pathname: '/settings/property-edit', params: { id } }) : undefined}
                onAvailability={id ? (next) => toggleAvailability(id, next) : undefined}
              />
            );
          })}

          <Text variant="caption" color="textTertiary" style={styles.note}>
            This is your listing exactly as guests see it. Tap "Edit details" on a card to add
            or correct anything onboarding missed.
          </Text>
        </View>
      )}
    </Screen>
  );
}

function PropertyCard({
  property,
  onEdit,
  onAvailability,
}: {
  property: BackendListing & Record<string, any>;
  onEdit?: () => void;
  onAvailability?: (next: boolean) => void;
}) {
  const c = useColors();

  const verified = property.isVerified === true;
  /* `null` is a third state, not a falsy `false`: no room counts were ever
     recorded, so this listing is unrequestable for a reason a switch cannot
     fix. See `getMyProperties`. */
  const availability: boolean | null = typeof property.isAvailable === 'boolean'
    ? property.isAvailable
    : null;
  const amenities: string[] = Array.isArray(property.amenities)
    ? property.amenities.map((a: any) => (typeof a === 'string' ? a : a?.label ?? a?.name)).filter(Boolean)
    : [];

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>
          {dash(property.name)}
        </Text>
        <Badge
          label={verified ? 'Verified' : 'Pending'}
          tone={verified ? 'success' : 'warning'}
        />
      </View>

      {/*
        Taking this listing off, and putting it back on.

        Per PROPERTY. The dashboard's switch is partner-wide — it pauses every
        listing this owner has at once — so an owner with more than one had no
        way to pause a single listing, and once paused, the same all-or-nothing
        switch was the only way back.

        Immediate, with no save button: this is a state you flip, not a field
        you edit, and burying it in the edit form would mean three taps and a
        save to answer "we are full this month".
      */}
      {onAvailability && availability !== null ? (
        <View style={[styles.availRow, { backgroundColor: c.bg, borderColor: c.borderCard }]}>
          <View style={styles.availText}>
            <Text variant="bodySm" style={{ color: c.textPrimary, fontFamily: fonts.semibold }}>
              {availability ? 'Taking bookings' : 'Paused'}
            </Text>
            <Text variant="caption" color="textTertiary" style={styles.availHint}>
              {availability
                ? 'Students can request a room here.'
                : 'Hidden from new requests. Bookings you already have are unaffected.'}
            </Text>
          </View>
          <Switch
            value={availability}
            onChange={onAvailability}
            accessibilityLabel={`${property.name} is ${availability ? 'taking bookings' : 'paused'}`}
          />
        </View>
      ) : onAvailability ? (
        <View style={[styles.availRow, { backgroundColor: c.bg, borderColor: c.borderCard }]}>
          <View style={styles.availText}>
            <Text variant="bodySm" style={{ color: c.textPrimary, fontFamily: fonts.semibold }}>
              No room counts yet
            </Text>
            <Text variant="caption" color="textTertiary" style={styles.availHint}>
              Add how many rooms of each type this has, in Edit details, before it can take
              requests.
            </Text>
          </View>
        </View>
      ) : null}

      {onEdit ? (
        <Button label="Edit details" onPress={onEdit} variant="secondary" size="sm" fullWidth={false} />
      ) : null}

      {/*
        Short facts only.

        A label/value row works when the value is a word or a number. The
        address is neither — a full postal address in a right-aligned value
        column is three cramped lines fighting a one-word label, so it gets a
        block of its own below.
      */}
      <View>
        <DetailRow label="Category" value={dash(property.category)} />
        <DetailRow label="Area" value={dash(property.locality ?? property.place)} />
        <DetailRow label="Rent" value={money(property.rent)} />
        <DetailRow label="Deposit" value={money(property.deposit)} />
        <DetailRow label="Open to" value={dash(property.gender)} />
        <DetailRow label="Listed on" value={listedOn(property.listedAt)} last />
      </View>

      {property.address ? (
        <Block label="Address">
          <Text variant="bodySm" color="textSecondary" style={styles.body}>
            {property.address}
          </Text>
        </Block>
      ) : null}

      {property.description ? (
        <Block label="Description">
          <Text variant="bodySm" color="textSecondary" style={styles.body}>
            {property.description}
          </Text>
        </Block>
      ) : null}

      {amenities.length ? (
        <Block label={`Amenities · ${amenities.length}`}>
          {/*
            Chips, not a `·`-joined paragraph.
            Nine amenities run together into four lines of prose that has to be
            read start to finish. As chips each one is a shape the eye can find,
            which is how somebody checks whether "Power Backup" is on the
            listing without reading the other eight.
          */}
          <View style={styles.amenities}>
            {amenities.map((a) => (
              <View
                key={a}
                style={[styles.amenity, { backgroundColor: c.bg, borderColor: c.borderCard }]}
              >
                <Text variant="caption" color="textSecondary">
                  {a}
                </Text>
              </View>
            ))}
          </View>
        </Block>
      ) : null}
    </Card>
  );
}

/** A full-width label-above-value block, for anything too long to sit in a row. */
function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  card: { padding: 14, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  availRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  availText: { flex: 1, gap: 2 },
  availHint: { lineHeight: 15 },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 16, lineHeight: 21 },
  block: { gap: 6 },
  body: { lineHeight: 20 },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  amenity: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    /* Never wider than the card. A long amenity label wraps inside its own
       chip rather than pushing the row off the edge. */
    maxWidth: '100%',
  },
  note: { lineHeight: 18, marginTop: 4 },
});
