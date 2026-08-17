import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { Locality } from '@/types/auth';

/**
 * A locality row.
 *
 * All four facts come from the server: the name, how many places are listed,
 * the median rent, and the nearest landmark. The median is here rather than two
 * screens later because "which area can I afford?" is the decision being made
 * on this screen.
 *
 * A locality with nothing listed is shown greyed rather than hidden — a
 * missing row reads as a typo to the person who searched for it.
 */
export function LocalityRow({
  locality,
  onPress,
}: {
  locality: Locality;
  onPress: () => void;
}) {
  const { colors, space, touch } = useTheme();
  const empty = locality.listingCount === 0;

  /* "1 places" was on every row of this screen, because each area in the
     catalogue currently holds exactly one property — which is the case a
     hardcoded plural is guaranteed to get wrong. */
  const places = `${locality.listingCount} ${locality.listingCount === 1 ? 'place' : 'places'}`;

  /**
   * Areas whose only listing is priced by the night have no monthly median,
   * and the server sends `null` rather than converting one — a ₹450 dormitory
   * bed is not ₹13,500 a month, and nobody quoted that.
   *
   * The row used to render nothing at all in that case, leaving a gap where
   * every neighbouring row has a number. A blank in a column of prices reads
   * as a value that failed to load, so the reason is said instead.
   */
  const rentUnknown = !empty && locality.medianRent === null;

  return (
    <Pressable
      onPress={empty ? undefined : onPress}
      disabled={empty}
      accessibilityRole="button"
      accessibilityState={{ disabled: empty }}
      accessibilityLabel={
        empty
          ? `${locality.name}, no places listed yet`
          : `${locality.name}, ${places}${
              locality.medianRent !== null
                ? `, median rent ${formatRupees(locality.medianRent)}`
                : ', priced by the night'
            }`
      }
      android_ripple={{ color: colors.surfaceSunken }}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: touch.listRow,
          paddingVertical: space[3],
          gap: space[3],
          opacity: empty ? 0.55 : 1,
          backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
        },
      ]}
    >
      <View style={styles.flex}>
        <Text variant="bodyLg">{locality.name}</Text>
        <Text variant="numMeta" color="tertiary" numberOfLines={1}>
          {empty
            ? 'no places listed yet'
            : `${places}${locality.nearestLandmark ? ` · near ${locality.nearestLandmark}` : ''}`}
        </Text>
      </View>

      {empty ? null : rentUnknown ? (
        <View style={styles.rentCol}>
          <Text variant="numMeta" color="tertiary">
            by the night
          </Text>
        </View>
      ) : (
        <View style={styles.rentCol}>
          <Text variant="priceSm">{formatRupees(locality.medianRent as number)}</Text>
          <Text variant="numMeta" color="tertiary">
            median
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * The current-location row, which sits above the list and states its guess.
 *
 * Stating it is the point: a wrong GPS read gets caught here, before it
 * filters anything.
 */
export function CurrentLocationRow({
  guessName,
  onPress,
}: {
  guessName: string;
  onPress: () => void;
}) {
  const { colors, space, radius, touch } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Use my current location. Best guess: ${guessName}`}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: touch.min,
          padding: space[3],
          gap: space[3],
          borderRadius: radius.chip,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
        },
      ]}
    >
      <Icon name="mapPin" size={20} color={colors.brandInk} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" color="brand">
          Use my current location
        </Text>
        <Text variant="numMeta" color="tertiary">
          {guessName}, most likely
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  rentCol: { alignItems: 'flex-end' },
});
