import { Box, Tappable } from '@/components/common';
import { Text, Card, Badge, Button, DetailRow, Icon, Switch } from '@/components/common';
import { type BackendListing, type PropertyInventoryItem } from '@/services';
import { FreeBedsRow } from '@/components/FreeBedsRow';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/settings-property/styles';
import { dash, money, listedOn } from '@/components/settings-property/utils';
import { Block } from '@/components/settings-property/molecules/Block';

export function PropertyCard({
  property,
  onEdit,
  onAvailability,
  onRemove,
  removing,
  inventory,
  inventoryError,
  onInventorySaved,
}: {
  property: BackendListing & Record<string, any>;
  onEdit?: () => void;
  onAvailability?: (next: boolean) => void;
  onRemove?: () => void;
  removing?: boolean;
  /** Beds per room type: total and free now. `undefined` while loading. */
  inventory?: PropertyInventoryItem[];
  inventoryError?: string | null;
  onInventorySaved?: (next: PropertyInventoryItem) => void;
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
      <Box style={styles.head}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>
          {dash(property.name)}
        </Text>
        <Badge
          label={verified ? 'Verified' : 'Pending'}
          tone={verified ? 'success' : 'warning'}
        />
      </Box>

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
        <Box style={[styles.availRow, { backgroundColor: c.bg, borderColor: c.borderCard }]}>
          <Box style={styles.availText}>
            <Text variant="bodySm" style={{ color: c.textPrimary, fontFamily: fonts.semibold }}>
              {availability ? 'Taking bookings' : 'Paused'}
            </Text>
            <Text variant="caption" color="textTertiary" style={styles.availHint}>
              {availability
                ? 'Students can request a room here.'
                : 'Hidden from new requests. Bookings you already have are unaffected.'}
            </Text>
          </Box>
          <Switch
            value={availability}
            onChange={onAvailability}
            accessibilityLabel={`${property.name} is ${availability ? 'taking bookings' : 'paused'}`}
          />
        </Box>
      ) : onAvailability ? (
        <Box style={[styles.availRow, { backgroundColor: c.bg, borderColor: c.borderCard }]}>
          <Box style={styles.availText}>
            <Text variant="bodySm" style={{ color: c.textPrimary, fontFamily: fonts.semibold }}>
              No room counts yet
            </Text>
            <Text variant="caption" color="textTertiary" style={styles.availHint}>
              Add how many rooms of each type this has, in Edit details, before it can take
              requests.
            </Text>
          </Box>
        </Box>
      ) : null}

      {onEdit ? (
        <Button label="Edit details" onPress={onEdit} variant="secondary" size="sm" fullWidth={false} />
      ) : null}

      {/*
        Beds: the total next to what is FREE right now.

        The total is what the building has and never moves by itself; free
        beds go down when a request is accepted and back up on a cancel or a
        check-out — the same number students see as "N left". Showing only
        the total made a booking look like it changed nothing.
      */}
      {inventoryError ? (
        <Block label="Beds">
          <Text variant="caption" color="textTertiary">
            {inventoryError}
          </Text>
        </Block>
      ) : inventory === undefined ? null : inventory.length ? (
        <Block label="Beds · free now">
          <Box style={styles.stack}>
            {inventory.map((item) => (
              <FreeBedsRow
                key={item.shareTypeId}
                propertyId={String(property.id ?? property._id)}
                item={item}
                onSaved={onInventorySaved}
              />
            ))}
          </Box>
        </Block>
      ) : null}

      {/*
        Short facts only.

        A label/value row works when the value is a word or a number. The
        address is neither — a full postal address in a right-aligned value
        column is three cramped lines fighting a one-word label, so it gets a
        block of its own below.
      */}
      <Box>
        {/* How many times students opened this property from its card — in
            the Lampose app and on lampose.com. Every tap counts. */}
        {typeof property.clickCount === 'number' ? (
          <DetailRow
            label="Clicks"
            value={`${property.clickCount.toLocaleString('en-IN')} ${property.clickCount === 1 ? 'click' : 'clicks'}`}
          />
        ) : null}
        <DetailRow label="Category" value={dash(property.category)} />
        <DetailRow label="Area" value={dash(property.locality ?? property.place)} />
        <DetailRow label="Rent" value={money(property.rent)} />
        <DetailRow label="Deposit" value={money(property.deposit)} />
        <DetailRow label="Open to" value={dash(property.gender)} />
        <DetailRow label="Listed on" value={listedOn(property.listedAt)} last />
      </Box>

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
          <Box style={styles.amenities}>
            {amenities.map((a) => (
              <Box
                key={a}
                style={[styles.amenity, { backgroundColor: c.bg, borderColor: c.borderCard }]}
              >
                <Text variant="caption" color="textSecondary">
                  {a}
                </Text>
              </Box>
            ))}
          </Box>
        </Block>
      ) : null}

      {/*
        Deleting the listing, not pausing it.
        Bottom of the card and its own row — the same weight "Cancel
        booking" gets on the booking detail screen, so a destructive action
        always reads the same way in this app: a trash icon and a red link,
        never a filled button somebody could tap by reflex.
      */}
      {onRemove ? (
        <Tappable
          onPress={onRemove}
          disabled={removing}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${dash(property.name)} from Lampose`}
          style={({ pressed }) => [styles.remove, { opacity: pressed || removing ? 0.6 : 1 }]}
        >
          <Icon name="trash" size={14} color={c.error} strokeWidth={2} />
          <Text variant="link" style={{ color: c.error }}>
            {removing ? 'Deleting…' : 'Delete this listing'}
          </Text>
        </Tappable>
      ) : null}
    </Card>
  );
}

/** A full-width label-above-value block, for anything too long to sit in a row. */
