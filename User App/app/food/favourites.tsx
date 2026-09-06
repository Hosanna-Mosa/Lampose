import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  DishRow,
  FavouritesUnavailableNote,
  FoodEmptyState,
  FoodSectionHeader,
  KitchenCard,
} from '@/components/food';
import { useAppState } from '@/context/AppStateContext';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import type { Dish } from '@/types/food';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';

const TABS = ['Dishes', 'Kitchens'] as const;

/**
 * Favourites.
 *
 * A closed favourite keeps its place in the list, desaturated, instead of an
 * Add button. Sorting the shut ones to the bottom or dropping them would make
 * the list reorder itself as kitchens open and close through the day, and a
 * list that reorders itself is a list you cannot learn.
 */
export default function FavouritesScreen() {
  const { findDish, findKitchen, kitchenOpen } = useFoodCatalogue();
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { locality } = useAppState();
  const {
    favouriteDishList,
    favouriteKitchenList,
    favouritesUnavailable,
    favouritesLoading,
    refreshFavourites,
    qtyOf,
    add,
    setQty,
    lines,
    preferences,
  } = useFood();

  const [tab, setTab] = useState<(typeof TABS)[number]>('Dishes');

  const areaLabel = locality?.name ?? 'your area';

  /*
   * The SERVER's list, not ids resolved against the loaded catalogue.
   *
   * The old version did `favouriteDishes.map(findDish)`, and the catalogue is
   * one locality's feed filtered to listed restaurants — so a favourite from a
   * kitchen that was closed, out of area, or simply absent from today's feed
   * resolved to nothing and silently disappeared. A favourites screen that
   * hides your favourites is worse than no screen. The server sends whole
   * dishes with their kitchens; see `foodFavourites.api.ts`.
   */
  const dishes = favouriteDishList;
  const kitchens = favouriteKitchenList;

  const openNow = dishes.filter((dish) => {
    const kitchen = findKitchen(dish.kitchenId);
    return kitchen && kitchenOpen(kitchen);
  }).length;

  const setDishQty = (dish: Dish, next: number) => {
    const existing = lines.find((line) => line.dishId === dish.id);
    if (existing) {
      setQty(existing.key, next);
      return;
    }
    if (next > 0) add(dish, { spice: preferences.spice });
  };

  /* A network read, so loading is a state this screen did not used to have.
     Without it the empty state flashes on every open before the list lands,
     which reads as "we lost your favourites". */
  if (favouritesLoading && !dishes.length && !kitchens.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Favourites" onBack={() => router.back()} />
        <View style={{ padding: layout.gutter }}>
          <Text variant="body" color="tertiary">Loading your favourites…</Text>
        </View>
      </View>
    );
  }

  if (!dishes.length && !kitchens.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Favourites" onBack={() => router.back()} />
        <FoodEmptyState
          glyph="heart"
          title="Nothing saved yet"
          body="Tap the heart on a dish or a kitchen and it lands here."
          primaryLabel="Browse what is cooking"
          onPrimary={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Favourites" onBack={() => router.back()} />

      <View style={{ paddingHorizontal: layout.gutter, paddingBottom: space[3] }}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} accessibilityLabel="Favourites" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: space[8], gap: space[3] }}
        refreshControl={
          <RefreshControl refreshing={favouritesLoading} onRefresh={refreshFavourites} />
        }
      >
        <View style={{ paddingHorizontal: layout.gutter }}>
          <View
            style={[
              styles.statusRow,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: space[3], gap: space[2] },
            ]}
          >
            <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: colors.brand }} />
            <Text variant="caption" color="secondary" style={{ flex: 1 }}>
              {openNow} of these are being cooked right now
            </Text>
          </View>
        </View>

        {favouritesUnavailable > 0 ? (
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FavouritesUnavailableNote count={favouritesUnavailable} />
          </View>
        ) : null}

        {tab === 'Dishes' ? (
          <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
            {dishes.map((dish) => {
              const kitchen = findKitchen(dish.kitchenId);
              const available = !!kitchen && kitchenOpen(kitchen) && !dish.soldOut;
              return (
                <DishRow
                  key={dish.id}
                  dish={dish}
                  layout="feed"
                  meta={`${kitchen?.name ?? ''} · ${available ? 'cooking now' : 'kitchen closed'}`}
                  qty={qtyOf(dish.id)}
                  onQtyChange={(next) => setDishQty(dish, next)}
                  onPress={() => router.push(foodHref.dish(dish.id))}
                  disabled={!available}
                  reason={!available ? 'Closed' : undefined}
                  /* The card's OWN heart — the same one every other dish feed in
                     the app uses (FoodSearch, the kitchen menu). This screen used
                     to draw a second heart as a sibling beside the card instead,
                     which put it outside the card's border, floating on the page
                     background rather than reading as part of the row. */
                  favouritable
                />
              );
            })}
          </View>
        ) : (
          <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
            <FoodSectionHeader title="Saved kitchens" trailing={`${kitchens.length}`} />
            {kitchens.map((kitchen) =>
              kitchen ? (
                <KitchenCard
                  key={kitchen.id}
                  kitchen={kitchen}
                  locality={areaLabel}
                  open={kitchenOpen(kitchen)}
                  onPress={() => router.push(foodHref.kitchen(kitchen.id))}
                  favouritable
                />
              ) : null,
            )}
          </View>
        )}

        <Text variant="caption" color="tertiary" style={{ paddingHorizontal: layout.gutter }}>
          Favourites stay in the list when their kitchen is closed, greyed out.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
});
