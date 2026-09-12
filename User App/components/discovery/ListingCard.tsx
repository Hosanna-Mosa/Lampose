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

import { Icon, Skeleton, Text, type IconName } from '@/components/ui';
import { usePressAnimation } from '@/hooks/usePressAnimation';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { availabilityLabel, isGone, isScarce, type Availability, type Listing } from '@/types/listing';

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

  const displayRating = (listing as { rating?: number }).rating
    ? ((listing as { rating?: number }).rating as number).toFixed(2)
    : '4.92';

  const reviewCount = (listing as { reviewCount?: number }).reviewCount || 124;

  const rentValue = listing.rent ? formatRupees(listing.rent) : '6,500';
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

  // Build amenity chips matching photo (Wi-Fi, Furnished, Meals, 24/7 Security, Laundry)
  const amenityPills: { icon: IconName; label: string }[] = [
    { icon: 'wifi', label: 'Wi-Fi' },
    { icon: 'furnished', label: 'Furnished' },
    { icon: 'mess', label: 'Meals' },
    { icon: 'security', label: '24/7 Security' },
    { icon: 'laundry', label: 'Laundry' },
  ];

  return (
    <View style={styles.bodyContainer}>
      {/* Row 1: Uppercase Title & Rating */}
      <View style={styles.titleRatingRow}>
        <Text variant="title3" numberOfLines={1} style={styles.propertyTitle}>
          {listing.name.toUpperCase()}
        </Text>

        <View style={styles.ratingCol}>
          <View style={styles.ratingStarsRow}>
            <Icon name="star" size={14} color="#F59E0B" fill="#F59E0B" />
            <Text style={[styles.ratingNumber, { color: colors.textPrimary }]}>
              {displayRating}
            </Text>
          </View>
          <Text style={styles.reviewCountText}>({reviewCount} reviews)</Text>
        </View>
      </View>

      {/* Row 2: Locality · City */}
      <View style={styles.locationRow}>
        <Icon name="mapPin" size={14} color="#64748B" />
        <Text style={styles.locationText} numberOfLines={1}>
          {listing.locality} · Hyderabad
        </Text>
      </View>

      {/* Row 3: Amenity Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.amenitiesRail}
      >
        {amenityPills.map((a, i) => (
          <View
            key={i}
            style={[
              styles.amenityChip,
              {
                backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                borderColor: mode === 'dark' ? colors.borderSubtle : '#E2E8F0',
              },
            ]}
          >
            <Icon name={a.icon} size={14} color={mode === 'dark' ? '#94A3B8' : '#334155'} />
            <Text style={[styles.amenityChipText, { color: mode === 'dark' ? '#E2E8F0' : '#334155' }]}>
              {a.label}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Row 4: Price & Limited Beds Urgency Badge (Only shown if genuinely scarce) */}
      <View style={styles.priceUrgencyRow}>
        <View style={styles.priceGroup}>
          <Text style={[styles.priceNumber, { color: mode === 'dark' ? '#34D399' : '#0B473A' }]}>
            ₹ {rentValue}
          </Text>
          <Text style={styles.unitSuffixText}>{unitSuffix}</Text>
        </View>

        {scarceBedCount !== null ? (
          <View style={styles.urgencyBadge}>
            <Icon name="flame" size={14} color="#DC2626" fill="#DC2626" />
            <Text style={styles.urgencyText}>
              {scarceBedCount === 1 ? 'Only 1 bed left' : `Only ${scarceBedCount} beds left`}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Row 5: Bottom Sage Banner & View Details CTA */}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.bottomBanner,
          {
            backgroundColor: mode === 'dark' ? 'rgba(15,76,58,0.2)' : '#E8F5E9',
            borderColor: mode === 'dark' ? 'rgba(52,211,153,0.3)' : '#DCFCE7',
            opacity: pressed ? 0.9 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`View details for ${listing.name}`}
      >
        <View style={styles.bottomBannerLeft}>
          <Icon name="sprout" size={20} color="#16A34A" />
          <View>
            <Text style={[styles.bannerHeadline, { color: mode === 'dark' ? '#6EE7B7' : '#0B473A' }]}>
              Comfortable Stays
            </Text>
            <Text style={[styles.bannerSubhead, { color: mode === 'dark' ? '#A7F3D0' : '#15803D' }]}>
              Happier Days
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.viewDetailsButton,
            { backgroundColor: mode === 'dark' ? '#0F4C3A' : '#0B473A' },
          ]}
        >
          <Text style={styles.viewDetailsText}>View Details</Text>
          <Icon name="arrowRight" size={14} color="#FFFFFF" />
        </View>
      </Pressable>
    </View>
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
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: mode === 'dark' ? 0.35 : 0.08,
          shadowRadius: 10,
          elevation: 3,
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
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onToggleSave={onToggleSave}
      />
      <CardBody listing={listing} onPress={onPress} />
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
    borderRadius: 22,
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
  ratingCol: {
    alignItems: 'flex-end',
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
    marginTop: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  amenitiesRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  amenityChipText: {
    fontSize: 11,
    fontWeight: '600',
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
  urgencyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  bottomBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  bottomBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerHeadline: {
    fontSize: 12,
    fontWeight: '700',
  },
  bannerSubhead: {
    fontSize: 11,
    fontWeight: '500',
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 18,
    gap: 5,
  },
  viewDetailsText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
