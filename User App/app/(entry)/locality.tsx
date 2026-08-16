import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Divider, SearchField, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { CurrentLocationRow, LocalityRow } from '@/components/auth';
import { useAppState } from '@/context/AppStateContext';
import { useTheme } from '@/context/ThemeContext';
import { currentLocationGuess, localities } from '@/data/places';
import { matchesQuery, type Locality } from '@/types/auth';

/**
 * Where are you looking?
 *
 * Shown full screen the first time the app reaches home, and never again
 * unless the user taps the locality in the Explore header. It is a
 * destination, not a modal — it changes the whole app's frame of reference,
 * and the feed refetches against the new key.
 *
 * This used to be a signup step. It is not one any more: browsing does not
 * require an account, so the question that gates the feed is asked at the feed,
 * and the questions that gate a booking are asked at the booking.
 *
 * Search matches locality names, colleges, coaching centres, metro stations and
 * common misspellings — a student from Warangal knows "near IIIT" but has never
 * heard the word "Gachibowli". Autocorrect is off; these are place names and
 * the keyboard would fight every one of them.
 */
export default function LocalityPickerScreen() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { locality: chosen, category, setLocality } = useAppState();
  const [query, setQuery] = useState('');

  const results = useMemo(
    () => localities.filter((locality) => matchesQuery(query, locality.name, locality.aliases)),
    [query],
  );

  const nearest = useMemo(() => {
    if (results.length > 0 || !query.trim()) return null;
    // No results is never a dead end: offer the closest thing we cover.
    return localities.reduce((best, locality) =>
      locality.listingCount > best.listingCount ? locality : best,
    );
  }, [results.length, query]);

  const choose = async (locality: Locality) => {
    await setLocality(locality);
    // First run continues into the category step; later visits — changing city
    // from the Explore header — go straight back to the feed.
    // Category is required, so a first-run user continues to it; someone
    // changing their locality later already has one and goes back to the feed.
    router.replace(category ? '/home' : '/(entry)/categories');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {/* No back arrow the first time through — there is nothing behind it. */}
      <StandardHeader
        title="Where are you looking?"
        onBack={chosen ? () => router.back() : undefined}
      />

      <View style={{ paddingHorizontal: layout.gutter, paddingVertical: space[3], gap: space[3] }}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          placeholder="Area, college or metro station"
          autoCorrect={false}
          autoCapitalize="words"
        />
        {/* Above the list, stating its guess — a wrong GPS read gets caught
            here rather than silently filtering everything below it. */}
        <CurrentLocationRow
          guessName={currentLocationGuess.name}
          onPress={() => choose(currentLocationGuess)}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingBottom: insets.bottom + space[8],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="eyebrow" color="tertiary" style={{ paddingVertical: space[2] }}>
          {query.trim() ? 'Matches' : 'Popular in Hyderabad'}
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
    </View>
  );
}
