import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SegmentedControl, Text } from '@/components/ui';
import { useBottomBar } from '@/context/BottomBarContext';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import { useTheme } from '@/context/ThemeContext';
import { takesTableBookings } from '@/services/adapters/food.adapter';

import { foodHref } from './routes';
import { FoodEmptyState, FoodFeedSkeleton } from './FoodStates';
import { FoodSectionHeader } from './FoodNotices';
import { RestaurantListCard } from './RestaurantListCard';
import { TableBookingsPanel } from './TableBookings';

/** The two halves of the Dine-in tab — somewhere to sit, and where you are sitting. */
const VIEWS = ['Book a table', 'My bookings'] as const;
type DineInView = (typeof VIEWS)[number];

/**
 * The Dine-in tab — the food module's one place for table bookings.
 *
 * "Book a table" lists the restaurants taking table bookings right now, and a
 * tap goes straight to picking a time (`book-table/[id]`) — someone who
 * opened this tab came to book, and the restaurant page with its menu is one
 * step they did not ask for. "My bookings" is the diner's own list, upcoming
 * first.
 *
 * Its own tab rather than half of Orders: an order is something that comes to
 * you and a table is somewhere you go, and each is opened with a different
 * question.
 */
export function FoodDineIn() {
  const { space, layout } = useTheme();
  const router = useRouter();
  const [view, setView] = useState<DineInView>('Book a table');

  return (
    <View style={styles.host}>
      <View style={{ paddingHorizontal: layout.gutter, paddingTop: space[2], paddingBottom: space[1] }}>
        <SegmentedControl
          options={VIEWS}
          value={view}
          onChange={setView}
          accent="link"
          accessibilityLabel="Book a table or your bookings"
        />
      </View>
      {view === 'My bookings' ? (
        <TableBookingsPanel onHome={() => setView('Book a table')} />
      ) : (
        <DineInRestaurants onOpen={(id) => router.push(foodHref.bookTable(id))} />
      )}
    </View>
  );
}

/** Restaurants taking table bookings, open ones first — the catalogue's own order. */
function DineInRestaurants({ onOpen }: { onOpen: (id: string) => void }) {
  const { space, layout } = useTheme();
  const { onScroll: barScroll, height: barHeight } = useBottomBar();
  const { kitchensFor, kitchenOpen, loading, error, refetch } = useFoodCatalogue();

  const kitchens = useMemo(() => kitchensFor().filter(takesTableBookings), [kitchensFor]);

  if (loading && kitchens.length === 0) return <FoodFeedSkeleton />;

  if (kitchens.length === 0) {
    return (
      <FoodEmptyState
        glyph="dining"
        title={error ? 'Could not load restaurants' : 'No restaurants taking table bookings yet'}
        body={error
          ? 'Check your connection and try again.'
          : 'When a restaurant near you starts taking table bookings, it shows up here.'}
        primaryLabel="Try again"
        onPrimary={() => refetch()}
        tone={error ? 'problem' : 'neutral'}
      />
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      onScroll={barScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{
        paddingHorizontal: layout.gutter,
        paddingTop: space[3],
        paddingBottom: space[8] + barHeight,
        gap: space[3],
      }}
    >
      <FoodSectionHeader
        title="Taking table bookings"
        trailing={`${kitchens.length} restaurant${kitchens.length === 1 ? '' : 's'}`}
      />
      <Text variant="caption" color="secondary">
        Pick a restaurant, then the day, time and number of guests. The restaurant confirms within 15 minutes.
      </Text>
      {kitchens.map((kitchen, index) => (
        <RestaurantListCard
          key={kitchen.id}
          kitchen={kitchen}
          open={kitchenOpen(kitchen)}
          onPress={() => onOpen(kitchen.id)}
          index={index}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
