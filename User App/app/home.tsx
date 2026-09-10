import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  BottomSheet, Button, OfflineBanner, Radio, SearchField, Snackbar, Text, useAlert,
} from '@/components/ui';
import {
  ExploreHeader, OngoingStrip, StateTemplate, TabBar, type TabItem,
} from '@/components/shell';
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
import { TypographyScope } from '@/context/TypographyContext';
import { foodHref } from '@/components/food/routes';
import { useFoodMode } from '@/hooks/useAppEnv';
import { emptyStates } from '@/constants/copy';
import { useAppState } from '@/context/AppStateContext';
import { useAuth } from '@/context/AuthContext';
import { useFood, type FoodTab } from '@/context/FoodContext';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useOngoing } from '@/hooks/useOngoing';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';
import type { StayCategory } from '@/constants/tokens';
import { fromRealBooking, segmentOf, type BookingSegment } from '@/data/bookings';
import {
  useAddresses, useBookings, useListingMeta, useListings, useMyCoupon, useNotifications, useSaved,
} from '@/services';
import { BACKEND_CATEGORIES } from '@/services/adapters/listing.adapter';
import { isAllLocalities } from '@/types/auth';
import { genderMeta, isGone } from '@/types/listing';
import {
  activeFilterCount, applyQuery, EMPTY_QUERY, filterSpecFor, type SearchQuery,
} from '@/types/filters';
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
 * in the caution set so it reads as a door to another module rather than a
 * fourth peer screen. Profile is now the person icon in the header — the same
 * demotion Alerts went through when Saved was promoted here.
 *
 * The header icons themselves now pivot too, once Food is open: the bell
 * opens `foodHref.notifications` instead of `/notifications`, and the person
 * icon opens `foodHref.profile` instead of the stay Profile tab — see the
 * `ExploreHeader` usage below. Nothing about the icons changes shape; only
 * what they open does, which is the same "same control, different
 * destination" idea `TabBar`'s own doc comment describes for the bottom bar.
 */
const TABS: readonly TabItem[] = [
  { id: 'explore', label: 'Home', icon: 'home' },
  { id: 'saved', label: 'Saved', icon: 'bookmark' },
  { id: 'bookings', label: 'Bookings', icon: 'calendar' },
  { id: 'food', label: 'Food', icon: 'food', raised: true, tone: 'caution' },
];

/**
 * And what the bar becomes once Food is open.
 *
 * Stepping into the module takes the stay tabs with it — Home, Saved and
 * Bookings are the app you left, not three places to keep flicking between
 * while you read a mess menu. In their place the SAME bar, in the same
 * position, carries the module's own three screens, and the fourth slot keeps
 * the raised disc: the button you pressed to get in is the button you press to
 * get out, wearing the stay side's accent instead of the module's orange.
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
  const { confirm } = useAlert();
  const { coupon } = useMyCoupon(status === 'signedIn');
  const { locality, category, setCategory } = useAppState();
  /*
   * "All locations" is an area answer that means "do not scope this".
   *
   * Everything below that would otherwise send a city or a locality over the
   * wire checks this first, and so does everything that puts a place name in
   * a sentence. It is a sentinel `Locality` rather than a null so the entry
   * router does not read it as an unanswered question — see `ALL_LOCALITIES`.
   */
  const everywhere = isAllLocalities(locality);
  const scopedCity = everywhere ? null : locality?.city ?? null;
  /* How much of the bottom edge the tab bar is occupying, measured by the bar
     itself. The snackbar has to clear it. */
  const { reservedBottom } = usePendingRequest();
  /* The bottom bar belongs to this screen, so while Food is open this screen is
     the one that has to know which of the module's screens is showing. */
  const { foodTab, setFoodTab, liveOrder, foodUnread } = useFood();

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
  /*
   * One set of filters PER CATEGORY, not one shared between the four.
   *
   * Switching tabs used to reset the query to `EMPTY_QUERY`, which was the
   * right call while there was only one set of controls: carrying "2-sharing"
   * from PG into Hotels would have filtered a feed by a value that means
   * nothing there.
   *
   * Now that each category asks its own questions — see `filterSpecFor` — the
   * answers belong to the category that asked them. A student comparing PGs
   * under ₹8,000 for girls against co-lives under ₹12,000 sets each once, and
   * flicking between the tabs shows each feed as they left it. Resetting on
   * every tap made the tab row a control that destroyed work.
   *
   * Keyed by category rather than four `useState`s so the chip row, the sheet
   * and the count all read one value and there is no fourth place to forget.
   */
  const [queries, setQueries] = useState<Partial<Record<StayCategory, SearchQuery>>>({});
  const query = (category && queries[category]) || EMPTY_QUERY;
  const setQuery = useCallback(
    (next: SearchQuery) => {
      if (!category) return;
      setQueries((current) => ({ ...current, [category]: next }));
    },
    [category],
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const FOOD_MODE = useFoodMode();
  const [segment, setSegment] = useState<BookingSegment>('active');
  /*
   * `GET /customers/bookings`, mapped through `fromRealBooking` into the
   * shape this tab's cards already know how to draw. Only fetched once the
   * tab is actually on screen, matching how every other section of this
   * component gates its own fetch.
   *
   * It was briefly ungated so the ongoing strip could read it. That was the
   * wrong source — a booking does not exist until an owner accepts, so the
   * whole pending stage was invisible to it — and `useOngoing` reads the
   * REQUESTS instead. The gate is back with the reason for lifting it.
   */
  const bookingsQuery = useBookings(status === 'signedIn' && tab === 'bookings');
  const realBookings = useMemo(
    () => bookingsQuery.bookings.map((b) => fromRealBooking(b)),
    [bookingsQuery.bookings],
  );

  /* The strip's rows, and whether one of them blocks a new booking. One
     definition, shared with the listing screen's guard and matching the
     server's own rule — see `useOngoing`. */
  const { items: ongoing } = useOngoing();

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
    city: scopedCity,
    /* Unscoped on "All locations", the same way a search is: both are the
       student asking to look past the area they picked. */
    locality:
      everywhere || debouncedSearch ? null : (wholeCity ? null : locality?.name ?? null),
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
    city: scopedCity,
    /* Nothing to widen TO when the feed is already everywhere. */
    enabled: Boolean(category) && Boolean(locality) && !everywhere && !wholeCity,
  });

  /* A new area starts narrow again. Carrying city-wide across a change of
     area would silently ignore the choice just made on the entry screen. */
  useEffect(() => {
    setWholeCity(false);
  }, [locality?.id]);

  /* The same query the alerts screen reads, so the badge and the screen are
     one fetch and cannot disagree about the count. */
  const { unread } = useNotifications();

  /* How many addresses are in the book, for the Profile row that states it.
     Gated on the tab being open — the same rule the bookings fetch above
     follows — so a student who never opens Profile never pays for it. */
  const { count: addressCount, isPending: addressesLoading } = useAddresses(
    status === 'signedIn' && tab === 'profile',
  );

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
  const scopeLabel = everywhere
    ? 'every area we cover'
    : wholeCity
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

  /* Only worth offering when it would actually show more — and never when the
     feed is already unscoped, which is as wide as it goes. */
  const canWiden = Boolean(locality) && !everywhere && !wholeCity && cityTotal > total;

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
    const counts = everywhere
      /* No key at all counts the whole catalogue, which is exactly the scope
         the feed is showing. */
      ? meta.categoriesIn('')
      : meta.categoriesIn(
        wholeCity ? locality?.city ?? '' : `${locality?.city ?? ''}::${locality?.name ?? ''}`,
      );

    return Object.entries(counts)
      .filter(([name]) => !mine.has(name))
      .reduce((sum, count) => sum + count[1], 0);
  }, [meta, category, locality?.name, locality?.city, wholeCity, everywhere]);

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
  /* Which questions this category asks, so the row cannot offer a shortcut to
     a control the sheet behind it does not draw. */
  const spec = filterSpecFor(category);

  const quickChips: readonly FilterChip[] = [
    /* Gender only where it is a rule. A "Gender" chip on Hotels opened a sheet
       with no gender control in it. */
    ...(spec.gender
      ? [{
        id: 'gender',
        label: query.gender ? genderMeta[query.gender].label : 'Gender',
        active: query.gender !== null,
        clearable: true,
      }]
      : []),
    {
      id: 'rent',
      label:
        query.rentCeiling !== null ? `Up to ₹${query.rentCeiling.toLocaleString('en-IN')}` : 'Price',
      active: query.rentCeiling !== null,
      clearable: true,
    },
    /* Named by what this category sells — "Sharing" on a PG, "Which unit?" on
       a bachelor room. The heading is trimmed to a chip's worth of it. */
    ...(spec.sharingLabel
      ? [{
        id: 'sharing',
        label: query.sharing.length
          ? `${query.sharing[0]}${query.sharing.length > 1 ? ` +${query.sharing.length - 1}` : ''}`
          : spec.sharingLabel.replace(/\?$/, ''),
        active: query.sharing.length > 0,
        clearable: true,
      }]
      : []),
    /* Furnishing where an empty room is possible; meals where a mess is. Both
       are the deciding question on the categories that have them, which is
       exactly what earns a chip rather than a trip into the sheet. */
    ...(spec.furnishing
      ? [{
        id: 'furnishing',
        label: query.furnishing.length
          ? `${query.furnishing[0]}${query.furnishing.length > 1 ? ` +${query.furnishing.length - 1}` : ''}`
          : 'Furnishing',
        active: query.furnishing.length > 0,
        clearable: true,
      }]
      : []),
    ...(spec.meals
      ? [{
        id: 'meals',
        label: query.meals === null ? 'Meals' : query.meals ? 'With meals' : 'Without meals',
        active: query.meals !== null,
        clearable: true,
      }]
      : []),
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
    if (id === 'furnishing') setQuery({ ...query, furnishing: [] });
    if (id === 'meals') setQuery({ ...query, meals: null });
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
  /* Only Food HOME puts artwork under the header. Search and Orders have an
     ordinary page background, so the bar stays in flow there and this screen
     behaves exactly as it always did. */
  const inFoodHome = inFoodModule && foodTab === 'home';
  /* True while the banner is still behind the bar. `FoodHome` reports it from
     its own scroll offset, because only it knows how tall the artwork is —
     the height comes from the image's ratio and the screen's width. Once the
     feed has scrolled up under the bar, white-on-artwork ink would be white
     on a pale list, so the bar goes back to being an ordinary opaque one. */
  const [bannerUnderHeader, setBannerUnderHeader] = useState(true);
  const headerOverlay = inFoodHome && bannerUnderHeader;

  /* Leaving Food Home resets it, so coming back always starts over artwork
     rather than inheriting whatever the last scroll position implied. */
  useEffect(() => {
    if (!inFoodHome) setBannerUnderHeader(true);
  }, [inFoodHome]);

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

  const header = (
    <ExploreHeader
      locality={locality?.name ?? 'Choose an area'}
      city={locality ? locality.city : undefined}
      onPressLocality={() => router.push('/(entry)/locality')}
      /*
       * Same two icons, repointed while Food is open — the header pivots
       * exactly the way the bottom bar already does, just without a swap
       * animation of its own: nothing here is a set of tabs to cross-fade,
       * only two destinations that quietly change what they open.
       *
       * Alerts is not a tab either side of the pivot — the stay pivot
       * promoted Saved into the tab bar and this one has no tab to give it.
       * The bell keeps it one tap from the feed on both sides.
       */
      onPressAlerts={() =>
        router.push(inFoodModule ? foodHref.notifications : '/notifications')
      }
      alertCount={inFoodModule ? foodUnread : unread}
      // Profile lost its tab to Food; the header is its one door on both
      // sides, and which profile it opens follows the same pivot.
      onPressProfile={() => (inFoodModule ? router.push(foodHref.profile) : setTab('profile'))}
      userName={user?.name}
      variant={headerOverlay ? 'overlay' : 'surface'}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      <ExploreHeader
        locality={locality?.name ?? 'Choose an area'}
        /* The sentinel carries no city, and "All locations · " with nothing
           after it reads as a bug rather than as a scope. */
        city={locality && !everywhere ? locality.city : undefined}
        onPressLocality={() => router.push('/(entry)/locality')}
        /*
         * Same two icons, repointed while Food is open — the header pivots
         * exactly the way the bottom bar already does, just without a swap
         * animation of its own: nothing here is a set of tabs to cross-fade,
         * only two destinations that quietly change what they open.
         *
         * Alerts is not a tab either side of the pivot — the stay pivot
         * promoted Saved into the tab bar and this one has no tab to give it.
         * The bell keeps it one tap from the feed on both sides.
         */
        onPressAlerts={() =>
          router.push(inFoodModule ? foodHref.notifications : '/notifications')
        }
        alertCount={inFoodModule ? foodUnread : unread}
        // Profile lost its tab to Food; the header is its one door on both
        // sides, and which profile it opens follows the same pivot.
        onPressProfile={() => (inFoodModule ? router.push(foodHref.profile) : setTab('profile'))}
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
          refreshControl={
            <RefreshControl
              refreshing={feedFetching && !feedLoading}
              onRefresh={() => refetchFeed()}
              tintColor={colors.brand}
            />
          }
        >
          {/* Controls section — grouped tightly for a clean header layout */}
          <View style={{ gap: space[2] }}>
            {/* No `setQuery(EMPTY_QUERY)` on change any more — each category
                keeps its own filters, so switching tabs shows that category's
                feed as it was left rather than wiping what was set. See
                `queries` above. */}
            {category ? <CategoryTabs value={category} onChange={setCategory} /> : null}

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
          /* The second of the two food typography boundaries — the other is
             app/food/_layout.tsx. This module is reached as a TAB rather than
             a route, so it never passes through that layout and would
             otherwise inherit the stay scale. */
          <TypographyScope module="food">
            <FoodModule />
          </TypographyScope>
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
            {/* The address book. Reachable here rather than only from the
                checkout, because the moment somebody wants to FIX an address
                is rarely the moment they are ordering.

                It carries its own count for the same reason every other row
                here does: most visits to this screen are somebody checking a
                number, and a row that has to be opened to answer "how many
                have I saved" is a row that costs a tap to say nothing. The
                count is the address query's, not a second fetch — see
                `useAddresses`. */}
            <ProfileRow
              label="Your addresses"
              value={addressesLoading ? '…' : `${addressCount} saved`}
              onPress={() => router.push('/addresses')}
            />
            <ProfileRow label="Saved places" value={String(saved.length)} onPress={() => setTab('saved')} last />
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
            {/* "Language · English" and "Notifications · All on" used to sit
                here. Both were assertions about settings that do not exist —
                there is no language anywhere in the app and no notification
                preference on the account — and every row in this list draws a
                chevron, so both looked like doors. A settings row that states
                a fact nobody can change, and cannot be opened to check it, is
                worse than a shorter list. */}
            {/* "Design-system sheets" used to sit below this row, behind the
                preview gate. It is gone: the sheets are a builder's tool and
                this list belongs to a student. `app/preview.tsx` still exists
                and is still one `lampose://preview` away for anybody who
                needs it — what was removed is the door on a customer's
                profile, not the room behind it. */}
            <ProfileRow
              label="Help & support"
              onPress={() => router.push('/support')}
              last
            />
          </ProfileGroup>

          {/* The "Developer" group — one "Run as" row that switched the app
              between development, preview and production — is gone from this
              screen. `services/runtimeEnv.ts` still holds the override and
              every gate that reads it still works; what was removed is the
              only control that wrote it. A build that needs switching gets it
              back here, deliberately, rather than shipping it to students. */}

          <View style={{ gap: space[2] }}>
            <ProfileGroup>
              {/* "Delete my account" and the paragraph that explained what it
                  kept are both gone. Nothing behind them was ever built — the
                  row had no handler — so what is removed is a destructive
                  control that could not do anything and a promise about data
                  retention nobody was in a position to keep. */}
              {/*
                Logging out ASKS first.

                It used to sign out on the tap. It sits directly under "Saved
                places" and "Help & support" in a list people scroll, it is the
                one row in the profile whose effect cannot be undone with
                another tap, and getting back in costs an SMS code — so a
                mis-tap threw somebody out of the app and made them wait for a
                message to get back in.

                The app's own dialog rather than the platform's; see
                `components/ui/AppAlert.tsx`. Not `destructive`: signing out
                loses nothing — the shortlist, the addresses and the bookings
                are all on the account — so a red button would overstate it.
                It is still a question.
              */}
              <ProfileRow
                label="Log out"
                last
                onPress={() => {
                  void (async () => {
                    const ok = await confirm({
                      title: 'Log out?',
                      message: 'You will need your mobile number and a new code to sign back in. '
                        + 'Your bookings, saved places and addresses stay on your account.',
                      confirmLabel: 'Log out',
                      cancelLabel: 'Stay signed in',
                    });
                    if (!ok) return;

                    await signOut();
                    // Back to the router, which sends an account-less session
                    // to auth. Staying on home would leave the student inside
                    // a screen that now requires the account they just
                    // discarded.
                    router.replace('/');
                  })();
                }}
              />
            </ProfileGroup>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: layout.gutter, gap: space[3] }}>
          <BookingSegments value={segment} onChange={setSegment} />
          {(() => {
            /*
             * A confirmed request has no `PartnerBooking` row yet by
             * definition — `fromRealBooking` never produces a `requests`
             * segment, and the tab has nowhere else to read one from. See
             * `request/waiting.tsx` for where a request in flight is
             * actually tracked; a unified list here is a real gap this does
             * not close. Shown as the ordinary empty state rather than
             * hidden, so the segment is not simply dead.
             */
            if (bookingsQuery.loading && segment !== 'requests') {
              return (
                <View style={{ paddingTop: space[8], alignItems: 'center' }}>
                  <ActivityIndicator />
                </View>
              );
            }

            const shown = segment === 'requests'
              ? []
              : realBookings.filter((booking) => segmentOf(booking.status) === segment);

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
                onPress={() => router.push(`/bookings/${booking.realId ?? booking.id}` as never)}
              />
            ));
          })()}

        </ScrollView>
      )}

      {/* Rendered HERE, after the content, rather than up where the in-flow
          header goes: it has to paint over the banner, and render order is
          the one way to guarantee that on both platforms without leaning on
          `zIndex`, which Android resolves through `elevation` and not always
          the way the tree reads.

          `box-none` so the artwork underneath still takes taps everywhere
          the bar's own controls do not — the "Order Now" painted into the
          picture sits directly under this. */}
      {inFoodHome ? (
        <View style={styles.pinnedHeader} pointerEvents="box-none">
          {header}
        </View>
      ) : null}

      {/* Whatever is half-finished, in the layout directly above the bar —
          see `OngoingStrip`. Hidden inside Food, which is a different module
          with its own queue and no room for the stay side's. */}
      {!inFoodModule ? (
        <OngoingStrip
          items={ongoing}
          onPress={(item) => {
            /* The key carries which id it is, so the destination cannot drift
               from the stage that produced it. `listing-` is a step that only
               `confirm/[id]` can finish; `booking-` is one only the booking
               detail can. */
            const id = item.key.replace(/^(booking|listing)-/, '');
            router.push(
              (item.key.startsWith('listing-')
                ? `/confirm/${id}`
                : `/bookings/${id}`) as never,
            );
          }}
        />
      ) : null}

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
          /* Which questions to ask, and which of them may block Apply. */
          category={category}
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
  pinnedHeader: { position: 'absolute', top: 0, left: 0, right: 0 },
  identity: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  couponCard: { padding: 16, gap: 2 },
});
