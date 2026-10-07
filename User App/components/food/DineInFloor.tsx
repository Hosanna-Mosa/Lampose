import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { DineInFloor } from '@/types/food';

/**
 * What a restaurant's floor offers, one short fact per pill.
 *
 * Only the facilities that APPLY. A list of every facility with a cross
 * beside the missing ones reads as a scorecard, and "No valet" next to a
 * dhaba that never claimed to have one is a complaint nobody made. The
 * restaurant's own answers are the only source — nothing here is inferred.
 */
export function floorFacilities(floor: DineInFloor): { glyph: IconName; label: string }[] {
  const out: { glyph: IconName; label: string }[] = [];

  if (floor.seatingCapacity > 0) {
    out.push({
      glyph: 'dining',
      label: floor.tableCount > 0
        ? `${floor.seatingCapacity} seats · ${floor.tableCount} ${floor.tableCount === 1 ? 'table' : 'tables'}`
        : `${floor.seatingCapacity} seats`,
    });
  }
  if (floor.acSeating === 'both') out.push({ glyph: 'ac', label: 'AC and Non-AC' });
  else if (floor.acSeating === 'ac') out.push({ glyph: 'ac', label: 'AC' });
  else if (floor.acSeating === 'non_ac') out.push({ glyph: 'nonAc', label: 'Non-AC' });
  if (floor.indoorSeating) out.push({ glyph: 'indoor', label: 'Indoor' });
  if (floor.outdoorSeating) out.push({ glyph: 'outdoor', label: 'Outdoor' });
  if (floor.familySeating) out.push({ glyph: 'sharing', label: 'Family seating' });
  if (floor.coupleSeating) out.push({ glyph: 'couple', label: 'Couple seating' });
  if (floor.smoking === 'smoking_area') out.push({ glyph: 'smokingArea', label: 'Smoking area' });
  else if (floor.smoking === 'non_smoking') out.push({ glyph: 'noSmoking', label: 'Non-smoking' });
  if (floor.wheelchairAccessible) out.push({ glyph: 'wheelchair', label: 'Wheelchair accessible' });
  if (floor.parkingAvailable) out.push({ glyph: 'carPark', label: 'Parking' });
  if (floor.valetParking) out.push({ glyph: 'commute', label: 'Valet' });
  if (floor.kidsFriendly) out.push({ glyph: 'kids', label: 'Kids friendly' });
  if (floor.petFriendly) out.push({ glyph: 'pets', label: 'Pet friendly' });

  return out;
}

/** The facility pills, wrapped. Neutral on purpose: a fact, not an offer. */
export function DineInFacilities({ floor }: { floor: DineInFloor }) {
  const { colors, space, radius } = useTheme();
  const facilities = floorFacilities(floor);
  if (!facilities.length) return null;

  return (
    <View style={[styles.pills, { gap: space[2] }]}>
      {facilities.map((facility) => (
        <View
          key={facility.label}
          style={[
            styles.pill,
            {
              backgroundColor: colors.surfaceSunken,
              borderRadius: radius.pill,
              paddingHorizontal: space[2] + 2,
              gap: space[1],
            },
          ]}
        >
          <Icon name={facility.glyph} size={14} color={colors.textSecondary} />
          <Text variant="caption" color="secondary">
            {facility.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Dine-in on a kitchen's page: the floor, and the way to book it.
 *
 * Drawn only when the kitchen takes table bookings at all (`dineIn` is not
 * null). A paused floor keeps its card and its facilities — "do they have
 * outdoor seating?" is still worth answering on a night they are not taking
 * bookings — and the button stays on screen, disabled, with the reason under
 * it rather than vanishing.
 */
export function DineInCard({ floor, onBook }: { floor: DineInFloor; onBook: () => void }) {
  const { colors, space, radius } = useTheme();
  const bookable = floor.available && !floor.paused;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.card,
          padding: space[3],
          gap: space[3],
        },
      ]}
    >
      <View style={{ gap: 2 }}>
        <Text variant="eyebrow" color="tertiary">
          Dine-in
        </Text>
        <Text variant="title3">
          {floor.maxPartySize > 0
            ? `Tables for up to ${floor.maxPartySize} ${floor.maxPartySize === 1 ? 'guest' : 'guests'}`
            : 'Tables at the restaurant'}
        </Text>
      </View>

      <DineInFacilities floor={floor} />

      <View style={{ gap: space[1] }}>
        <Button label="Book a table" size="sm" icon="calendar" fullWidth disabled={!bookable} onPress={onBook} />
        <Text variant="caption" color="tertiary" style={styles.center}>
          {bookable
            ? 'The restaurant confirms within 15 minutes. Nothing to pay now.'
            : 'Not taking table bookings right now'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  pills: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', minHeight: 26 },
  center: { textAlign: 'center' },
});
