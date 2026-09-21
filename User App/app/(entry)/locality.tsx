import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Button, Divider, Icon, SearchField, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { CurrentLocationRow, LocalityRow, NearbyRadiusDialog } from '@/components/auth';
import { useAppState } from '@/context/AppStateContext';
import { useTheme } from '@/context/ThemeContext';
import { useListingMeta } from '@/services';
import { locateMe, LocationRefused } from '@/services/location/useMyLocation';
import { ALL_LOCALITIES, matchesQuery, nearbyLocality, type Locality } from '@/types/auth';

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
 *
 * ## The location row asks "how far", then takes a real fix
 *
 * It used to be `meta.guess` — the area with the most listings — captioned
 * "most likely" and never touching the device, then `findMyLocality`: one
 * foreground fix, reverse-geocoded by the platform, matched by NAME against
 * the areas the catalogue holds (still in `resolveLocality.ts`, now unused
 * here). A name match was the only option while nothing but free-text
 * `place` existed to search against, and it had a real failure mode: a
 * student two streets outside a named area's drawn boundary was told
 * nothing covered them.
 *
 * `NearbyRadiusDialog` asks for a radius first, then `searchNearby` takes
 * one fix and builds a `nearbyLocality` — a radius around a point, not a
 * name — which the feed filters and sorts by real distance server-side (see
 * `getListings`). Permission is asked only after the radius is chosen, so
 * the fix is never taken before it is clear what for.
 *
 * ## "All locations" is an answer, not a skip
 *
 * Every row on this screen narrows the feed to one area, and there was no way
 * to say "show me everything" — a student who does not know the city yet, or
 * who is comparing two, had to pick an area and then find the "see all N in
 * <city>" offer above the feed. The row at the top of the list sets the
 * `ALL_LOCALITIES` sentinel, which the feed reads as "do not scope this".
 *
 * It is a sentinel rather than `null` because `app/index.tsx` treats a null
 * locality as an unanswered question and redirects back here — see the note on
 * `ALL_LOCALITIES` in `types/auth.ts`.
 */
export default function LocalityPickerScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { locality: chosen, category, setLocality } = useAppState();
  const [query, setQuery] = useState('');

  const { meta, isPending, error, refetch, isFetching } = useListingMeta(category);

  /*
   * Only areas that have something in them.
   *
   * `toLocalities` counts within the chosen category, so an area holding four
   * hotels and no PGs comes back at zero for a student who picked PG. Offering
   * it is offering an empty feed — the exact failure this screen's own header
   * note describes from when the rows were hardcoded. The count beside each
   * row is what makes the filter safe to apply: a row that survives it is a
   * row with a real number on it.
   */
  const localities = useMemo(
    () => (meta?.localities ?? []).filter((locality) => locality.listingCount > 0),
    [meta?.localities],
  );

  /*
   * A–Z, always.
   *
   * The server returns them in whatever order the aggregation produced, which
   * is neither alphabetical nor by size and is therefore not an order anybody
   * can navigate. A list somebody is scanning for a name they already know is
   * sorted by that name. `localeCompare` rather than `<` so accented and
   * non-Latin names sort correctly rather than by code point.
   */
  const sorted = useMemo(
    () => [...localities].sort((a, b) => a.name.localeCompare(b.name, 'en-IN')),
    [localities],
  );

  const results = useMemo(
    () => sorted.filter((locality) => matchesQuery(query, locality.name, locality.aliases)),
    [sorted, query],
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

  /* ------------------------------------------------------------------ *
   * The current-location row — see the note on the component.
   * ------------------------------------------------------------------ */

  /* Across every area, for the All locations row. Summed from the same
     per-category counts the rows show, so the total and its parts agree. */
  const totalListings = useMemo(
    () => localities.reduce((sum, locality) => sum + locality.listingCount, 0),
    [localities],
  );

  const chosenIsAll = chosen?.id === ALL_LOCALITIES.id;

  const [locating, setLocating] = useState(false);
  /** What the row says under its label. Null means "not asked yet". */
  const [fixNote, setFixNote] = useState<string | null>(null);
  const [fixFailed, setFixFailed] = useState(false);
  const [radiusDialogOpen, setRadiusDialogOpen] = useState(false);

  /**
   * A radius around a real fix, rather than a name match.
   *
   * This used to run `findMyLocality`, which turned the fix into words and
   * matched them against the areas the catalogue names — the only option
   * when nothing but `place` (free text) existed to search against. Now that
   * the feed itself can filter by distance (see `getListings` on the
   * backend), asking "which area am I in" is a worse answer than asking
   * "what is actually near me" — a student two streets outside a named
   * area's boundary was told nothing covers them, when three PGs were 400m
   * away in the next area over.
   *
   * The radius is chosen first, by `NearbyRadiusDialog`, and only then is a
   * fix taken — asking permission before it is clear what for reads as the
   * app grabbing location for no stated reason.
   */
  const searchNearby = useCallback(async (radiusKm: number) => {
    if (locating) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    setLocating(true);
    setFixFailed(false);
    setFixNote(`Finding places within ${radiusKm} km…`);
    try {
      const fix = await locateMe();
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      await choose(nearbyLocality({
        lat: fix.location.lat,
        lng: fix.location.lng,
        radiusKm,
        label: fix.fields.area || fix.fields.city || undefined,
      }));
    } catch (caught) {
      setFixFailed(true);
      setFixNote(
        caught instanceof LocationRefused
          ? caught.message
          : 'We could not get your location. Search for your area instead.',
      );
    } finally {
      setLocating(false);
    }
  }, [locating, choose]);

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
            {/* Above the list, and it states what it found before it applies
                it — a wrong read gets caught here rather than silently
                filtering everything below it. */}
            <CurrentLocationRow
              loading={locating}
              tone={fixFailed ? 'problem' : 'normal'}
              subtitle={
                fixNote
                ?? 'Choose a radius and see places within it, wherever you are'
              }
              onPress={() => setRadiusDialogOpen(true)}
            />

            <NearbyRadiusDialog
              visible={radiusDialogOpen}
              onClose={() => setRadiusDialogOpen(false)}
              onSelect={(radiusKm) => {
                setRadiusDialogOpen(false);
                void searchNearby(radiusKm);
              }}
            />

            {/*
              Everywhere, as a row rather than a hidden default.

              It is drawn like a locality row rather than as a button because
              it IS one of the answers to the question at the top of the
              screen, and putting it in a different shape would read as an
              escape from the question instead of an answer to it. It carries
              the total, so the choice is made against a real number.
            */}
            <Pressable
              onPress={() => choose(ALL_LOCALITIES)}
              accessibilityRole="button"
              accessibilityLabel={`All locations. ${totalListings} places across every area we cover.`}
              style={({ pressed }) => [
                styles.allRow,
                {
                  minHeight: 56,
                  padding: space[3],
                  gap: space[3],
                  borderRadius: radius.chip,
                  borderWidth: chosenIsAll ? 1.5 : StyleSheet.hairlineWidth,
                  borderColor: chosenIsAll ? colors.brand : colors.border,
                  backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
                },
              ]}
            >
              <Icon name="search" size={20} color={colors.brandInk} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">All locations</Text>
                <Text variant="numMeta" color="tertiary">
                  {totalListings} {totalListings === 1 ? 'place' : 'places'} across{' '}
                  {localities.length} {localities.length === 1 ? 'area' : 'areas'}
                </Text>
              </View>
              <Icon name="chevronRight" size={20} color={colors.textTertiary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: layout.gutter,
              paddingBottom: space[8],
            }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isFetching && !isPending}
                onRefresh={() => refetch()}
                tintColor={colors.brand}
              />
            }
          >
            <Text variant="eyebrow" color="tertiary" style={{ paddingVertical: space[2] }}>
              {query.trim()
                ? 'Matches'
                : /* Named rather than "Popular in Hyderabad", which was true of
                     the fixtures and of nowhere else. Every area in this list
                     has at least one place in it — see the filter on
                     `localities` — so the count is a promise the rows keep. */
                  `${localities.length} ${localities.length === 1 ? 'area' : 'areas'} with places listed · A–Z`}
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

const styles = StyleSheet.create({
  allRow: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
