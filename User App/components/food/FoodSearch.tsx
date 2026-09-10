import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { metaLine, walkLabel } from '@/services/adapters/food.adapter';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip, IconButton, SearchField, Text } from '@/components/ui';
import { useAppState } from '@/context/AppStateContext';
import { useBottomBar } from '@/context/BottomBarContext';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import type { Dish } from '@/types/food';
import { formatRupees } from '@/utils/money';

import { DishRow } from './DishRow';
import { KitchenCard } from './KitchenCard';
import { foodHref } from './routes';
import { FoodEmptyState } from './FoodStates';
import { FoodSectionHeader } from './FoodNotices';
import { RatingPill } from './FoodMarks';

/* Exported so Food Home's search field can cycle the same real terms through
   its placeholder, rather than a second, invented list drifting from this
   one. */
export const SUGGESTIONS = ['Thali under ₹100', 'Filter coffee', 'Biryani', 'Egg dishes', 'Maggi', 'Paratha'];

type PriceBand = 'any' | 'under80' | 'under150';

/**
 * Search — everything near you, all the time.
 *
 * Dishes come before kitchens because students type food, not brands. Nobody
 * has ever opened this screen and typed "Bawarchi".
 *
 * ## Why this one screen carries a back control
 *
 * Every other screen in this module is a tab, so the bottom bar is its own way
 * out — tapping any of the three is both "leave here" and "go there", and a
 * back arrow would be a fourth way to do what the bar already does.
 *
 * Search is not a tab any more. It lost its slot to Dine In and is reached
 * from the field across the top of Home instead, which means the bar has
 * nothing highlighted while it is open and nothing in it says "back". Without
 * the arrow the only exit is the raised Explore disc, which does not go back
 * to Food's Home — it leaves the module entirely.
 */
export function FoodSearch({ onBack }: { onBack?: () => void }) {
  const { dishes: allDishes, findKitchen, kitchensFor, kitchens, kitchenOpen } = useFoodCatalogue();

  /* Walking times exist only when the feed was asked with the student's
     coordinates. With none, every kitchen reads 0 and a "under 10 min walk"
     filter would match all of them — a control that appears to narrow and
     does nothing is worse than one that is not offered. */
  const haveDistances = kitchens.some((kitchen) => kitchen.walkMinutes > 0);
  const { colors, space, layout, radius } = useTheme();
  /* The bar floats over this screen and gets out of the way while it is read
     down — see `BottomBarContext`. */
  const { onScroll: barScroll, height: barHeight } = useBottomBar();
  const router = useRouter();
  const { locality } = useAppState();
  const { preferences, qtyOf, add, setQty, lines } = useFood();

  const [query, setQuery] = useState('');
  const [price, setPrice] = useState<PriceBand>('any');
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [recent, setRecent] = useState<readonly string[]>(['biryani', 'filter coffee']);

  const areaLabel = locality?.name ?? 'your area';
  const term = query.trim().toLowerCase();

  /**
   * The single rule for whether a dish can be ordered, matching
   * `dish/[id].tsx` exactly: the kitchen is open and the dish is not sold out.
   *
   * A closed result is NOT hidden. It keeps its place with the control
   * explaining itself, because a search that silently drops half its matches
   * teaches a student that we do not have the dish — and they stop looking.
   */
  const orderState = (dish: Dish) => {
    const kitchen = findKitchen(dish.kitchenId);
    if (!kitchen) return { orderable: false, reason: 'Unavailable' };
    if (dish.soldOut) return { orderable: false, reason: 'Sold out' };
    if (!kitchenOpen(kitchen)) return { orderable: false, reason: 'Kitchen closed' };
    return { orderable: true, reason: undefined };
  };

  const ceiling = price === 'under80' ? 80 : price === 'under150' ? 150 : Number.POSITIVE_INFINITY;

  const results = useMemo(() => {
    return allDishes
      .filter((dish) => {
        const kitchen = findKitchen(dish.kitchenId);
        if (!kitchen) return false;
        if (preferences.vegOnly && dish.diet !== 'veg') return false;
        if (dish.price > ceiling) return false;
        if (haveDistances && nearbyOnly && kitchen.walkMinutes > 10) return false;
        if (!term) return true;
        return (
          dish.name.toLowerCase().includes(term) ||
          dish.description.toLowerCase().includes(term) ||
          kitchen.name.toLowerCase().includes(term) ||
          kitchen.cuisine.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => a.price - b.price);
  }, [allDishes, term, ceiling, nearbyOnly, preferences.vegOnly]);

  const matchingKitchens = useMemo(() => {
    if (!term) return [];
    return kitchensFor().filter(
      (kitchen) => kitchen.name.toLowerCase().includes(term) || kitchen.cuisine.toLowerCase().includes(term),
    );
  }, [term, kitchensFor]);

  const activeFilters =
    (price !== 'any' ? 1 : 0) + (haveDistances && nearbyOnly ? 1 : 0) + (preferences.vegOnly ? 1 : 0);
  /**
   * Whether there is anything on THIS row for the summary chip to clear.
   *
   * `activeFilters` also counts `preferences.vegOnly` — a standing dietary
   * preference set on Home or the preferences screen, not a control this row
   * offers. Counting it in the number is honest (it genuinely is narrowing
   * what's shown), but the chip must not claim to reset it: this screen has
   * no veg-only toggle to put back, so a tap here can only ever clear price
   * and the nearby toggle.
   */
  const rowFiltersActive = price !== 'any' || (haveDistances && nearbyOnly);

  const setDishQty = (dish: Dish, next: number) => {
    const existing = lines.find((line) => line.dishId === dish.id);
    if (existing) {
      setQty(existing.key, next);
      return;
    }
    /* The disabled control is the first guard and this is the second. A row
       rendered a moment before the kitchen closed still has a live handler,
       and the cart is the one place that must never end up holding food
       nobody is cooking. Removing an existing line is always allowed — that
       is how somebody gets uncookable food back OUT. */
    if (next > 0 && !orderState(dish).orderable) return;
    if (next > 0) add(dish);
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
      contentContainerStyle={{
        paddingTop: space[2],
        /* The bar floats over this list, so its height is tail padding here. */
        paddingBottom: space[8] + barHeight,
        gap: space[3],
      }}
      onScroll={barScroll}
      scrollEventThrottle={16}
    >
      <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
        {/* The arrow sits BESIDE the field rather than above it. A row of its
            own would cost a whole line of screen to a control that is one
            glyph, and this screen opens with the keyboard up — the field
            should be the first thing under the header, not the second. */}
        <View style={styles.searchRow}>
          {onBack ? (
            <IconButton
              name="chevronLeft"
              onPress={onBack}
              accessibilityLabel="Back to food home"
            />
          ) : null}

          <View style={styles.searchFieldSlot}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={remember}
              onClear={() => setQuery('')}
              placeholder="Search idli, biryani, a kitchen"
              returnKeyType="search"
              accessibilityLabel="Search food"
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space[2], paddingRight: space[4] }}
        >
          <Chip
            label={activeFilters ? `Filters ${activeFilters}` : 'Filters'}
            selected={activeFilters > 0}
            /*
             * This used to double as the "Under ₹150" toggle — tapping it set
             * `price` directly, so every tap both changed a filter it never
             * displayed as changed AND counted itself into the number it was
             * showing, climbing by one on every press. It only ever clears
             * what this row itself set.
             */
            disabled={!rowFiltersActive}
            onPress={() => {
              setPrice('any');
              setNearbyOnly(false);
            }}
          />
          <Chip label={`Under ${formatRupees(80)}`} selected={price === 'under80'} onPress={() => setPrice(price === 'under80' ? 'any' : 'under80')} />
          <Chip label={`Under ${formatRupees(150)}`} selected={price === 'under150'} onPress={() => setPrice(price === 'under150' ? 'any' : 'under150')} />
          {haveDistances && (
            <Chip label="Under 10 min walk" selected={nearbyOnly} onPress={() => setNearbyOnly(!nearbyOnly)} />
          )}
        </ScrollView>
      </View>

      {results.length === 0 ? (
        <FoodEmptyState
          glyph="search"
          title={term ? `Nothing matches “${query.trim()}” near ${areaLabel}` : 'Nothing matches those filters'}
          body={
            term
              ? 'No kitchen around your PG cooks this. Tell us what you want and we take it to the kitchens signing up nearby.'
              : 'Loosen the price filter to see what is near you.'
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
              title={term ? 'Dishes' : 'Everything near you'}
              trailing={`${results.length} · cheapest first`}
            />
          </View>

          <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
            {results.slice(0, 12).map((dish) => {
              const kitchen = findKitchen(dish.kitchenId);
              const state = orderState(dish);
              return (
                <DishRow
                  key={dish.id}
                  dish={dish}
                  layout="feed"
                  meta={metaLine(kitchen?.name, kitchen ? walkLabel(kitchen) : null)}
                  qty={qtyOf(dish.id)}
                  onQtyChange={(next) => setDishQty(dish, next)}
                  onPress={() => router.push(foodHref.dish(dish.id))}
                  favouritable
                  disabled={!state.orderable}
                  reason={state.reason}
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
                    {metaLine(kitchen.cuisine, walkLabel(kitchen))}
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
  /* The gap is the IconButton's own — it already carries a 44pt target with
     the glyph inset in it, so a `gap` here would read as a space between the
     arrow and the field twice over. */
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  /* `flex: 1` and `minWidth: 0`: without the second, a long placeholder makes
     the field refuse to shrink and pushes the arrow off the left edge. */
  searchFieldSlot: { flex: 1, minWidth: 0 },
  kitchenRow: { flexDirection: 'row', alignItems: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
