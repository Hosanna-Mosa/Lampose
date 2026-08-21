import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Divider, SearchField, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { CurrentLocationRow, LocalityRow } from '@/components/auth';
import { useAppState } from '@/context/AppStateContext';
import { useTheme } from '@/context/ThemeContext';
import { useListingMeta } from '@/services';
import { matchesQuery, type Locality } from '@/types/auth';

/**
 * Where are you looking?
 *
 * Shown full screen the first time the app reaches home, and never again
 * unless the user taps the locality in the Explore header. It is a
 * destination, not a modal — it changes the whole app's frame of reference,
 * and the feed refetches against the new key.
 *
 * ## The list is the database
 *
 * It used to be eight hardcoded Hyderabad areas with invented listing counts:
 * Gachibowli 184, Madhapur 152, Ameerpet 143. The collection holds Bangalore
 * and Anakapalli. So every row on this screen was an area with nothing in it,
 * every area we actually cover was missing, and a student's first tap in the
 * app led to an empty feed.
 *
 * The rows now come from `GET /api/v2/listings/meta`, which derives them from
 * the same `place` field the feed filters on — so an area offered here is
 * spelled exactly as the query that follows will match, and the count beside
 * it is the number of rows that will be there.
 *
 * Search matches locality names and the words inside them, so "hsr" and
 * "sector 1" both find "HSR Layout Sector 1". The market aliases a student
 * actually uses — "triple it", "kphb" — need a person to record them and a
 * field to record them in; see `places.adapter.ts`.
 */
export default function LocalityPickerScreen() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { locality: chosen, category, setLocality } = useAppState();
  const [query, setQuery] = useState('');

  const { meta, isPending, error, refetch, isFetching } = useListingMeta(category);

  const localities = meta?.localities ?? [];

  const results = useMemo(
    () => localities.filter((locality) => matchesQuery(query, locality.name, locality.aliases)),
    [localities, query],
  );

  const nearest = useMemo(() => {
    if (results.length > 0 || !query.trim() || !localities.length) return null;
    // No results is never a dead end: offer the closest thing we cover.
    return localities.reduce((best, locality) =>
      locality.listingCount > best.listingCount ? locality : best,
    );
  }, [results.length, query, localities]);

  const choose = async (locality: Locality) => {
    await setLocality(locality);
    /*
     * Always the feed, and always by `dismissTo`.
     *
     * Two things changed here on 20 Aug 2026, and they are separate.
     *
     * The destination is unconditional now because this is the LAST gate:
     * category is asked before it, so by the time anyone answers this screen
     * they already have one. The old `category ? ... : '/(entry)/categories'`
     * was the branch that made this screen the first step of the chain, and
     * with the order reversed it can never take the false side.
     *
     * `dismissTo` rather than `replace` because this screen is `push`ed from
     * the Explore header every time somebody changes their area, and `replace`
     * means "pop this and PUSH the target" — not "go back to the target". So
     * replacing to `/home` while a `/home` was already underneath left TWO of
     * them stacked, one per visit. `dismissTo` pops back to the existing one,
     * and still replaces on first run when there is no home behind it yet.
     */
    router.dismissTo('/home');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {/*
        The arrow appears whenever there IS something behind it, which is not
        the same question as "has this student already picked an area".

        It used to ask the second one — `chosen ? back : undefined` — and that
        was right while this was the FIRST gate: on a first run nothing was
        behind it, so an arrow would have been a dead control. Reordering the
        chain to category-then-area made it wrong the same day, because the
        category screen is now underneath this one and a student who picked
        the wrong kind of place had no way back to change it.

        `canGoBack()` asks the navigator instead of inferring from app state,
        so it stays correct whichever screen ends up behind this one.
      */}
      <StandardHeader
        title="Where are you looking?"
        onBack={router.canGoBack() ? () => router.back() : undefined}
      />

      {/*
        The whole screen waits, rather than the list inside it.

        This is a gate: nothing behind it can be answered until an area is
        picked, and there is no useful half-state where the search field is
        live over an empty list. A student typing into a box that matches
        nothing concludes we do not cover their city.
      */}
      {isPending ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
          <ActivityIndicator color={colors.brand} />
          <Text variant="caption" color="tertiary">
            Finding the areas we cover…
          </Text>
        </View>
      ) : error || !localities.length ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: layout.gutter, gap: space[3] }}>
          <Text variant="title1">
            {error ? 'We could not load your areas' : 'No areas listed yet'}
          </Text>
          <Text variant="bodyLg" color="secondary">
            {error
              ? error.displayMessage
              : 'There is nothing in the catalogue at the moment. Please check back shortly.'}
          </Text>
          <Button
            label={isFetching ? 'Trying…' : 'Try again'}
            onPress={() => refetch()}
            disabled={isFetching}
            fullWidth
          />
        </View>
      ) : (
        <>
          <View style={{ paddingHorizontal: layout.gutter, paddingVertical: space[3], gap: space[3] }}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              onClear={() => setQuery('')}
              placeholder="Area, college or metro station"
              autoCorrect={false}
              autoCapitalize="words"
            />
            {/* Above the list, stating its guess — a wrong read gets caught
                here rather than silently filtering everything below it.
                The guess is the busiest area rather than a GPS fix: nothing
                in the collection carries coordinates to compare against one.
                See `guessLocality`. */}
            {meta?.guess ? (
              <CurrentLocationRow
                guessName={meta.guess.name}
                onPress={() => choose(meta.guess as Locality)}
              />
            ) : null}
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: layout.gutter,
              paddingBottom: space[8],
            }}
            keyboardShouldPersistTaps="handled"
          >
            <Text variant="eyebrow" color="tertiary" style={{ paddingVertical: space[2] }}>
              {query.trim()
                ? 'Matches'
                : /* Named rather than "Popular in Hyderabad", which was true of
                     the fixtures and of nowhere else. */
                  `${localities.length} ${localities.length === 1 ? 'area' : 'areas'} with places listed`}
            </Text>

            {results.map((locality, index) => (
              <React.Fragment key={locality.id}>
                {index > 0 ? <Divider /> : null}
                <LocalityRow locality={locality} onPress={() => choose(locality)} />
              </React.Fragment>
            ))}

            {results.length === 0 && nearest ? (
              <View style={{ gap: space[3], paddingTop: space[3] }}>
                <Text variant="bodyLg" color="secondary">
                  Nothing matches “{query}”. The closest area we cover is {nearest.name}.
                </Text>
                <LocalityRow locality={nearest} onPress={() => choose(nearest)} />
              </View>
            ) : null}
          </ScrollView>
        </>
      )}
    </View>
  );
}
