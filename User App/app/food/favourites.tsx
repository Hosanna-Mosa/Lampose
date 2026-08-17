import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, SegmentedControl, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { DishRow, FoodEmptyState, FoodSectionHeader, KitchenCard } from '@/components/food';
import { useAppState } from '@/context/AppStateContext';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { findDish, findKitchen, kitchenOpen } from '@/data/food';
import type { Dish } from '@/types/food';
import { clockLabel, findWindow, minutesUntilOpen } from '@/types/food';

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
  const { colors, space, layout, radius, mode } = useTheme();
  const router = useRouter();
  const { locality } = useAppState();
  const {
    favouriteDishes,
    favouriteKitchens,
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

  const dishes = favouriteDishes.map((id) => findDish(id)).filter((dish): dish is Dish => Boolean(dish));
  const kitchens = favouriteKitchens.map((id) => findKitchen(id)).filter(Boolean);

  const openNow = dishes.filter((dish) => dish.windows.includes(windowId)).length;

  const setDishQty = (dish: Dish, next: number) => {
    const existing = lines.find((line) => line.dishId === dish.id);
    if (existing) {
      setQty(existing.key, next);
      return;
    }
    if (next > 0) add(dish, { window: windowId, spice: preferences.spice });
  };

  if (!dishes.length && !kitchens.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Favourites" onBack={() => router.back()} />
        <FoodEmptyState
          glyph="bookmark"
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

      <ScrollView contentContainerStyle={{ paddingBottom: space[8], gap: space[3] }}>
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
                    <Icon name="bookmark" size={20} color={colors.brandInk} />
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
                    <Icon name="bookmark" size={20} color={colors.brandInk} />
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
