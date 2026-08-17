import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip, SearchField, Text } from '@/components/ui';
import { useAppState } from '@/context/AppStateContext';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { DISHES, findKitchen, kitchensFor } from '@/data/food';
import type { Dish } from '@/types/food';
import { clockLabel, findWindow } from '@/types/food';
import { formatRupees } from '@/utils/money';

import { DishRow } from './DishRow';
import { foodHref } from './routes';
import { FoodEmptyState } from './FoodStates';
import { FoodSectionHeader } from './FoodNotices';
import { MealWindowToken } from './MealWindowRail';
import { RatingPill } from './FoodMarks';

const SUGGESTIONS = ['Thali under ₹100', 'Filter coffee', 'Biryani', 'Egg dishes', 'Maggi', 'Paratha'];

type PriceBand = 'any' | 'under80' | 'under150';

/**
 * Search — inside the window, and it says so.
 *
 * Everything here is already scoped to the meal window, so the window token
 * sits in the header rather than appearing as a filter. Offering "window" as a
 * filter would let a student build a query that contradicts the rail two
 * screens back, and then wonder why a dish they can see cannot be added.
 *
 * Dishes come before kitchens because students type food, not brands. Nobody
 * has ever opened this screen and typed "Bawarchi".
 */
export function FoodSearch({ now }: { now: Date }) {
  const { colors, space, layout, radius } = useTheme();
  const router = useRouter();
  const { locality } = useAppState();
  const { preferences, qtyOf, add, setQty, lines, browseWindow: windowId } = useFood();

  const [query, setQuery] = useState('');
  const [price, setPrice] = useState<PriceBand>('any');
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [recent, setRecent] = useState<readonly string[]>(['biryani', 'filter coffee']);

  const activeWindow = findWindow(windowId);
  const areaLabel = locality?.name ?? 'your area';
  const term = query.trim().toLowerCase();

  const ceiling = price === 'under80' ? 80 : price === 'under150' ? 150 : Number.POSITIVE_INFINITY;

  const results = useMemo(() => {
    const inWindow = DISHES.filter((dish) => dish.windows.includes(windowId));
    return inWindow
      .filter((dish) => {
        const kitchen = findKitchen(dish.kitchenId);
        if (!kitchen) return false;
        if (preferences.vegOnly && dish.diet !== 'veg') return false;
        if (dish.price > ceiling) return false;
        if (nearbyOnly && kitchen.walkMinutes > 10) return false;
        if (!term) return true;
        return (
          dish.name.toLowerCase().includes(term) ||
          dish.description.toLowerCase().includes(term) ||
          kitchen.name.toLowerCase().includes(term) ||
          kitchen.cuisine.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => a.price - b.price);
  }, [windowId, term, ceiling, nearbyOnly, preferences.vegOnly]);

  const matchingKitchens = useMemo(() => {
    if (!term) return [];
    return kitchensFor(windowId).filter(
      (kitchen) => kitchen.name.toLowerCase().includes(term) || kitchen.cuisine.toLowerCase().includes(term),
    );
  }, [term, windowId]);

  const activeFilters = (price !== 'any' ? 1 : 0) + (nearbyOnly ? 1 : 0) + (preferences.vegOnly ? 1 : 0);

  const setDishQty = (dish: Dish, next: number) => {
    const existing = lines.find((line) => line.dishId === dish.id);
    if (existing) {
      setQty(existing.key, next);
      return;
    }
    if (next > 0) add(dish, { window: windowId });
  };

  const remember = () => {
    const value = query.trim();
    if (!value || recent.includes(value)) return;
    setRecent([value, ...recent].slice(0, 6));
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: space[2], paddingBottom: space[8], gap: space[3] }}
    >
      <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
        <View style={styles.scopeRow}>
          <MealWindowToken window={activeWindow} now={now} />
          <Text variant="caption" color="tertiary" style={{ flex: 1 }} numberOfLines={2}>
            Searching what is cooking now, until {clockLabel(activeWindow.endMinute)}.
          </Text>
        </View>

        <SearchField
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={remember}
          onClear={() => setQuery('')}
          placeholder="Search idli, biryani, a kitchen"
          returnKeyType="search"
          accessibilityLabel="Search food"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space[2], paddingRight: space[4] }}
        >
          <Chip
            label={activeFilters ? `Filters ${activeFilters}` : 'Filters'}
            selected={activeFilters > 0}
            onPress={() => setPrice(price === 'any' ? 'under150' : 'any')}
          />
          <Chip label={`Under ${formatRupees(80)}`} selected={price === 'under80'} onPress={() => setPrice(price === 'under80' ? 'any' : 'under80')} />
          <Chip label={`Under ${formatRupees(150)}`} selected={price === 'under150'} onPress={() => setPrice(price === 'under150' ? 'any' : 'under150')} />
          <Chip label="Under 10 min walk" selected={nearbyOnly} onPress={() => setNearbyOnly(!nearbyOnly)} />
        </ScrollView>
      </View>

      {results.length === 0 ? (
        <FoodEmptyState
          glyph="search"
          title={term ? `Nothing matches “${query.trim()}” near ${areaLabel}` : 'Nothing matches those filters'}
          body={
            term
              ? 'No kitchen around your PG cooks this in this window. Tell us what you want and we take it to the kitchens signing up nearby.'
              : `Loosen the price filter to see what the ${activeWindow.label.toLowerCase()} window has.`
          }
          primaryLabel={term ? `Request ${query.trim()}` : 'Clear filters'}
          onPrimary={() => {
            setPrice('any');
            setNearbyOnly(false);
          }}
          secondaryLabel={term ? 'Clear the search' : undefined}
          onSecondary={term ? () => setQuery('') : undefined}
        />
      ) : (
        <>
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodSectionHeader
              title={term ? 'Dishes' : 'Everything cooking now'}
              trailing={`${results.length} · cheapest first`}
            />
          </View>

          <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
            {results.slice(0, 12).map((dish) => {
              const kitchen = findKitchen(dish.kitchenId);
              return (
                <DishRow
                  key={dish.id}
                  dish={dish}
                  layout="feed"
                  meta={`${kitchen?.name ?? ''} · ${kitchen?.walkMinutes ?? 0} min walk`}
                  qty={qtyOf(dish.id)}
                  onQtyChange={(next) => setDishQty(dish, next)}
                  onPress={() => router.push(foodHref.dish(dish.id))}
                />
              );
            })}
          </View>
        </>
      )}

      {matchingKitchens.length ? (
        <View style={{ gap: space[2] }}>
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodSectionHeader title={`Kitchens matching “${query.trim()}”`} />
          </View>
          <View
            style={{
              marginHorizontal: layout.gutter,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.card,
              paddingHorizontal: space[3],
            }}
          >
            {matchingKitchens.map((kitchen, index) => (
              <Pressable
                key={kitchen.id}
                onPress={() => router.push(foodHref.kitchen(kitchen.id))}
                accessibilityRole="button"
                style={[
                  styles.kitchenRow,
                  {
                    paddingVertical: space[3],
                    borderBottomWidth: index === matchingKitchens.length - 1 ? 0 : StyleSheet.hairlineWidth,
                    borderBottomColor: colors.borderSubtle,
                    gap: space[3],
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="title3">{kitchen.name}</Text>
                  <Text variant="caption" color="tertiary" numberOfLines={1}>
                    {kitchen.cuisine} · {kitchen.walkMinutes} min walk
                  </Text>
                </View>
                <RatingPill rating={kitchen.rating} count={kitchen.ratingCount} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {!term ? (
        <View style={{ paddingHorizontal: layout.gutter, gap: space[3], marginTop: space[2] }}>
          <View>
            <FoodSectionHeader title="Students near you search" />
            <View style={[styles.chipWrap, { gap: space[2] }]}>
              {SUGGESTIONS.map((suggestion) => (
                <Chip key={suggestion} label={suggestion} onPress={() => setQuery(suggestion)} />
              ))}
            </View>
          </View>

          {recent.length ? (
            <View>
              <FoodSectionHeader title="Recent searches" />
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderRadius: radius.card,
                  paddingHorizontal: space[3],
                }}
              >
                {recent.map((entry, index) => (
                  <Pressable
                    key={entry}
                    onPress={() => setQuery(entry)}
                    accessibilityRole="button"
                    style={[
                      styles.kitchenRow,
                      {
                        paddingVertical: space[3],
                        borderBottomWidth: index === recent.length - 1 ? 0 : StyleSheet.hairlineWidth,
                        borderBottomColor: colors.borderSubtle,
                      },
                    ]}
                  >
                    <Text variant="body" style={{ flex: 1 }}>
                      {entry}
                    </Text>
                    <Pressable
                      onPress={() => setRecent(recent.filter((value) => value !== entry))}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={`Forget ${entry}`}
                    >
                      <Text variant="body" color="tertiary">
                        ✕
                      </Text>
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kitchenRow: { flexDirection: 'row', alignItems: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
