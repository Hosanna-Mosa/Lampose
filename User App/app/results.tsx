import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  CATEGORY_LABEL,
  FilterSheet,
  ListingCard,
  ListingCardSkeleton,
  SortSheet,
} from '@/components/discovery';
import { useAppState } from '@/context/AppStateContext';
import { useTheme } from '@/context/ThemeContext';
import { useListings } from '@/services';
import { isGone } from '@/types/listing';
import type { StayCategory } from '@/constants/tokens';
import {
  activeFilterCount,
  applyQuery,
  EMPTY_QUERY,
  relaxationSuggestions,
  SORT_LABEL,
  type SearchQuery,
} from '@/types/filters';

/**
 * The results list — where "See all" lands.
 *
 * The header, the query summary and the filter/sort row are shared chrome: they
 * hold what was asked for, and they do not move. Only the body under them
 * changes, so the user never loses their place in the query.
 *
 * A no-results screen never dead-ends. The server returns the three
 * single-filter relaxations that bring back the most places, each with its
 * exact count, so the user picks a trade-off they can live with instead of
 * guessing which control emptied the list. Gender is never among them — it is
 * a hard rule, not a knob.
 */
export default function Results() {
  const { colors, space, layout, radius, mode } = useTheme();
  const router = useRouter();
  const { locality } = useAppState();

  const { category } = useLocalSearchParams<{ category?: StayCategory }>();

  const [query, setQuery] = useState<SearchQuery>(() =>
    category ? { ...EMPTY_QUERY, categories: [category] } : EMPTY_QUERY,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  /*
   * The same query the feed runs, and therefore the same cached response.
   *
   * "See all" from home lands here with the category it was showing, and the
   * key matches the one home used — so this screen paints from cache on the
   * first frame rather than re-downloading a list the student was looking at
   * a moment ago.
   *
   * The rent ceiling stays off the wire for the reason home documents: the
   * no-results recovery below counts how many places sit just above it, and
   * cannot do that from a response they were filtered out of.
   */
  const {
    listings,
    isPending: loading,
    error,
    refetch,
    isFetching,
  } = useListings({
    category: category ?? null,
    city: locality?.city ?? null,
    /* The area, matching what home sends — otherwise "See all" would open a
       wider list than the feed it was tapped from, and the count in the
       header would not be the count on the screen behind it. */
    locality: locality?.name ?? null,
  });

  const inventory = useMemo(
    () => listings.filter((listing) => !isGone(listing.availability)),
    [listings],
  );
  const results = useMemo(() => applyQuery(inventory, query), [inventory, query]);
  const suggestions = useMemo(
    () => (results.length === 0 ? relaxationSuggestions(query, inventory) : []),
    [results.length, query, inventory],
  );

  const filterCount = activeFilterCount(query);

  /** The query, in words. Both ceilings always shown — a filter you cannot
      see is a filter you forget you set. */
  const summary = [
    locality?.name ?? locality?.city ?? 'Everywhere',
    ...query.categories.map((c) => CATEGORY_LABEL[c]),
    query.gender === 'BOYS' ? 'Boys' : query.gender === 'GIRLS' ? 'Girls' : query.gender ? 'Co-ed' : null,
    query.rentCeiling !== null ? `≤ ₹${query.rentCeiling.toLocaleString('en-IN')}` : null,
  ].filter(Boolean) as string[];

  const title = category ? CATEGORY_LABEL[category] : 'All places';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title={title}
        subtitle={`${results.length} ${results.length === 1 ? 'place' : 'places'} in ${locality?.name ?? locality?.city ?? 'all areas'}`}
        onBack={() => router.back()}
      />

      {/* Shared chrome — it holds the query, so it never moves. */}
      <View
        style={[
          styles.chrome,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.borderSubtle,
            paddingHorizontal: layout.gutter,
            paddingVertical: space[3],
            gap: space[2],
          },
        ]}
      >
        <View style={[styles.wrap, { gap: space[2] }]}>
          {summary.map((item) => (
            <View
              key={item}
              style={{
                backgroundColor: colors.surfaceSunken,
                borderRadius: radius.chip,
                paddingHorizontal: space[2],
                paddingVertical: 3,
              }}
            >
              <Text variant="numMeta" color="secondary">
                {item}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.row, { gap: space[2] }]}>
          <Pressable
            onPress={() => setFiltersOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
            style={[
              styles.control,
              {
                borderRadius: radius.pill,
                borderColor: filterCount ? colors.brand : colors.border,
                borderWidth: filterCount ? 1.5 : 1,
                paddingHorizontal: space[3],
                gap: space[2],
              },
            ]}
          >
            <Icon name="filters" size={20} color={filterCount ? colors.brandInk : colors.textPrimary} />
            <Text variant="bodyStrong" style={{ color: filterCount ? colors.brandInk : colors.textPrimary }}>
              Filters{filterCount ? ` ${filterCount}` : ''}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSortOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${SORT_LABEL[query.sort]}`}
            style={[
              styles.control,
              { borderRadius: radius.pill, borderColor: colors.border, borderWidth: 1, paddingHorizontal: space[3], gap: space[2] },
            ]}
          >
            <Text variant="bodyStrong">Sort · {SORT_LABEL[query.sort]}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[5], paddingBottom: space[8] }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          [0, 1, 2].map((key) => <ListingCardSkeleton key={key} variant="list" />)
        ) : error ? (
          /* Not an empty result set. The recovery below offers to loosen
             filters, which would be advice about the wrong problem. */
          <View style={{ gap: space[3] }}>
            <Text variant="title1">We could not load places</Text>
            <Text variant="bodyLg" color="secondary">
              {error.displayMessage}
            </Text>
            <Button
              label={isFetching ? 'Trying…' : 'Try again'}
              onPress={() => refetch()}
              disabled={isFetching}
              fullWidth
            />
          </View>
        ) : results.length === 0 ? (
          <View style={{ gap: space[4] }}>
            <View style={{ gap: space[2] }}>
              <Text variant="title1">Nothing matches all of this</Text>
              <Text variant="bodyLg" color="secondary">
                {suggestions.length
                  ? 'Two or three changes each bring places back — pick one and we will re-run the search.'
                  : 'Try a different area, or clear the filters and start again.'}
              </Text>
            </View>

            {/* Each names the exact count it would bring back, so the user
                chooses a trade-off instead of guessing. */}
            {suggestions.map((suggestion, index) => (
              <Pressable
                key={suggestion.label}
                onPress={() => setQuery({ ...query, ...suggestion.patch })}
                accessibilityRole="button"
                accessibilityLabel={`${suggestion.label}. Brings back ${suggestion.count} places.`}
                style={[
                  styles.suggestion,
                  {
                    borderRadius: radius.card,
                    borderWidth: index === 0 ? 1.5 : 1,
                    borderColor: index === 0 ? colors.brand : colors.border,
                    backgroundColor: index === 0 ? colors.brandTint : colors.surface,
                    padding: space[3],
                    gap: space[3],
                  },
                ]}
              >
                <View style={styles.flex}>
                  <Text variant="bodyStrong" color={index === 0 ? 'info' : 'primary'}>
                    {suggestion.label}
                  </Text>
                  <Text variant="numMeta" color="secondary">
                    brings back {suggestion.count} {suggestion.count === 1 ? 'place' : 'places'}
                  </Text>
                </View>
                <Icon name="chevronRight" size={20} color={index === 0 ? colors.brandInk : colors.textSecondary} />
              </Pressable>
            ))}

            <Button label="Clear all filters" variant="ghost" onPress={() => setQuery(EMPTY_QUERY)} fullWidth />
          </View>
        ) : (
          results.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              variant="list"
              onPress={() => router.push(`/listing/${listing.id}`)}
              onToggleSave={() => {}}
            />
          ))
        )}

      </ScrollView>

      <SortSheet
        visible={sortOpen}
        value={query.sort}
        onChange={(sort) => setQuery({ ...query, sort })}
        onClose={() => setSortOpen(false)}
      />

      <Modal visible={filtersOpen} animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <FilterSheet
          query={query}
          inventory={inventory}
          onApply={(next) => {
            setQuery(next);
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  flex: { flex: 1 },
  control: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  suggestion: { flexDirection: 'row', alignItems: 'center' },
});
