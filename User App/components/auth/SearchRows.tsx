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

  return (
    <Pressable
      onPress={empty ? undefined : onPress}
      disabled={empty}
      accessibilityRole="button"
      accessibilityState={{ disabled: empty }}
      accessibilityLabel={
        empty
          ? `${locality.name}, no places listed yet`
          : `${locality.name}, ${locality.listingCount} places, median rent ${formatRupees(locality.medianRent ?? 0)}`
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
            : `${locality.listingCount} places${locality.nearestLandmark ? ` · near ${locality.nearestLandmark}` : ''}`}
        </Text>
      </View>

      {!empty && locality.medianRent !== null ? (
        <View style={styles.rentCol}>
          <Text variant="priceSm">{formatRupees(locality.medianRent)}</Text>
          <Text variant="numMeta" color="tertiary">
            median
          </Text>
        </View>
      ) : null}
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
