import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, RentDisplay, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { availabilityLabel, isGone, type Listing } from '@/types/listing';

/**
 * A row in the saved list.
 *
 * A shortlist exists to be compared, so these rows carry rent AND deposit —
 * both of them, together — where the feed card carries only rent. A saved list
 * showing names and one number forces the user back into every listing to
 * rebuild the comparison they saved it to avoid.
 *
 * A price change since saving is shown as arithmetic, not a badge: what it was,
 * what it is, and when it moved. The student is deciding whether to trust the
 * number, not whether to celebrate it — so "price dropped!" would be a
 * marketing device where a delta is a fact. The delta is set in the numeric
 * face at the same size as the rent, so it reads as part of the same figure.
 */

export type SavedEntry = {
  listing: Listing;
  /** What the rent was when it was saved, if it has moved since. */
  rentWhenSaved?: number;
  /** "3 days ago" — already formatted by the server. */
  changedLabel?: string;
};

export type SavedRowProps = {
  entry: SavedEntry;
  onPress: () => void;
  onRemove: () => void;
};

export function SavedRow({ entry, onPress, onRemove }: SavedRowProps) {
  const { colors, space, radius } = useTheme();
  const { listing, rentWhenSaved, changedLabel } = entry;

  const gone = isGone(listing.availability);
  const delta =
    rentWhenSaved !== undefined && listing.rent !== null ? listing.rent - rentWhenSaved : null;

  return (
    <Pressable
      onPress={gone ? undefined : onPress}
      disabled={gone}
      accessibilityRole="button"
      accessibilityLabel={`${listing.name}, ${listing.locality}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.card,
          padding: space[3],
          gap: space[3],
          opacity: gone ? 0.62 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.thumb,
          { borderRadius: radius.chip, backgroundColor: colors.surfaceSunken },
        ]}
      />

      <View style={[styles.flex, { gap: space[1] }]}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {listing.name}
        </Text>
        <Text variant="numMeta" color="secondary" numberOfLines={1}>
          {listing.locality}
          {listing.sharingLabel ? ` · ${listing.sharingLabel}` : ''}
        </Text>

        {/* Both numbers, always — that is what the list is for. */}
        <RentDisplay
          rent={listing.rent}
          deposit={listing.deposit}
          depositMonths={listing.depositMonths}
          perBed={listing.perBed}
          perNight={listing.perNight}
          size="card"
          struck={gone}
        />

        {delta !== null && delta !== 0 ? (
          <View style={[styles.deltaRow, { gap: space[1] }]}>
            <Text
              variant="priceSm"
              style={{ color: delta < 0 ? colors.success.ink : colors.warning.ink }}
            >
              {delta < 0 ? '−' : '+'}
              {formatRupees(Math.abs(delta))}
            </Text>
            {/* Batch 12: a drop was green and a rise was amber, and nothing
                else differed. The sign and the word carry it now — the colour
                only reinforces. */}
            <Text variant="numMeta" color="tertiary">
              {delta < 0 ? 'cheaper' : 'dearer'} since you saved it · was{' '}
              {formatRupees(rentWhenSaved!)}
              {changedLabel ? ` · changed ${changedLabel}` : ''}
            </Text>
          </View>
        ) : null}

        {gone ? (
          <Text variant="numMeta" color="tertiary">
            {availabilityLabel(listing.availability)}
          </Text>
        ) : null}
      </View>

      {/* The bookmark is the remove control, and it is undoable for six
          seconds — a mis-tap on a bus is the case undo exists for. */}
      <Pressable
        onPress={onRemove}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${listing.name} from saved`}
        style={styles.remove}
      >
        <Icon name="bookmark" size={24} color={colors.brandInk} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  thumb: { width: 72, height: 72 },
  flex: { flex: 1 },
  deltaRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
