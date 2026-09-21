import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

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
 * The current-location row.
 *
 * ## It takes a real fix now
 *
 * It used to be a label over `guessLocality` — the area with the most
 * listings in it — dressed as a location control and captioned "most likely".
 * Nothing about it touched the device: a student in Kondapur and a student in
 * Bangalore were both offered whichever area happened to be busiest, and a
 * control called "use my current location" that has never asked for a location
 * is worse than no control, because it is confidently wrong.
 *
 * A tap on this row no longer takes a fix by itself — the screen above it
 * (`app/(entry)/locality.tsx`) opens `NearbyRadiusDialog` first, and only
 * once a radius is chosen does it run `locateMe` and build a `nearbyLocality`
 * around that fix. This component still only draws the three states the
 * whole exchange produces — idle, working, answered — and nothing else.
 * `subtitle` is whatever the screen has to say, because only the screen
 * knows whether a radius search is in progress, failed, or has not been
 * asked for yet.
 *
 * The result is still a SUGGESTION that has to be tapped through the dialog.
 * A geocoder that names the road a bus is on rather than the neighbourhood is
 * a normal outcome, and it costs a tap rather than a wasted search.
 */
export function CurrentLocationRow({
  subtitle,
  loading = false,
  tone = 'normal',
  onPress,
}: {
  /** What the screen has to say about the fix. Never invented here. */
  subtitle: string;
  loading?: boolean;
  /** `problem` draws the caption in the caution ink — refused, or no match. */
  tone?: 'normal' | 'problem';
  onPress: () => void;
}) {
  const { colors, space, radius, touch } = useTheme();

  return (
    <Pressable
      onPress={loading ? undefined : onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ busy: loading }}
      accessibilityLabel={`Use my current location. ${subtitle}`}
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
      {/* The spinner replaces the pin rather than sitting beside it, so the row
          does not change width while it works. */}
      {loading ? (
        <ActivityIndicator color={colors.brandInk} style={styles.glyph} />
      ) : (
        <Icon name="crosshair" size={20} color={colors.brandInk} />
      )}
      <View style={styles.flex}>
        <Text variant="bodyStrong" color="brand">
          {loading ? 'Finding you…' : 'Use my current location'}
        </Text>
        <Text variant="numMeta" color={tone === 'problem' ? 'warning' : 'tertiary'}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  rentCol: { alignItems: 'flex-end' },
  /* The icon's own box, so swapping in a spinner does not shift the text. */
  glyph: { width: 20, height: 20 },
});
