import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Icon, OfflineBanner, Radio, SearchField, Snackbar, Text } from '@/components/ui';
import { ExploreHeader, StateTemplate, TabBar, type TabItem } from '@/components/shell';
import {
  CategoryTabs,
  CATEGORY_LABEL,
  FilterChipRow,
  FilterSheet,
  type FilterChip,
  ListingCard,
  ListingCardSkeleton,
  SavedRow,
  type SavedEntry,
} from '@/components/discovery';
import { BookingRow, BookingSegments, ProfileGroup, ProfileRow } from '@/components/lifecycle';
import { FoodComingSoon, FoodModule } from '@/components/food';
import { FOOD_MODE } from '@/constants/food';
import { emptyStates } from '@/constants/copy';
import { useAppState } from '@/context/AppStateContext';
import { useAuth } from '@/context/AuthContext';
import { useFood, type FoodTab } from '@/context/FoodContext';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';
import { allBookings, segmentOf, type BookingSegment } from '@/data/bookings';
import { useListingMeta, useListings, useMyCoupon, useNotifications, useSaved } from '@/services';
import { BACKEND_CATEGORIES } from '@/services/adapters/listing.adapter';
import { genderMeta, isGone } from '@/types/listing';
import { activeFilterCount, applyQuery, EMPTY_QUERY, type SearchQuery } from '@/types/filters';
import { ownerWindowLabel } from '@/types/request';

/**
 * Home — four carousels, one per category.
 *
 * The feed is organised by what kind of place you are looking for, because a
 * student who wants a dormitory bed for three nights and one who wants a 1BHK
 * are not shopping the same market.
 *
 * Filled listings never reach it. The card is sparse, so a filled place would
 * look identical to an open one — worse than not showing it. The saved list
 * keeps them visible with the price struck, because there it is information.
 */

/**
 * What the Appearance row says without being opened.
 *
 * "Phone setting" alone is not enough — a student who set it to follow the
 * phone and then wonders why the app is dark needs to be told which way that
 * resolved, and this row is the only place that can tell them.
 */
const APPEARANCE_VALUE: Record<ThemePreference, (mode: 'light' | 'dark') => string> = {
  light: () => 'Light',
  dark: () => 'Dark',
  system: (mode) => `Phone setting · ${mode === 'dark' ? 'Dark' : 'Light'}`,
};

const APPEARANCE_OPTIONS: readonly { id: ThemePreference; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Use my phone setting' },
];

/**
 * The Food pivot: Profile leaves the bar and Food takes its slot, raised and
 * in the red set so it reads as a door to another module rather than a fourth
 * peer screen. Profile is now the person icon in the header — the same
 * demotion Alerts went through when Saved was promoted here.
 */
const TABS: readonly TabItem[] = [
  { id: 'explore', label: 'Home', icon: 'home' },
  { id: 'saved', label: 'Saved', icon: 'bookmark' },
  { id: 'bookings', label: 'Bookings', icon: 'calendar' },
  { id: 'food', label: 'Food', icon: 'food', raised: true, tone: 'danger' },
];

/**
 * And what the bar becomes once Food is open.
 *
 * Stepping into the module takes the stay tabs with it — Home, Saved and
 * Bookings are the app you left, not three places to keep flicking between
 * while you read a mess menu. In their place the SAME bar, in the same
 * position, carries the module's own three screens, and the fourth slot keeps
 * the raised disc: the button you pressed to get in is the button you press to
 * get out, wearing the stay side's brand instead of the module's red.
 *
 * The disc takes a map pin rather than Explore's magnifier, because Food has a
 * Search of its own two slots to the left and one bar cannot carry two
 * magnifying glasses meaning different things.
 *
 * `food:` ids are namespaced so `changeTab` can tell a module screen from a
 * stay tab without knowing what the module's screens are called.
 */
const FOOD_EXIT: TabItem = {
  id: 'explore',
  label: 'Explore',
  icon: 'search',
  raised: true,
  tone: 'brand',
};

const FOOD_TAB_IDS = { home: 'food:home', search: 'food:search', orders: 'food:orders' } as const;


export default function Home() {
  const { colors, space, layout, mode, radius, preference, setPreference } = useTheme();
  const router = useRouter();
  const { user, status, signOut } = useAuth();
  const { coupon } = useMyCoupon(status === 'signedIn');
  const { locality, category, setCategory } = useAppState();
  /* How much of the bottom edge the tab bar is occupying, measured by the bar
     itself. The snackbar has to clear it. */
  const { reservedBottom } = usePendingRequest();
  /* The bottom bar belongs to this screen, so while Food is open this screen is
     the one that has to know which of the module's screens is showing. */
  const { foodTab, setFoodTab, liveOrder } = useFood();

  const [tab, setTab] = useState('explore');
  const [undo, setUndo] = useState<SavedEntry | null>(null);
  /**
   * Whether the feed has been widened from the chosen area to its whole city.
   *
   * Off by default, because the entry screen asked "where are you looking?"
   * and the answer was an area — showing a city would be answering a
   * different question and would make the count on that screen wrong.
   *
   * But an area with two places in it is a thin feed, and a student who has
   * just picked one should not have to go back and re-choose to find out what
   * else is nearby. So widening is one tap, and the row above the results
   * always says which of the two is currently on screen.
   */
  const [wholeCity, setWholeCity] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [query, setQuery] = useState<SearchQuery>(EMPTY_QUERY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [segment, setSegment] = useState<BookingSegment>('active');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  /* The shortlist lives on the account now, so it survives a reinstall and
     follows the student to a second phone. Each row also carries the rent it
     was saved at, which is what the "cheaper since you saved it" line needs. */
  const {
    saved,
    isSaved,
    toggleSaved,
    isPending: savedPending,
    error: savedError,
    refetch: refetchSaved,
    isFetching: savedFetching,
  } = useSaved();

  /**
   * The feed, from the database.
   *
   * The category and the city go over the wire, because the collection has a
   * column for each — a phone downloads the rows for one tab in one city
   * rather than everything Lampose has ever onboarded. The rest of the query
   * is applied below, on what came back; see `listings.api.ts` for why gender
   * and amenities cannot be sent.
   */
  const {
    listings,
    isPending: feedLoading,
    error: feedError,
    refetch: refetchFeed,
    isFetching: feedFetching,
  } = useListings({
    category,
    city: locality?.city ?? null,
    locality: debouncedSearch ? null : (wholeCity ? null : locality?.name ?? null),
    search: debouncedSearch || null,
    enabled: Boolean(category),
  });

  /* The category counts, so the "nothing in this category" state can say how
     much is in the other three. Without it that screen either states a made-up
     figure or offers no reason to look elsewhere. */
  const { meta } = useListingMeta();

  /*
   * The same feed one step wider, so the "see the whole city" offer can carry
   * a real number instead of an invitation to find out.
   *
   * Fetched while the narrow feed is showing, which means tapping the offer
   * paints from cache rather than spinning — and it is the identical query
   * key the widened feed will use, so it is one request, not two.
   */
  const { listings: cityListings } = useListings({
    category,
    city: locality?.city ?? null,
    enabled: Boolean(category) && Boolean(locality) && !wholeCity,
  });

  /* A new area starts narrow again. Carrying city-wide across a change of
     area would silently ignore the choice just made on the entry screen. */
  useEffect(() => {
    setWholeCity(false);
  }, [locality?.id]);

  /* The same query the alerts screen reads, so the badge and the screen are
     one fetch and cannot disagree about the count. */
  const { unread } = useNotifications();

  const filterCount = activeFilterCount(query);

  /**
   * The filters the server could not apply, applied here.
   *
   * The category and rent ceiling have already narrowed this server-side, so
   * running them again is a no-op — but `applyQuery` also sorts, and gender,
   * sharing and amenities have nowhere else to be applied.
   */
  const shown = useMemo(
    () => applyQuery(listings.filter((listing) => !isGone(listing.availability)), query),
    [listings, query],
  );

  const total = shown.length;

  /** What the feed is currently scoped to, for every sentence that names it. */
  const scopeLabel = wholeCity
    ? locality?.city ?? 'your city'
    : locality?.name ?? locality?.city ?? 'your area';

  /**
   * How many the same filters would return across the whole city.
   *
   * Run through `applyQuery` exactly as the narrow feed is, so the two
   * numbers are comparable — offering "12 in Bangalore" that becomes 3 the
   * moment the gender filter is reapplied would be a worse lie than not
   * offering it.
   */
  const cityTotal = useMemo(
    () => applyQuery(cityListings.filter((listing) => !isGone(listing.availability)), query).length,
    [cityListings, query],
  );

  /* Only worth offering when it would actually show more. */
  const canWiden = Boolean(locality) && !wholeCity && cityTotal > total;

  /**
   * How much is in the other three categories.
   *
   * From the facets endpoint rather than from the feed: the feed holds one
   * category by the time it reaches this screen, so it cannot answer a
   * question about the others.
   */
  const otherCategoryCount = useMemo(() => {
    if (!meta || !category) return 0;
    const mine = new Set<string>(BACKEND_CATEGORIES[category]);

    /*
     * Counted in the place the feed is actually showing, not across the whole
     * catalogue.
     *
     * The empty state reads "There are N other places here of a different
     * kind — switch at the top of the screen to see them." `here` is the
     * word doing the work: counting catalogue-wide offered four other places
     * in an area that holds one, and the tab switch would then show nothing.
     */
    const counts = meta.categoriesIn(
      wholeCity ? locality?.city ?? '' : `${locality?.city ?? ''}::${locality?.name ?? ''}`,
    );

    return Object.entries(counts)
      .filter(([name]) => !mine.has(name))
      .reduce((sum, count) => sum + count[1], 0);
  }, [meta, category, locality?.name, locality?.city, wholeCity]);

  /* A failure with nothing behind it is offline; a failure the server
     authored is not, and the banner must not blame a student's connection
     for a disconnected database. */
  const offline = Boolean(feedError?.isNetwork);

  /**
   * What the over-filtered empty state is allowed to promise.
   *
   * Every number here is counted from the response, never estimated. The copy
   * says "4 places here fit if you raise your ceiling to ₹12,000" and offers a
   * button that does exactly that — so if the count were a guess, the student
   * would tap it and land on a different number, which is the specific way an
   * empty state loses somebody for good.
   *
   * `suggestedCeiling` is the cheapest rent ABOVE the current ceiling, so the
   * button always brings back at least one place and never more than it must.
   */
  const relaxed = useMemo(() => {
    if (query.rentCeiling === null) return null;
    const withoutCeiling = applyQuery(
      listings.filter((listing) => !isGone(listing.availability)),
      { ...query, rentCeiling: null },
    );
    const above = withoutCeiling
      .map((listing) => listing.rent)
      .filter((rent): rent is number => rent !== null && rent > query.rentCeiling!)
      .sort((a, b) => a - b);

    if (!above.length) return null;
    const ceiling = above[0];
    return {
      ceiling,
      count: withoutCeiling.filter(
        (listing) => listing.rent !== null && listing.rent <= ceiling,
      ).length,
    };
  }, [listings, query]);

  /**
   * Another area in the same city that has something.
   *
   * Named from the facets endpoint, so it is a real place with a real count
   * rather than a locality picked to make the sentence read well.
   */
  const nearby = useMemo(() => {
    if (!meta || !locality) return null;
    return (
      meta.localities.find(
        (row) => row.city === locality.city && row.name !== locality.name && row.listingCount > 0,
      ) ?? null
    );
  }, [meta, locality]);

  /**
   * Gender, rent and sharing, beside Filters.
   *
   * These three move a result set most, which is why they get a shortcut and
   * "must have wifi" does not.
   *
   * Each chip is DERIVED from the live query rather than holding its own state,
   * so a change made in the sheet and a change made here are the same value and
   * the two can never disagree.
   *
   * An unset chip names its dimension ("Price"); a set one shows the value
   * ("Up to ₹10,000"). The row therefore states what is currently on, instead
   * of making the student open the sheet to find out.
   */
  const quickChips: readonly FilterChip[] = [
    {
      id: 'gender',
      label: query.gender ? genderMeta[query.gender].label : 'Gender',
      active: query.gender !== null,
      clearable: true,
    },
    {
      id: 'rent',
      label:
        query.rentCeiling !== null ? `Up to ₹${query.rentCeiling.toLocaleString('en-IN')}` : 'Price',
      active: query.rentCeiling !== null,
      clearable: true,
    },
    {
      id: 'sharing',
      label: query.sharing.length
        ? `${query.sharing[0]}${query.sharing.length > 1 ? ` +${query.sharing.length - 1}` : ''}`
        : 'Sharing',
      active: query.sharing.length > 0,
      clearable: true,
    },
  ];

  /**
   * Clearing happens on the chip; choosing opens the sheet.
   *
   * Removing a filter is one unambiguous act, so it belongs on the chip. Adding
   * one is a choice between several values, and the sheet already owns that UI
   * — a second, smaller picker would be a second place for the same rules to
   * drift.
   */
  const clearChip = (id: string) => {
    if (id === 'gender') setQuery({ ...query, gender: null });
    if (id === 'rent') setQuery({ ...query, rentCeiling: null });
    if (id === 'sharing') setQuery({ ...query, sharing: [] });
  };

  /*
   * Removing writes through to the account, and undo puts it back.
   *
   * `toggleSaved` is optimistic, so the row disappears on the tap and the
   * request follows — and undo is a real re-save rather than a local restore,
   * which is why the snackbar holds the id rather than the row: the entry
   * that comes back is the server's, with the rent it records at that moment.
   */
  const removeSaved = (entry: SavedEntry) => {
    toggleSaved(entry.listing.id);
    setUndo(entry);
  };

  /*
   * Only the BUILT module gets a food bar. On a production build the tab opens
   * "coming soon", which has no Home, Search or Orders to navigate to — so the
   * bar collapses to the way out instead of offering three dead destinations.
   */
  const inFoodModule = tab === 'food' && FOOD_MODE === 'dev';

  const FOOD_TABS = useMemo<readonly TabItem[]>(
    () => [
      { id: FOOD_TAB_IDS.home, label: 'Home', icon: 'food' },
      { id: FOOD_TAB_IDS.search, label: 'Search', icon: 'search' },
      // The dot, not a count: there is only ever one order in flight, so a
      // number would always read "1" and say nothing the dot does not.
      { id: FOOD_TAB_IDS.orders, label: 'Orders', icon: 'agreement', dot: liveOrder !== null },
      FOOD_EXIT,
    ],
    [liveOrder],
  );

  // No guard on Profile any more: auth is the first gate, so nothing reaches
  // this screen without an account.
  const changeTab = (next: string) => {
    // A module screen never leaves the Food tab; only the raised disc does.
    if (next.startsWith('food:')) {
      setFoodTab(next.slice('food:'.length) as FoodTab);
      return;
    }
    setTab(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      <ExploreHeader
        locality={locality?.name ?? 'Choose an area'}
        city={locality ? locality.city : undefined}
        onPressLocality={() => router.push('/(entry)/locality')}
        // Alerts is not a tab — the pivot promoted Saved into the tab bar. The
        // bell keeps it one tap from the feed, and it is also a Profile row.
        onPressAlerts={() => router.push('/notifications')}
        alertCount={unread}
        // Profile lost its tab to Food; the header is now its one door.
        onPressProfile={() => setTab('profile')}
      />

      {/* Persistent, and it always states the age of what is on screen — a
          stale rent is the dangerous case. The age is only claimed while the
          cache is what is being shown; a feed that has just refetched has no
          age worth stating. */}
      <OfflineBanner offline={offline} ageLabel={listings.length ? 'last loaded copy' : undefined} />

      {tab === 'explore' ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: space[2], paddingBottom: space[8], gap: space[4] }}
          showsVerticalScrollIndicator={false}
        >
          {/* Controls section — grouped tightly for a clean header layout */}
          <View style={{ gap: space[2] }}>
            {category ? (
              <CategoryTabs
                value={category}
                onChange={(next) => {
                  setCategory(next);
                  setQuery(EMPTY_QUERY);
                }}
              />
            ) : null}

            <View style={{ paddingHorizontal: layout.gutter }}>
              <SearchField
                value={searchTerm}
                onChangeText={setSearchTerm}
                onClear={() => setSearchTerm('')}
                placeholder={total ? `Search ${total} ${total === 1 ? 'place' : 'places'} by name or area…` : 'Search places by name or area…'}
              />
            </View>

            <FilterChipRow
              chips={quickChips}
              activeCount={filterCount}
              onPressFilters={() => setFiltersOpen(true)}
              onPressChip={() => setFiltersOpen(true)}
              onClearChip={clearChip}
            />
          </View>

          {feedLoading ? (
            <View style={{ paddingHorizontal: layout.gutter, gap: space[4] }}>
              {[0, 1, 2].map((key) => (
                <ListingCardSkeleton key={key} variant="list" />
              ))}
            </View>
          ) : feedError ? (
            /*
             * A failed fetch is not an empty area.
             *
             * The empty states below name a locality and a rent ceiling and
             * invite the student to widen them — advice that is actively
             * wrong when the truth is that nothing was ever received. This
             * says what happened and offers the only useful action, which is
             * to ask again.
             */
            <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
              <Text variant="title2">We could not load places</Text>
              <Text variant="bodyLg" color="secondary">
                {feedError.displayMessage}
              </Text>
              <Button
                label={feedFetching ? 'Trying…' : 'Try again'}
                onPress={() => refetchFeed()}
                disabled={feedFetching}
                fullWidth
              />
            </View>
          ) : total === 0 ? (
            debouncedSearch ? (
              <View style={{ paddingHorizontal: layout.gutter, gap: space[3], paddingVertical: space[4] }}>
                <Text variant="title2">No places found for "{debouncedSearch}"</Text>
                <Text variant="bodyLg" color="secondary">
                  We couldn't find any property matching your search term. Try searching for a different property name, locality or amenity.
                </Text>
                <Button
                  label="Clear search"
                  variant="secondary"
                  onPress={() => setSearchTerm('')}
                  fullWidth
                />
              </View>
            ) : filterCount === 0 ? (
              <StateTemplate
                copy={emptyStates.noneInCategory({
                  categoryPlural: `${CATEGORY_LABEL[category!].toLowerCase()}s`,
                  locality: scopeLabel,
                  otherCategoryCount,
                })}
                onPrimary={() => router.push('/(entry)/locality')}
                onSecondary={() => {}}
              />
            ) : (
            /*
             * Two shapes, because there are two ways to over-filter.
             *
             * The rich copy promises a count and a ceiling, and it can only
             * be shown when both are counted from the response. A ceiling
             * with nothing above it, or a filter that is not the ceiling at
             * all, gets the plain version — a sentence that names what is on
             * and a button that clears it. Filling the rich template with
             * placeholders would have the student tap "Raise ceiling to
             * ₹12,000" and find nothing there.
             */
            relaxed && nearby ? (
              <StateTemplate
                copy={emptyStates.noSearchResults({
                  locality: scopeLabel,
                  rentCeiling: `₹${query.rentCeiling!.toLocaleString('en-IN')}`,
                  fittingCount: relaxed.count,
                  suggestedCeiling: `₹${relaxed.ceiling.toLocaleString('en-IN')}`,
                  nearbyCount: nearby.listingCount,
                  nearbyLocality: nearby.name,
                })}
                onPrimary={() => setQuery({ ...query, rentCeiling: relaxed.ceiling })}
                onSecondary={() => router.push('/(entry)/locality')}
              />
            ) : (
              <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
                <Text variant="title2">Nothing matches all of this</Text>
                <Text variant="bodyLg" color="secondary">
                  {listings.length} {listings.length === 1 ? 'place is' : 'places are'} listed in{' '}
                  {scopeLabel}, and none of them match every
                  filter you have set.
                </Text>
                <Button
                  label="Clear all filters"
                  variant="secondary"
                  onPress={() => setQuery(EMPTY_QUERY)}
                  fullWidth
                />
                <Button
                  label="Search another area"
                  variant="ghost"
                  onPress={() => router.push('/(entry)/locality')}
                  fullWidth
                />
              </View>
            )
            )
          ) : (
            <View style={{ paddingHorizontal: layout.gutter, gap: space[4] }}>
              {/* The count names the category AND the place it counted in, so
                  the feed says out loud what it is filtered to. A silent
                  filter is why people conclude an app "has nothing" — and
                  naming the wrong place is why a count looks broken. */}
              <Text variant="caption" color="secondary">
                {total} {CATEGORY_LABEL[category!].toLowerCase()}
                {total === 1 ? '' : 's'} in {scopeLabel}
              </Text>

              {/*
                One tap wider, with the real figure on it.

                An area holding two places is a thin feed, and the answer is
                not to quietly show the whole city — that is what made the
                area counts look wrong. It is to show the area, say so, and
                offer the city as a choice somebody makes.
              */}
              {/* `xs`, because this is an offer sitting between a count and a
                  feed rather than the thing the screen is asking for. Both
                  states take the same size — they are one control, and a
                  button that changed height when you tapped it would read as
                  the layout jumping. */}
              {canWiden ? (
                <Button
                  label={`See all ${cityTotal} in ${locality?.city}`}
                  variant="secondary"
                  size="xs"
                  onPress={() => setWholeCity(true)}
                />
              ) : wholeCity && locality ? (
                <Button
                  label={`Back to ${locality.name} only`}
                  variant="ghost"
                  size="xs"
                  onPress={() => setWholeCity(false)}
                />
              ) : null}
              {shown.map((listing) => (
                <ListingCard
                  key={listing.id}
                  /* `saved` drives the filled bookmark, and it comes from the
                     shortlist query rather than the feed — the listings
                     endpoint is public and has no idea who is asking. The
                     bookmark on this card was an empty handler until now. */
                  listing={{ ...listing, saved: isSaved(listing.id) }}
                  variant="list"
                  onPress={() => router.push(`/listing/${listing.id}`)}
                  onToggleSave={() => toggleSaved(listing.id)}
                />
              ))}
            </View>
          )}

          {/* The preview switch that used to sit here is gone. It existed to
              reach loading, empty and offline states that "are otherwise
              unreachable without a server" — there is a server now, and all
              three are reached by unplugging the wifi or over-filtering. */}
        </ScrollView>
      ) : tab === 'saved' ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: layout.gutter, gap: space[3] }}
          refreshControl={
            <RefreshControl
              refreshing={savedFetching && !savedPending}
              onRefresh={() => refetchSaved()}
              tintColor={colors.brand}
            />
          }
        >
          {savedPending && saved.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: space[8] }}>
              <ActivityIndicator color={colors.brand} size="large" />
            </View>
          ) : savedError && saved.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: space[4], gap: space[3] }}>
              <Text variant="title2">Could not load saved places</Text>
              <Text variant="body" color="secondary">
                {savedError.displayMessage ?? 'Please check your connection and try again.'}
              </Text>
              <Button label="Try again" onPress={() => refetchSaved()} size="sm" />
            </View>
          ) : saved.length === 0 ? (
            <StateTemplate copy={emptyStates.noSaved()} onPrimary={() => setTab('explore')} />
          ) : (
            <>
              <Text variant="caption" color="secondary">
                Rent and deposit on every row, so you can compare without opening each one.
              </Text>
              {saved.map((entry) => {
                const row: SavedEntry = {
                  listing: entry.listing,
                  rentWhenSaved: entry.rentWhenSaved ?? undefined,
                };
                return (
                  <SavedRow
                    key={entry.listing.id}
                    entry={row}
                    onPress={() => router.push(`/listing/${entry.listing.id}`)}
                    onRemove={() => removeSaved(row)}
                  />
                );
              })}
            </>
          )}
        </ScrollView>
      ) : tab === 'food' ? (
        /* The Food module, behind its environment gate: production gets the
           promise, dev gets the work in progress. The gate lives in
           constants/food.ts and defaults to production — a missing env value
           must never leak the unfinished module. */
        FOOD_MODE === 'dev' ? (
          <FoodModule />
        ) : (
          <FoodComingSoon onExplore={() => setTab('explore')} />
        )
      ) : tab === 'profile' ? (
        /* Screen 64. Every row carries its current value, so most visits here
           end without a tap. */
        <ScrollView
          contentContainerStyle={{ padding: layout.gutter, gap: space[5], paddingBottom: space[8] }}
        >
          <View style={[styles.identity, { gap: space[3] }]}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: colors.surfaceSunken, borderRadius: radius.pill },
              ]}
            >
              <Text variant="title1" color="secondary">
                {(user?.name || 'A').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title2">{user?.name || 'Your profile'}</Text>
              <Text variant="numMeta" color="secondary">
                {user?.phone}
              </Text>
            </View>
            <Button label="Edit" size="sm" variant="secondary" onPress={() => router.push('/profile/edit')} />
          </View>

          {/* Only shown once a referral has actually earned one — most
              customers signed up with no code and have nothing here. Not
              gated behind FOOD_MODE: the reward exists whether or not the
              food module itself is finished. */}
          {coupon && coupon.status === 'active' ? (
            <View
              style={[
                styles.couponCard,
                { backgroundColor: colors.surfaceSunken, borderRadius: radius.card },
              ]}
            >
              <Text variant="title3">🎉 ₹{coupon.amountRupees} off your first food order</Text>
              <Text variant="body" color="secondary">
                From signing up via {coupon.propertyName || 'your referral'}.
              </Text>
            </View>
          ) : null}

          <ProfileGroup title="Your stuff">
            <ProfileRow label="Alerts" value={`${unread} unread`} onPress={() => router.push('/notifications')} />
            <ProfileRow label="Saved places" value={String(saved.length)} onPress={() => setTab('saved')} />
            <ProfileRow label="Past stays" onPress={() => router.push('/bookings/history')} />
            <ProfileRow
              label="Receipts & agreements"
              onPress={() => router.push('/bookings/receipts')}
              last
            />
          </ProfileGroup>

          <ProfileGroup title="App">
            {/* Appearance is a real setting, not a preview toggle. It was only
                reachable from the design-system sheets, which no student will
                ever open — and the preference has always been persisted, so the
                machinery was there and only the door was missing. */}
            <ProfileRow
              label="Appearance"
              value={APPEARANCE_VALUE[preference](mode)}
              onPress={() => setThemeOpen(true)}
            />
            <ProfileRow label="Language" value="English" />
            <ProfileRow label="Notifications" value="All on" />
            <ProfileRow label="Help & support" onPress={() => router.push('/support')} />
            <ProfileRow
              label="Design-system sheets"
              onPress={() => router.push('/preview')}
              last
            />
          </ProfileGroup>

          <View style={{ gap: space[2] }}>
            <ProfileGroup>
              <ProfileRow
                label="Log out"
                onPress={async () => {
                  await signOut();
                  // Back to the router, which sends an account-less session to
                  // auth. Staying on home would leave the student inside a
                  // screen that now requires the account they just discarded.
                  router.replace('/');
                }}
              />
              <ProfileRow label="Delete my account" destructive last />
            </ProfileGroup>
            {/* States exactly what survives, and why. An active booking and its
                agreement cannot vanish because a student taps delete on a bad
                day. */}
            <Text variant="caption" color="tertiary">
              Deleting removes your profile, saved places and search history. Your completed
              bookings and their agreements stay with us for 7 years — we are required to keep them,
              and you may need them. An active booking must end before you can delete.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: layout.gutter, gap: space[3] }}>
          <BookingSegments value={segment} onChange={setSegment} />
          {(() => {
            const shown = allBookings().filter((booking) => segmentOf(booking.status) === segment);
            if (shown.length === 0) {
              return (
                <StateTemplate
                  copy={emptyStates.noBookings({
                    locality: locality?.name ?? locality?.city ?? 'your area',
                    ownerWindowLabel: ownerWindowLabel(),
                  })}
                  onPrimary={() => setTab('explore')}
                />
              );
            }
            return shown.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                onPress={() => router.push(`/bookings/${booking.id}` as never)}
              />
            ));
          })()}

          {/* The past segment is a list of bookings; history is the richer view
              carrying today's price, which is the question a returning student
              actually has. */}
          {segment === 'past' ? (
            <Button
              label="See past stays with today's prices"
              variant="ghost"
              fullWidth
              onPress={() => router.push('/bookings/history')}
            />
          ) : null}
        </ScrollView>
      )}

      {/*
        One bar, two vocabularies. Inside the built module it carries the
        module's screens; on the "coming soon" build there are no screens to
        carry, so it collapses to the way out instead.
      */}
      <TabBar
        tabs={inFoodModule ? FOOD_TABS : TABS}
        activeId={inFoodModule ? FOOD_TAB_IDS[foodTab] : tab}
        onChange={changeTab}
        collapsedTo={tab === 'food' && !inFoodModule ? FOOD_EXIT : null}
        /* Which set is in the bar, so it can animate the handover. Switching
           between the module's own screens keeps the same name and gets no
           transition — only crossing between the stay side and Food does. */
        setId={tab === 'food' ? 'food' : 'stay'}
      />

      {/* Six seconds, because a mis-tap on a bus is the case undo exists for. */}
      <Snackbar
        message="Removed from your shortlist"
        actionLabel="Undo"
        visible={undo !== null}
        onAction={() => {
          /* A real re-save, not a local restore — so it is back on the account
             and back on every device, which is the whole point of undo. */
          if (undo) toggleSaved(undo.listing.id);
          setUndo(null);
        }}
        onDismiss={() => setUndo(null)}
        /*
         * The tab bar's MEASURED height, not a guess at it.
         *
         * This was a hardcoded 72, which is the bar's content height plus a
         * small allowance — correct only on a phone with no gesture bar. The
         * bar is 56pt of content plus `insets.bottom` plus
         * `layout.bottomInsetExtra`, so on any device with gesture navigation
         * it stands 90–100pt tall and the snackbar was rendering behind it,
         * taking the undo action with it.
         *
         * `TabBar` already reports its own laid-out height into this registry
         * for the floating request pill; reading the same number here means
         * the two can never disagree.
         */
        offsetBottom={reservedBottom}
      />

      <Modal visible={filtersOpen} animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <FilterSheet
          query={query}
          inventory={listings}
          onApply={(next) => {
            setQuery(next);
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      </Modal>

      {/*
        Appearance.

        Three choices, not a two-state switch. A switch can only say light or
        dark, which forces a student who wants the app to follow their phone —
        the majority, and the default — to keep flipping it by hand twice a day.

        It applies on tap and persists immediately. There is no Save: a theme is
        judged by looking at it, and a preview you have to commit to is a
        preview nobody trusts.
      */}
      <BottomSheet
        visible={themeOpen}
        onClose={() => setThemeOpen(false)}
        title="Appearance"
      >
        <View style={{ gap: space[2] }}>
          {APPEARANCE_OPTIONS.map((option) => (
            <Radio
              key={option.id}
              label={option.label}
              selected={preference === option.id}
              onSelect={() => setPreference(option.id)}
            />
          ))}
          <Text variant="caption" color="tertiary">
            Text size follows your phone in every mode — the app does not override it.
          </Text>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  couponCard: { padding: 16, gap: 2 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    // The one 2px border in the system — a deliberate one-off, so the search
    // entry reads as a physical object rather than another card.
    borderWidth: 2,
  },
});
