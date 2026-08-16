import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Icon, OfflineBanner, Radio, Snackbar, Text } from '@/components/ui';
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
import { emptyStates } from '@/constants/copy';
import { useAppState } from '@/context/AppStateContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';
import { allBookings, segmentOf, type BookingSegment } from '@/data/bookings';
import { notificationDays, unreadCount } from '@/data/support';
import { feedListings, filledListing, lakshmiHostel, saiKrishnaPG } from '@/data/listings';
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

const TABS: readonly TabItem[] = [
  { id: 'explore', label: 'Explore', icon: 'search' },
  { id: 'saved', label: 'Saved', icon: 'bookmark' },
  { id: 'bookings', label: 'Bookings', icon: 'calendar' },
  { id: 'profile', label: 'Profile', icon: 'sharing' },
];

/** Mock only — the real one comes from the account. */
const INITIAL_SAVED: readonly SavedEntry[] = [
  { listing: saiKrishnaPG, rentWhenSaved: 9000, changedLabel: '3 days ago' },
  { listing: lakshmiHostel },
  { listing: filledListing },
];

type FeedState = 'ready' | 'loading' | 'empty' | 'offline';

export default function Home() {
  const { colors, space, layout, mode, radius, preference, setPreference } = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { locality, category, setCategory } = useAppState();

  const [tab, setTab] = useState('explore');
  const [query, setQuery] = useState<SearchQuery>(EMPTY_QUERY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [feedState, setFeedState] = useState<FeedState>('ready');
  const [saved, setSaved] = useState<readonly SavedEntry[]>(INITIAL_SAVED);
  const [undo, setUndo] = useState<SavedEntry | null>(null);
  const [segment, setSegment] = useState<BookingSegment>('active');

  /** Mock only — the real count comes from the server. */
  const unread = unreadCount(notificationDays);

  const filterCount = activeFilterCount(query);

  /**
   * One category, open listings only, then the filters.
   *
   * The category is a hard filter now rather than a sort key, so it is applied
   * first and the rest of the pipeline never sees the other three. That order
   * matters for the empty state: "no PGs under ₹8,000 here" is a useful
   * sentence, and it is only reachable if the category has already narrowed
   * the set before the rent ceiling does.
   */
  const shown = useMemo(() => {
    if (!category) return [];
    const open = feedListings.filter(
      (listing) => listing.category === category && !isGone(listing.availability),
    );
    return applyQuery(open, query);
  }, [category, query]);

  const total = shown.length;

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

  const removeSaved = (entry: SavedEntry) => {
    setSaved((current) => current.filter((item) => item.listing.id !== entry.listing.id));
    setUndo(entry);
  };

  // No guard on Profile any more: auth is the first gate, so nothing reaches
  // this screen without an account.
  const changeTab = (next: string) => setTab(next);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      <ExploreHeader
        locality={locality?.name ?? 'Hyderabad'}
        city={locality ? locality.city : undefined}
        onPressLocality={() => router.push('/(entry)/locality')}
        // Alerts is not a tab — the pivot promoted Saved into the tab bar. The
        // bell keeps it one tap from the feed, and it is also a Profile row.
        onPressAlerts={() => router.push('/notifications')}
      />

      {/* Persistent, and it always states the age of what is on screen — a
          stale rent is the dangerous case. */}
      <OfflineBanner offline={feedState === 'offline'} ageLabel="4 min old" />

      {tab === 'explore' ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: space[4], paddingBottom: space[8], gap: space[6] }}
          showsVerticalScrollIndicator={false}
        >
          {/* The way out of a required filter.
              The entry screen made a choice for the whole feed; this row is
              what stops that one tap from permanently hiding three quarters of
              the inventory. It writes straight back to device state, so the
              choice made here and the choice made on the entry screen are the
              same stored value — there is no second source to drift.
              It sits above the search field because it changes what search is
              searching. */}
          {category ? (
            <CategoryTabs
              value={category}
              onChange={(next) => {
                setCategory(next);
                // A filter set for PGs is meaningless against dormitories —
                // sharing types and price bands do not carry across. Clearing
                // is less surprising than silently returning nothing.
                setQuery(EMPTY_QUERY);
              }}
            />
          ) : null}

          {/* The search entry and the filter button are real during loading —
              they need no server data, and letting the user search while the
              results load is the whole point. */}
          <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
            <Pressable
              onPress={() => router.push('/(entry)/locality')}
              accessibilityRole="search"
              accessibilityLabel={`Search ${total} places`}
              style={[
                styles.search,
                {
                  borderRadius: radius.pill,
                  backgroundColor: colors.surface,
                  borderColor: colors.textPrimary,
                  paddingHorizontal: space[4],
                  gap: space[3],
                },
              ]}
            >
              <Icon name="search" size={20} color={colors.textPrimary} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">Search {total} places</Text>
                <Text variant="numMeta" color="tertiary">
                  Area, or a PG by name
                </Text>
              </View>
            </Pressable>

          </View>

          {/* Gender, price and sharing beside Filters.

              `FilterChipRow` already existed and was only ever used in the
              preview sheet: the Filters button is pinned first and never
              scrolls out of reach, because a student who has over-filtered
              into an empty list needs the way out where they last saw it. */}
          <FilterChipRow
            chips={quickChips}
            activeCount={filterCount}
            onPressFilters={() => setFiltersOpen(true)}
            onPressChip={() => setFiltersOpen(true)}
            onClearChip={clearChip}
          />

          {feedState === 'loading' ? (
            <View style={{ paddingHorizontal: layout.gutter, gap: space[4] }}>
              {[0, 1, 2].map((key) => (
                <ListingCardSkeleton key={key} variant="list" />
              ))}
            </View>
          ) : feedState === 'empty' || total === 0 ? (
            // Two different empties, and telling them apart matters. With no
            // filters set, the category is the cause — pointing at a rent
            // ceiling nobody touched sends people to clear filters that are
            // already clear.
            filterCount === 0 ? (
              <StateTemplate
                copy={emptyStates.noneInCategory({
                  categoryPlural: `${CATEGORY_LABEL[category!].toLowerCase()}s`,
                  locality: locality?.name ?? 'Hyderabad',
                  otherCategoryCount: feedListings.filter(
                    (listing) =>
                      listing.category !== category && !isGone(listing.availability),
                  ).length,
                })}
                onPrimary={() => router.push('/(entry)/locality')}
                onSecondary={() => {}}
              />
            ) : (
            <StateTemplate
              copy={emptyStates.noSearchResults({
                locality: locality?.name ?? 'Hyderabad',
                rentCeiling: query.rentCeiling
                  ? `₹${query.rentCeiling.toLocaleString('en-IN')}`
                  : '₹10,000',
                fittingCount: 14,
                suggestedCeiling: '₹12,000',
                nearbyCount: 23,
                nearbyLocality: 'Kondapur',
              })}
              onPrimary={() => setQuery({ ...query, rentCeiling: 12000 })}
              onSecondary={() => router.push('/(entry)/locality')}
            />
            )
          ) : (
            <View style={{ paddingHorizontal: layout.gutter, gap: space[4] }}>
              {/* The count names the category, so the feed says out loud that
                  it is filtered. A silent filter is why people conclude an app
                  "has nothing". */}
              <Text variant="caption" color="secondary">
                {total} {CATEGORY_LABEL[category!].toLowerCase()}
                {total === 1 ? '' : 's'} in {locality?.name ?? 'Hyderabad'}
              </Text>
              {shown.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  variant="list"
                  onPress={() => router.push(`/listing/${listing.id}`)}
                  onToggleSave={() => {}}
                />
              ))}
            </View>
          )}

          {/* Dev only: the three non-ready feed states are otherwise
              unreachable without a server. */}
          {__DEV__ ? (
            <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
              <Text variant="numMeta" color="tertiary">
                feed state — preview only
              </Text>
              <View style={[styles.wrap, { gap: space[2] }]}>
                {(['ready', 'loading', 'empty', 'offline'] as const).map((state) => (
                  <Button
                    key={state}
                    label={state}
                    size="sm"
                    variant={feedState === state ? 'primary' : 'secondary'}
                    onPress={() => setFeedState(state)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      ) : tab === 'saved' ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: layout.gutter, gap: space[3] }}>
          {saved.length === 0 ? (
            <StateTemplate copy={emptyStates.noSaved()} onPrimary={() => setTab('explore')} />
          ) : (
            <>
              <Text variant="caption" color="secondary">
                Rent and deposit on every row, so you can compare without opening each one.
              </Text>
              {saved.map((entry) => (
                <SavedRow
                  key={entry.listing.id}
                  entry={entry}
                  onPress={() => router.push(`/listing/${entry.listing.id}`)}
                  onRemove={() => removeSaved(entry)}
                />
              ))}
            </>
          )}
        </ScrollView>
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
                    locality: locality?.name ?? 'Hyderabad',
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

      <TabBar tabs={TABS} activeId={tab} onChange={changeTab} />

      {/* Six seconds, because a mis-tap on a bus is the case undo exists for. */}
      <Snackbar
        message="Removed from your shortlist"
        actionLabel="Undo"
        visible={undo !== null}
        onAction={() => {
          if (undo) setSaved((current) => [...current, undo]);
          setUndo(null);
        }}
        onDismiss={() => setUndo(null)}
        offsetBottom={72}
      />

      <Modal visible={filtersOpen} animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <FilterSheet
          query={query}
          inventory={feedListings}
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
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    // The one 2px border in the system — a deliberate one-off, so the search
    // entry reads as a physical object rather than another card.
    borderWidth: 2,
  },
});
