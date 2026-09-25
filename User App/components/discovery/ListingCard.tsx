import React, { useMemo, useState } from 'react';
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
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { Icon, Skeleton, Text } from '@/components/ui';
import { usePressAnimation } from '@/hooks/usePressAnimation';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { availabilityLabel, isGone, isScarce, type Availability, type Listing } from '@/types/listing';
import { recordListingClick } from '@/services/api/listings.api';

export type ListingCardVariant = 'carousel' | 'list';

const GEOMETRY = {
  carousel: { width: 280, photoHeight: 210 },
  list: { width: undefined, photoHeight: 230 },
} as const;

export function AvailabilityChip({ availability }: { availability: Availability }) {
  const { colors, space, radius } = useTheme();
  const gone = isGone(availability);
  const scarce = isScarce(availability);
  const label = availabilityLabel(availability);

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

const PLACEHOLDERS = [
  ['#8C8578', '#4A463E'],
  ['#83897A', '#454940'],
  ['#8E8177', '#4C443D'],
  ['#7E8781', '#424744'],
  ['#8F8779', '#4D473D'],
] as const;

function FloatingHeartButton({
  saved,
  onPress,
  listingName,
}: {
  saved: boolean;
  onPress: () => void;
  listingName: string;
}) {
  const scale = useSharedValue(1);

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    scale.value = withSequence(
      withSpring(1.38, { damping: 9, stiffness: 350 }),
      withSpring(1.0, { damping: 12, stiffness: 220 })
    );
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={saved ? `Remove ${listingName} from saved` : `Save ${listingName}`}
        style={({ pressed }) => [
          styles.heartCircle,
          { opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <Icon
          name="heart"
          size={18}
          color={saved ? '#FF385C' : '#FFFFFF'}
          fill={saved ? '#FF385C' : 'transparent'}
        />
      </Pressable>
    </Animated.View>
  );
}

function PhotoCarousel({
  listing,
  width,
  height,
  swipeable,
  onPress,
  onPressIn,
  onPressOut,
  onToggleSave,
}: {
  listing: Listing;
  width: number;
  height: number;
  swipeable: boolean;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  onToggleSave?: () => void;
}) {
  const [index, setIndex] = useState(0);

  const photos = listing.photoUris?.length
    ? listing.photoUris
    : listing.photoUri
      ? [listing.photoUri]
      : [];

  const pages = Math.max(1, Math.min(photos.length || listing.photoCount || 5, 5));

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const genderLetter =
    listing.gender === 'GIRLS'
      ? 'G'
      : listing.gender === 'COED'
        ? 'BG'
        : 'B';

  const genderWord =
    listing.gender === 'GIRLS'
      ? 'Girls'
      : listing.gender === 'COED'
        ? 'Co-ed'
        : 'Boys';

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

    return (
      <View key={pageIndex} style={{ width, height, backgroundColor: from }}>
        {onPress ? (
          <Pressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={`Photo ${pageIndex + 1} of ${pages}. Opens ${listing.name}.`}
          >
            {photo}
          </Pressable>
        ) : photo}
      </View>
    );
  };

  return (
    <View style={{ width, height, overflow: 'hidden', position: 'relative' }}>
      {swipeable && pages > 1 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          directionalLockEnabled
        >
          {Array.from({ length: pages }, (_, pageIndex) => page(pageIndex))}
        </ScrollView>
      ) : (
        page(0)
      )}

      {/* Bottom scrim — the gender/count/dots badges below each sit on their
          own opaque pill, but a pill only covers its own rectangle. A bright
          photo (pale marble, white walls) still shows through the gap AROUND
          it, and centred between two badges that gap reads as a stray block
          of blank space rather than part of the photo. A soft gradient across
          the whole bottom strip removes that gap by darkening the base of
          every photo a little, regardless of what's in it. */}
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.38)']}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* Floating Top Right: Heart Save Button */}
      {onToggleSave ? (
        <View style={styles.topRightContainer}>
          <FloatingHeartButton
            saved={Boolean(listing.saved)}
            onPress={onToggleSave}
            listingName={listing.name}
          />
        </View>
      ) : null}

      {/* Floating Bottom Left: Gender Badge */}
      <View style={styles.bottomLeftContainer} pointerEvents="none">
        <View style={styles.genderPill}>
          <View style={styles.genderMonogramBox}>
            <Text style={styles.genderMonogramLetter}>{genderLetter}</Text>
          </View>
          <Text style={styles.genderLabelText}>{genderWord}</Text>
        </View>
      </View>

      {/* Floating Bottom Right: Image Counter Badge */}
      <View style={styles.bottomRightContainer} pointerEvents="none">
        <View style={styles.photoCountPill}>
          <Text style={styles.photoCountText}>{`${index + 1} / ${pages}`}</Text>
        </View>
      </View>

      {/* Floating Bottom Center: Carousel Page Dots — the "1 / 5" badge states
          the count, but a corner label is easy to miss as a cue to swipe.
          Dots read at a glance as "this scrolls", the way they do everywhere
          else a photo carousel appears in this app. Only shown once there is
          more than one page to move between. */}
      {swipeable && pages > 1 ? (
        <View style={styles.dotsContainer} pointerEvents="none">
          <View style={styles.dotsPill}>
            {Array.from({ length: pages }, (_, dot) => (
              <View
                key={dot}
                style={[
                  styles.dot,
                  {
                    width: dot === index ? 14 : 5,
                    opacity: dot === index ? 1 : 0.5,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CardBody({
  listing,
  onPress,
}: {
  listing: Listing;
  onPress?: () => void;
}) {
  const { colors, mode } = useTheme();

  /*
   * Real reviews only — server-aggregated in `getListings`, from actual
   * guest reviews (`partner_reviews`). This used to be a hardcoded "4.92"
   * and "124 reviews" on every card regardless of whether anyone had ever
   * reviewed the place; almost nothing in the catalogue has a review yet,
   * so the honest state for most cards today is no badge at all, not an
   * invented number — same rule the listing detail page's reviews section
   * already follows.
   */
  const hasRating = typeof listing.averageRating === 'number' && (listing.reviewCount ?? 0) > 0;

  const rentValue = formatRupees(listing.rent || 6500);
  const unitSuffix = listing.perBed ? '/bed/month' : listing.perNight ? '/night' : '/bed/month';

  // Real data-driven scarcity: only show urgency if real inventory records <= 3 beds
  const scarceBedCount = useMemo(() => {
    if (listing.availability.kind === 'BEDS' || listing.availability.kind === 'TONIGHT') {
      if (listing.availability.count > 0 && listing.availability.count <= 3) {
        return listing.availability.count;
      }
    }
    const optionsWithBeds = listing.sharingOptions?.filter(
      (opt) => typeof opt.availableBeds === 'number',
    );
    if (optionsWithBeds && optionsWithBeds.length > 0) {
      const total = optionsWithBeds.reduce((sum, opt) => sum + (opt.availableBeds ?? 0), 0);
      if (total > 0 && total <= 3) {
        return total;
      }
    }
    return null;
  }, [listing.availability, listing.sharingOptions]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bodyContainer, { opacity: pressed ? 0.94 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`View details for ${listing.name}`}
    >
      {/* Row 1: Uppercase Title & Rating (only when the place has a real one) */}
      <View style={styles.titleRatingRow}>
        <Text variant="title3" numberOfLines={1} style={styles.propertyTitle}>
          {listing.name.toUpperCase()}
        </Text>

        {hasRating ? (
          <View style={styles.ratingStarsRow}>
            <Icon name="star" size={14} color="#F59E0B" fill="#F59E0B" />
            <Text style={[styles.ratingNumber, { color: colors.textPrimary }]}>
              {(listing.averageRating as number).toFixed(1)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Row 2: Locality · City  ·  Reviews (same line) */}
      <View style={styles.locationRow}>
        <View style={styles.locationLeft}>
          <Icon name="mapPin" size={14} color="#64748B" />
          <Text style={styles.locationText} numberOfLines={1}>
            {listing.locality} · Hyderabad
          </Text>
        </View>
        {hasRating ? (
          <Text style={styles.reviewCountText}>
            ({listing.reviewCount} {listing.reviewCount === 1 ? 'review' : 'reviews'})
          </Text>
        ) : null}
      </View>

      {/* Row 3: Price & Limited Beds Urgency Badge (Only shown if genuinely scarce) */}
      <View style={styles.priceUrgencyRow}>
        <View style={styles.priceGroup}>
          <Text style={[styles.priceNumber, { color: mode === 'dark' ? '#34D399' : '#0B473A' }]}>
            {rentValue}
          </Text>
          <Text style={styles.unitSuffixText}>{unitSuffix}</Text>
        </View>

        {/*
          No beds free: the card stays in the feed and SAYS so, rather than
          vanishing. A student who saw this place yesterday and cannot find it
          today assumes the app lost it; "Unavailable" tells them it is full
          and that it may open again (an owner can free a bed at any time).
        */}
        {isGone(listing.availability) ? (
          <View
            style={[styles.unavailableBadge, { backgroundColor: colors.warning.tint, borderColor: colors.warning.border }]}
            accessibilityLabel="Unavailable, no beds free right now"
          >
            <Icon name="alert" size={14} color={colors.warning.ink} />
            <Text style={[styles.urgencyText, { color: colors.warning.ink }]}>
              Unavailable · No beds free
            </Text>
          </View>
        ) : scarceBedCount !== null ? (
          <View style={styles.urgencyBadge}>
            <Icon name="flame" size={14} color="#DC2626" fill="#DC2626" />
            <Text style={styles.urgencyText}>
              {scarceBedCount === 1 ? 'Only 1 bed left' : `Only ${scarceBedCount} beds left`}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export type ListingCardProps = {
  listing: Listing;
  variant?: ListingCardVariant;
  onPress?: () => void;
  onToggleSave?: () => void;
  genderMatches?: boolean;
  style?: ViewStyle;
  index?: number;
};

export function ListingCard({
  listing,
  variant = 'carousel',
  onPress,
  onToggleSave,
  style,
  index = 0,
}: ListingCardProps) {
  const { colors, mode } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation('card');
  /* Every tap that opens a listing is counted for the owner and the console
     (see `recordListingClick`). Done here, once, so every screen that shows a
     property card counts the same way. */
  const handlePress = onPress
    ? () => {
        recordListingClick(listing.id);
        onPress();
      }
    : undefined;
  const gone = isGone(listing.availability);

  const [listWidth, setListWidth] = useState(358);
  const width = variant === 'carousel' ? GEOMETRY.carousel.width : undefined;

  const content = (
    <View
      style={[
        styles.cardOuter,
        {
          backgroundColor: colors.surface,
          borderColor: mode === 'dark' ? colors.borderSubtle : '#E2E8F0',
          shadowColor: '#000000',
          /* Lighter than before — the card's own border already does most of
             the work of separating it from the page; the shadow only needs
             to lift it slightly, not float it. */
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: mode === 'dark' ? 0.18 : 0.05,
          shadowRadius: 5,
          elevation: 1,
        },
      ]}
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
        swipeable
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onToggleSave={onToggleSave}
      />
      <CardBody listing={listing} onPress={handlePress} />
    </View>
  );

  return (
    <Animated.View
      entering={
        variant === 'list'
          ? FadeInDown.delay(Math.min(index, 6) * 45).duration(260).springify()
          : undefined
      }
      style={{ width }}
    >
      <Animated.View
        style={[
          { opacity: gone ? 0.62 : 1 },
          animatedStyle,
          style,
        ]}
      >
        {content}
      </Animated.View>
    </Animated.View>
  );
}

export function ListingCardSkeleton({ variant = 'carousel' }: { variant?: ListingCardVariant }) {
  const { space, radius } = useTheme();
  const width = variant === 'carousel' ? GEOMETRY.carousel.width : undefined;

  return (
    <View
      style={[
        styles.cardOuter,
        {
          width,
          paddingBottom: space[3],
          borderColor: '#E2E8F0',
          backgroundColor: '#FFFFFF',
        },
      ]}
    >
      <Skeleton
        width={variant === 'carousel' ? GEOMETRY.carousel.width : '100%'}
        height={variant === 'carousel' ? GEOMETRY.carousel.photoHeight : GEOMETRY.list.photoHeight}
        radius={0}
      />
      <View style={{ padding: 14, gap: 10 }}>
        <Skeleton width="60%" height={18} />
        <Skeleton width="40%" height={12} />
        <Skeleton width="85%" height={26} />
        <Skeleton width="45%" height={22} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 26,
    alignSelf: 'flex-start',
  },
  topLeftContainer: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  topRightContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  bottomLeftContainer: {
    position: 'absolute',
    bottom: 12,
    left: 12,
  },
  bottomRightContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
  },
  dotsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  /* Same dark translucent pill the gender/photo-count badges use — plain
     white dots with only a drop shadow washed out to an illegible smear on
     light photos (e.g. pale flooring). A solid backing keeps them readable
     against any photo.
     Matches those badges' 0.68 opacity, not a lighter one: on a bright photo
     (pale marble, white walls) anything weaker barely tints the pixels
     underneath and reads as a washed-out grey smudge — the same "extra white
     space" complaint the shadow-only version drew, just fainter. */
  dotsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  dot: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  heartCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 6,
    gap: 5,
  },
  genderMonogramBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderMonogramLetter: {
    fontSize: 10,
    fontWeight: '800',
    color: '#111827',
  },
  genderLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  photoCountPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  photoCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bodyContainer: {
    padding: 14,
    gap: 9,
  },
  titleRatingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  propertyTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  ratingStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingNumber: {
    fontSize: 14,
    fontWeight: '800',
  },
  reviewCountText: {
    fontSize: 10,
    color: '#64748B',
    flexShrink: 0,
    marginLeft: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  locationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  locationText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  priceUrgencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  priceGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  priceNumber: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  unitSuffixText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  urgencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  unavailableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  urgencyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
});
