import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon, RentDisplay, Skeleton, Text } from '@/components/ui';
import { usePressAnimation } from '@/hooks/usePressAnimation';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { GenderBadge } from './Badges';
import { availabilityLabel, isGone, isScarce, type Availability, type Listing } from '@/types/listing';

/**
 * The listing card.
 *
 * Deliberately sparse: a photo you can swipe, the name, the area, a save
 * and the rent. Everything else — deposit, availability, verification, the
 * amenities — lives on the listing detail.
 *
 * That is a departure from the original design, which put the deposit on every
 * card and called it the loudest rule in the system. The trade was made
 * knowingly: a browsable feed reads better without it, and the deposit leads
 * hard on detail to compensate. The one thing that did NOT come off the card is
 * the gender badge — a boy tapping into a girls-only PG is a wasted trip, not a
 * filtering preference, so it stays on the photo.
 *
 * `RentDisplay` is still used unmodified, which is what keeps the card → detail
 * price flight alive. A card simply passes no deposit.
 *
 * There was a third `map` variant — a 300pt compact card that sat above the map
 * sheet. The map view was cut in favour of handing off to Google Maps, so the
 * variant went with it rather than lingering as a shape nothing renders.
 */

export type ListingCardVariant = 'carousel' | 'list';

const GEOMETRY = {
  carousel: { width: 280, photoHeight: 210 },
  list: { width: undefined, photoHeight: 220 },
} as const;

/* ------------------------------------------------------------------ *
 * Availability — off the card, kept for detail and results
 * ------------------------------------------------------------------ */

export function AvailabilityChip({ availability }: { availability: Availability }) {
  const { colors, space, radius } = useTheme();
  const gone = isGone(availability);
  const scarce = isScarce(availability);
  const label = availabilityLabel(availability);

  /* No label, no chip. An `UNSTATED` availability — which is every listing the
     live API returns, because the panel records no occupancy — would
     otherwise draw an empty tinted pill on each card: a green badge asserting
     nothing, which reads as a value that failed to load. */
  if (!label) return null;

  const set = gone
    ? { bg: colors.surfaceSunken, ink: colors.textSecondary }
    : scarce
      ? { bg: colors.warning.tint, ink: colors.warning.ink }
      : { bg: colors.success.tint, ink: colors.success.ink };

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: set.bg,
          borderRadius: radius.chip,
          paddingHorizontal: space[2],
          gap: 4,
          // Batch 12: scarcity gains a bordered container as well as the glyph
          // and the word, so three independent signals carry it. Hue was doing
          // the work alone.
          borderWidth: scarce ? StyleSheet.hairlineWidth : 0,
          borderColor: scarce ? colors.warning.border : 'transparent',
        },
      ]}
    >
      {scarce ? <Icon name="alert" size={16} color={set.ink} /> : null}
      <Text variant="numMeta" style={{ color: set.ink }}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Photo carousel
 * ------------------------------------------------------------------ */

/** Stand-ins until real photography lands. Deterministic per listing. */
const PLACEHOLDERS = [
  ['#6d7b8d', '#3a4553'],
  ['#7d8d7b', '#3f5340'],
  ['#8d7b8a', '#533f50'],
  ['#7b8a8d', '#3f5053'],
  ['#8d857b', '#534b3f'],
] as const;

function PhotoCarousel({
  listing,
  width,
  height,
  onToggleSave,
  showGender,
  genderMatches,
  swipeable,
  onPress,
  onPressIn,
  onPressOut,
}: {
  listing: Listing;
  width: number;
  height: number;
  onToggleSave?: () => void;
  showGender: boolean;
  genderMatches: boolean;
  swipeable: boolean;
  /* Given to each PAGE rather than wrapped around the carousel — see the note
     on `page` below. Without this the photos do not swipe. */
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
}) {
  const { colors, space, radius } = useTheme();
  const [index, setIndex] = useState(0);

  /*
   * The gallery, or the cover repeated, or nothing.
   *
   * `photoUris` is what the server sends — the Cloudinary URLs the field
   * agent uploaded. Before it existed this carousel paged through
   * `photoCount` copies of a single `photoUri`, which was invisible against
   * fixtures that had a count and no photographs and became a swipe between
   * four identical images the moment the data was real.
   *
   * `photoCount` is still the count, because a listing may report more
   * photographs than the feed response carries.
   */
  const photos = listing.photoUris?.length
    ? listing.photoUris
    : listing.photoUri
      ? [listing.photoUri]
      : [];

  // At most five pages — a card is for deciding whether to open the listing,
  // not for viewing eighteen photos.
  const pages = Math.max(1, Math.min(photos.length || listing.photoCount, 5));

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const page = (pageIndex: number) => {
    const [from, to] = PLACEHOLDERS[pageIndex % PLACEHOLDERS.length];
    const uri = photos[pageIndex];

    const photo = (
      <>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: to, opacity: 0.55 }]} />
        )}
      </>
    );

    /*
     * The tap target lives INSIDE the carousel, not around it.
     *
     * The whole card used to be one `Pressable`, which meant the photos never
     * swiped: on Android the Pressable claims the touch on the first move and
     * the horizontal ScrollView beneath it never gets the chance to take it
     * back. The dots were there, the pages were there, and the gesture went
     * nowhere.
     *
     * A Pressable inside a ScrollView is the arrangement that works — the
     * scroll wins a drag, the press wins a tap — so opening the listing by
     * tapping the photo still does exactly what it did.
     */
    return (
      <View key={pageIndex} style={{ width, height, backgroundColor: from }}>
        {onPress ? (
          <Pressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={`Photo ${pageIndex + 1} of ${pages}. Opens the listing.`}
          >
            {photo}
          </Pressable>
        ) : photo}
      </View>
    );
  };

  return (
    <View style={{ width, height, borderRadius: radius.card, overflow: 'hidden' }}>
      {swipeable && pages > 1 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          // Locks the gesture to one axis, which is what keeps this usable
          // inside a horizontally scrolling row of cards.
          directionalLockEnabled
        >
          {Array.from({ length: pages }, (_, pageIndex) => page(pageIndex))}
        </ScrollView>
      ) : (
        page(0)
      )}

      {showGender ? (
        // The one thing that survived the strip. A hard rule the user cannot
        // see is a hard rule they will walk into.
        <View style={[styles.absolute, { top: space[2], left: space[2] }]}>
          <GenderBadge gender={listing.gender} matchesUser={genderMatches} onPhoto compact />
        </View>
      ) : null}

      {pages > 1 ? (
        <View style={[styles.absolute, styles.dots, { bottom: space[2] }]}>
          {Array.from({ length: pages }, (_, dot) => (
            <View
              key={dot}
              style={{
                width: 6,
                height: 6,
                borderRadius: radius.pill,
                backgroundColor: '#FFFFFF',
                opacity: dot === index ? 1 : 0.45,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The card
 * ------------------------------------------------------------------ */

function Body({ listing, onToggleSave }: { listing: Listing; onToggleSave?: () => void }) {
  const { colors, space } = useTheme();

  const secondary =
    listing.perNight && listing.monthlyEquivalent
      ? `${formatRupees(listing.monthlyEquivalent)}/month`
      : undefined;

  return (
    <View style={{ gap: space[1] }}>
      <View style={[styles.titleRow, { gap: space[2] }]}>
        {/* The name truncates; the area never does. A half-read area name is
            worse than a shortened PG name. */}
        <Text variant="title3" numberOfLines={1} style={styles.flex}>
          {listing.name}
        </Text>
        {/*
          Save, where the rating used to be.

          A star and a number told somebody almost nothing they could act on —
          every place sat between 3.8 and 4.5 — and reviews have left the
          product entirely. What belongs in the one slot beside the name is the
          only thing a person actually wants to do to a card they are scrolling
          past: keep it.

          It is here rather than over the photo because a control on a
          photograph is a control that disappears against a light one, and
          because the thumb is already at this end of the row.
        */}
        {onToggleSave ? (
          <Pressable
            onPress={onToggleSave}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityState={{ selected: listing.saved }}
            accessibilityLabel={
              listing.saved ? `Remove ${listing.name} from saved` : `Save ${listing.name}`
            }
            style={({ pressed }) => [styles.saveTap, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Icon
              name="bookmark"
              size={20}
              color={listing.saved ? colors.brandInk : colors.textTertiary}
              fill={listing.saved ? colors.brandInk : 'none'}
            />
          </Pressable>
        ) : null}
      </View>

      <Text variant="body" color="secondary" numberOfLines={1}>
        {listing.locality}
        {listing.localityNote ? ` · ${listing.localityNote}` : ''}
      </Text>

      <View style={{ marginTop: space[1] }}>
        <RentDisplay
          rent={listing.rent}
          perBed={listing.perBed}
          perNight={listing.perNight}
          secondaryLine={secondary}
          size="card"
          sharedTag={`rent-${listing.id}`}
          struck={isGone(listing.availability)}
        />
      </View>
    </View>
  );
}

export type ListingCardProps = {
  listing: Listing;
  variant?: ListingCardVariant;
  onPress?: () => void;
  onToggleSave?: () => void;
  /** False when the listing's gender does not match the filter in force. */
  genderMatches?: boolean;
  style?: ViewStyle;
};

export function ListingCard({
  listing,
  variant = 'carousel',
  onPress,
  onToggleSave,
  genderMatches = true,
  style,
}: ListingCardProps) {
  const { colors, space, radius } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation('card');
  const gone = isGone(listing.availability);

  /**
   * The list card is fluid, so its photo width has to be measured rather than
   * assumed.
   *
   * It was hardcoded to 358, which overhangs a 360-unit screen by 30 once the
   * gutters are taken off — and its own skeleton used '100%', so the card and
   * its loading state disagreed. '100%' is not an option here either: the
   * carousel divides by this number to work out which page it is on, so a
   * percentage would break the swipe rather than the layout.
   *
   * 358 stays only as the value before the first layout pass, which lasts one
   * frame.
   */
  const [listWidth, setListWidth] = useState(358);

  const width = variant === 'carousel' ? GEOMETRY.carousel.width : undefined;

  // No border and no fill: the photo is the object, and a frame around it makes
  // a feed of cards read as a table.
  const surface: ViewStyle = { opacity: gone ? 0.62 : 1 };

  const content = (
    <View
      style={{ gap: space[3] }}
      // Only the fluid variant needs measuring; the carousel card is fixed.
      onLayout={
        variant === 'list'
          ? (event) => {
              const next = Math.round(event.nativeEvent.layout.width);
              if (next > 0 && next !== listWidth) setListWidth(next);
            }
          : undefined
      }
    >
      <PhotoCarousel
        listing={listing}
        width={variant === 'carousel' ? GEOMETRY.carousel.width : listWidth}
        height={variant === 'carousel' ? GEOMETRY.carousel.photoHeight : GEOMETRY.list.photoHeight}
        onToggleSave={onToggleSave}
        showGender
        genderMatches={genderMatches}
        swipeable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `${listing.name}, ${listing.locality}` : undefined}
      >
        <Body listing={listing} onToggleSave={onToggleSave} />
      </Pressable>
    </View>
  );

  /*
   * No Pressable around the card any more.
   *
   * It wrapped everything including the photo carousel, and on Android that
   * meant the carousel never scrolled: the Pressable took the touch on the
   * first move and the ScrollView inside it never got it back. The dots
   * animated, the pages existed, and dragging did nothing.
   *
   * The two halves now carry their own press targets — one inside each
   * carousel page, one around the body — which is the arrangement where a
   * drag scrolls and a tap opens. Tapping anywhere on the card still opens
   * the listing, exactly as before.
   */
  return (
    <View style={{ width }}>
      <Animated.View style={[surface, animatedStyle, style]}>{content}</Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Skeleton
 * ------------------------------------------------------------------ */

export function ListingCardSkeleton({ variant = 'carousel' }: { variant?: ListingCardVariant }) {
  const { colors, space, radius } = useTheme();

  const width = variant === 'carousel' ? GEOMETRY.carousel.width : undefined;

  return (
    <View style={{ width, gap: space[3] }}>
      <Skeleton
        width={variant === 'carousel' ? GEOMETRY.carousel.width : '100%'}
        height={variant === 'carousel' ? GEOMETRY.carousel.photoHeight : GEOMETRY.list.photoHeight}
        radius={radius.card}
      />
      <View style={{ gap: space[2] }}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="45%" height={12} />
        {/* The price block is the tallest bar, so the eye is already resting
            where the number is about to appear. */}
        <Skeleton width="40%" height={22} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', minHeight: 26, alignSelf: 'flex-start' },
  absolute: { position: 'absolute' },
  save: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dots: { left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline' },
  saveTap: { alignItems: 'center', justifyContent: 'center' },
});
