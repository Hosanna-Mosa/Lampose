import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, SegmentedControl, Text } from '@/components/ui';
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
import { clockLabel, findWindow, minutesUntilOpen } from '@/types/food';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';

const TABS = ['Dishes', 'Kitchens'] as const;

/**
 * Favourites.
 *
 * A closed favourite keeps its place in the list, desaturated, with the time it
 * comes back instead of an Add button. Sorting the shut ones to the bottom or
 * dropping them would make the list reorder itself four times a day, and a list
 * that reorders itself is a list you cannot learn.
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
    toggleFavouriteDish,
    toggleFavouriteKitchen,
    qtyOf,
    add,
    setQty,
    lines,
    browseWindow,
    preferences,
  } = useFood();

  const [tab, setTab] = useState<(typeof TABS)[number]>('Dishes');
  const [now] = useState(() => new Date());

  const windowId = browseWindow;
  const activeWindow = findWindow(windowId);
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

  const openNow = dishes.filter((dish) => dish.windows.includes(windowId)).length;

  const setDishQty = (dish: Dish, next: number) => {
    const existing = lines.find((line) => line.dishId === dish.id);
    if (existing) {
      setQty(existing.key, next);
      return;
    }
    if (next > 0) add(dish, { window: windowId, spice: preferences.spice });
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
          body={`Tap the heart on a dish and it lands here, with the time it is cooked. ${activeWindow.label} is running now.`}
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
              const available = dish.windows.includes(windowId) && minutesUntilOpen(activeWindow, now) === 0;
              const returnsAt = clockLabel(findWindow(dish.windows[0]).startMinute);
              return (
                <View key={dish.id} style={styles.favouriteRow}>
                  <View style={{ flex: 1 }}>
                    <DishRow
                      dish={dish}
                      layout="feed"
                      meta={`${kitchen?.name ?? ''} · ${available ? 'cooking now' : `back at ${returnsAt}`}`}
                      qty={qtyOf(dish.id)}
                      onQtyChange={(next) => setDishQty(dish, next)}
                      onPress={() => router.push(foodHref.dish(dish.id))}
                      disabled={!available}
                      reason={!available ? returnsAt : undefined}
                    />
                  </View>
                  <Pressable
                    onPress={() => toggleFavouriteDish(dish.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${dish.name} from favourites`}
                    style={styles.heart}
                  >
                    <Icon name="heart" size={20} color={colors.danger.ink} fill={colors.danger.ink} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
            <FoodSectionHeader title="Saved kitchens" trailing={`${kitchens.length}`} />
            {kitchens.map((kitchen) =>
              kitchen ? (
                <View key={kitchen.id} style={styles.favouriteRow}>
                  <View style={{ flex: 1 }}>
                    <KitchenCard
                      kitchen={kitchen}
                      locality={areaLabel}
                      window={activeWindow}
                      now={now}
                      open={kitchenOpen(kitchen, windowId) && minutesUntilOpen(activeWindow, now) === 0}
                      reopensAt={clockLabel(findWindow(kitchen.windows[0]).startMinute)}
                      onPress={() => router.push(foodHref.kitchen(kitchen.id))}
                    />
                  </View>
                  <Pressable
                    onPress={() => toggleFavouriteKitchen(kitchen.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${kitchen.name} from favourites`}
                    style={styles.heart}
                  >
                    <Icon name="heart" size={20} color={colors.danger.ink} fill={colors.danger.ink} />
                  </Pressable>
                </View>
              ) : null,
            )}
          </View>
        )}

        <Text variant="caption" color="tertiary" style={{ paddingHorizontal: layout.gutter }}>
          Favourites stay in the list when their window is closed, greyed, with the time they return.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  favouriteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  heart: { paddingTop: 12 },
});
