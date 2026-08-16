import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { StayCategory } from '@/constants/tokens';
import type { Listing } from '@/types/listing';
import { ListingCard, ListingCardSkeleton } from './ListingCard';
import { CATEGORY_BLURB, CATEGORY_LABEL } from './CategoryTabs';

/**
 * One row per category.
 *
 * The four categories are the organising axis of the feed: a student looking
 * for a dormitory and a student looking for a 1BHK are not browsing the same
 * market, and a single mixed list makes both of them scroll past most of it.
 *
 * The card is 280 pt and the gutter is 16, so the next card's edge is always
 * visible — which is what tells a user the row scrolls without an affordance
 * having to say so.
 */

/** Card width plus the gap, so paging lands one card at a time. */
const SNAP = 280 + 12;

export type CategoryCarouselProps = {
  category: StayCategory;
  listings: readonly Listing[];
  loading?: boolean;
  onPressListing: (listing: Listing) => void;
  onToggleSave: (listing: Listing) => void;
  onSeeAll: () => void;
  /** Marks listings that fall outside the gender filter in force. */
  genderMatches?: (listing: Listing) => boolean;
};

export function CategoryCarousel({
  category,
  listings,
  loading = false,
  onPressListing,
  onToggleSave,
  onSeeAll,
  genderMatches,
}: CategoryCarouselProps) {
  const { colors, space, layout, touch } = useTheme();
  const set = colors.category[category];

  // An empty row is not rendered at all. A heading over nothing reads as a
  // failure; a category this city has none of is simply not a row.
  if (!loading && listings.length === 0) return null;

  return (
    <View style={{ gap: space[3] }}>
      <View style={[styles.head, { paddingHorizontal: layout.gutter, gap: space[3] }]}>
        <View style={styles.flex}>
          <View style={[styles.titleRow, { gap: space[2] }]}>
            <View style={[styles.mark, { backgroundColor: set.mark }]} />
            <Text variant="title2">{CATEGORY_LABEL[category]}</Text>
          </View>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {CATEGORY_BLURB[category]}
          </Text>
        </View>

        <Pressable
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`See all ${CATEGORY_LABEL[category]} listings`}
          hitSlop={8}
          style={{ minHeight: touch.min, justifyContent: 'center' }}
        >
          <View style={[styles.titleRow, { gap: 2 }]}>
            <Text variant="bodyStrong" color="brand">
              See all
            </Text>
            <Icon name="chevronRight" size={16} color={colors.brandInk} />
          </View>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: space[3] }}
      >
        {loading
          ? [0, 1, 2].map((key) => <ListingCardSkeleton key={key} variant="carousel" />)
          : listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                variant="carousel"
                onPress={() => onPressListing(listing)}
                onToggleSave={() => onToggleSave(listing)}
                genderMatches={genderMatches ? genderMatches(listing) : true}
              />
            ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  mark: { width: 8, height: 8, borderRadius: 999 },
});
