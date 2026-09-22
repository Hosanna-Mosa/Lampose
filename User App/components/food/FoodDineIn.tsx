import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Chip, Text } from '@/components/ui';
import { useAppState } from '@/context/AppStateContext';
import { useBottomBar } from '@/context/BottomBarContext';
import { useFood } from '@/context/FoodContext';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import { useTheme } from '@/context/ThemeContext';
import type { Kitchen } from '@/types/food';

import { foodHref } from './routes';
import { FoodEmptyState, FoodFeedSkeleton } from './FoodStates';
import { FoodNotice, FoodSectionHeader } from './FoodNotices';
import { RestaurantListCard } from './RestaurantListCard';

/**
 * Dine In — the kitchens you can walk into and eat at, right now.
 *
 * ## Why this is not Home with a filter on it
 *
 * Home answers "what shall I order?" and everything about it assumes the food
 * is coming to you: it leads with artwork and offers, it sorts by what is
 * recommended, and a kitchen that closed twenty minutes ago still has a card
 * because you can read its menu and come back tomorrow.
 *
 * Dining in is a different errand with a different failing state. You are
 * about to WALK somewhere, so two facts decide it and neither is prominent on
 * Home:
 *
 *   · is it open NOW — not "does it exist", not "does it deliver here". A
 *     closed kitchen is not a worse option for someone standing up to leave,
 *     it is not an option at all, so this screen does not list them.
 *   · how far is it on foot. Home sorts by recommendation; distance is a
 *     supporting line on a card. Here it is the ordering, because ten minutes
 *     of walking is the whole decision.
 *
 * ## Where it stops, and what is NOT wired yet
 *
 * This is the browsing half only. Tapping a kitchen opens its ordinary menu
 * page, and from there the cart and checkout run exactly as they do from Home
 * — which means the order goes out as a DELIVERY, not as something eaten at
 * the counter.
 *
 * That is not a choice this screen made, and it is now the only choice there
 * is. The app never did offer collection: `FulfilmentToggle` existed and was
 * exported, nothing rendered it, nothing called `setFulfilment`, and every
 * order this app has ever placed went out as a delivery. Pickup has since been
 * withdrawn from the product entirely — the order endpoint refuses one — so
 * the toggle is deleted and the mode is a constant.
 *
 * A true dine-in order would need the server before it meant anything:
 * `foodOrder.model.js` is `enum: ['delivery', 'pickup']`, a third value
 * reaches `foodDispatch.service.js`, the partner app and the admin console
 * before a kitchen sees it, and 'pickup' itself is now closed to new orders.
 *
 * What this screen deliberately does NOT claim, at any stage, is a table.
 * There is no reservation, no seat count and no "book" button, because a
 * booked table the kitchen never hears about is worse than no booking at all —
 * a diner standing in a doorway holding a confirmation nobody can honour.
 */

/**
 * How far somebody will walk, in the bands people actually think in.
 *
 * Not a slider. "Within 10 minutes" is a decision; "within 7 minutes" is a
 * number nobody has ever wanted. `null` is the whole list, and it is the
 * default — a student in a thin area should see what there is before being
 * asked to narrow it.
 */
const WALK_BANDS: readonly { id: string; label: string; max: number | null }[] = [
  { id: 'any', label: 'Any distance', max: null },
  { id: '5', label: 'Under 5 min', max: 5 },
  { id: '10', label: 'Under 10 min', max: 10 },
  { id: '20', label: 'Under 20 min', max: 20 },
];

export function FoodDineIn({ onHome }: { onHome: () => void }) {
  const { space, layout } = useTheme();
  const router = useRouter();
  const { locality } = useAppState();
  const { preferences } = useFood();
  const { onScroll: barScroll, height: barHeight } = useBottomBar();
  const {
    kitchensFor, kitchenOpen, menuFor, loading, error, refetch,
  } = useFoodCatalogue();

  const [band, setBand] = useState<string>('any');

  const areaLabel = locality?.name ?? 'your area';

  /* Same rule the rest of the module uses: a kitchen is pure veg by its MENU,
     not by a flag, and an empty menu is not vacuously veg. Duplicated from
     `FoodHome` rather than shared because the two screens read it at different
     moments and a helper on the catalogue is a bigger change than this
     warrants — worth lifting if a third screen needs it. */
  const isPureVeg = useCallback(
    (kitchen: Kitchen) => {
      const menu = menuFor(kitchen);
      return menu.length > 0 && menu.every((dish) => dish.diet === 'veg');
    },
    [menuFor],
  );

  const allKitchens = useMemo(() => kitchensFor(), [kitchensFor]);

  /* Open now, and nothing else. See the note at the top on why a closed
     kitchen is absent here rather than greyed out. */
  const openNow = useMemo(
    () => allKitchens.filter((kitchen) => kitchenOpen(kitchen)),
    [allKitchens, kitchenOpen],
  );

  const vegFiltered = useMemo(
    () => (preferences.vegRestaurantsOnly ? openNow.filter(isPureVeg) : openNow),
    [openNow, preferences.vegRestaurantsOnly, isPureVeg],
  );

  const maxWalk = WALK_BANDS.find((option) => option.id === band)?.max ?? null;

  /* Nearest first, always. The band narrows the list; it never reorders it,
     because "closest" is the answer to the question this screen is asking
     whichever band is on. */
  const shown = useMemo(() => {
    const list = maxWalk === null
      ? vegFiltered
      : vegFiltered.filter((kitchen) => kitchen.walkMinutes <= maxWalk);
    return [...list].sort((a, b) => a.walkMinutes - b.walkMinutes);
  }, [vegFiltered, maxWalk]);

  /* One dish to name on each card's photo — the caller's job, because the
     card must not read a menu of its own. Cheapest still on sale, which is
     the one a walk-in is most likely to be deciding on. */
  const highlightFor = useCallback(
    (kitchen: Kitchen) => {
      const menu = menuFor(kitchen).filter((dish) => !dish.soldOut);
      if (menu.length === 0) return undefined;
      return menu.reduce((cheapest, dish) => (dish.price < cheapest.price ? dish : cheapest));
    },
    [menuFor],
  );

  if (loading && allKitchens.length === 0) return <FoodFeedSkeleton />;

  if (error && allKitchens.length === 0) {
    return (
      <FoodEmptyState
        glyph="alert"
        tone="problem"
        title="Could not load kitchens"
        body="The list did not come through. Check your connection and try again."
        primaryLabel="Try again"
        onPrimary={refetch}
      />
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: space[3],
        /* The bar floats over this list, so its height is tail padding here. */
        paddingBottom: space[8] + barHeight,
        gap: space[4],
      }}
      onScroll={barScroll}
      scrollEventThrottle={16}
    >
      <View style={{ paddingHorizontal: layout.gutter, gap: space[1] }}>
        <Text variant="title2">Eat here</Text>
        <Text variant="body" color="secondary">
          {`Kitchens open right now in ${areaLabel}, nearest first. Order at the counter and eat in.`}
        </Text>
      </View>

      {/* The bands, as chips rather than a slider — see `WALK_BANDS`. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space[2], paddingHorizontal: layout.gutter }}
      >
        {WALK_BANDS.map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            selected={band === option.id}
            onPress={() => setBand(option.id)}
          />
        ))}
      </ScrollView>

      {/* Veg mode narrows this screen exactly as it narrows Home, and says so
          — a diner who set it two screens ago and finds four kitchens here
          should be told why it is four rather than left to wonder. */}
      {preferences.vegRestaurantsOnly ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <Text variant="caption" color="tertiary">
            Showing pure veg kitchens only — every dish on their menu is veg.
          </Text>
        </View>
      ) : null}

      {openNow.length === 0 ? (
        /* Nothing is open. Not a filter problem, and no filter will fix it —
           so this offers the way back to Home rather than a "clear filters"
           button that would change nothing. */
        <View style={{ paddingHorizontal: layout.gutter }}>
          <FoodEmptyState
            glyph="clock"
            title="Nothing open right now"
            body={`No kitchen in ${areaLabel} is serving at the moment. Menus are still worth a look — most open again in the morning.`}
            primaryLabel="Browse menus"
            onPrimary={onHome}
          />
        </View>
      ) : shown.length === 0 ? (
        /* Open kitchens exist, this band has none of them. The way out is the
           band, so that is what the button changes. */
        <View style={{ paddingHorizontal: layout.gutter }}>
          <FoodEmptyState
            glyph="walk"
            title="Nothing that close"
            body={`Nothing open within that walk. The nearest is ${vegFiltered.length ? `${Math.min(...vegFiltered.map((k) => k.walkMinutes))} minutes away` : 'further out'}.`}
            primaryLabel="Show any distance"
            onPrimary={() => setBand('any')}
          />
        </View>
      ) : (
        <View style={{ gap: space[3] }}>
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodSectionHeader
              title={shown.length === 1 ? '1 place open' : `${shown.length} places open`}
              trailing="nearest first"
            />
          </View>

          {shown.map((kitchen, index) => (
            <RestaurantListCard
              key={kitchen.id}
              kitchen={kitchen}
              open
              index={index}
              highlight={highlightFor(kitchen)}
              onPress={() => router.push(foodHref.kitchen(kitchen.id))}
            />
          ))}
        </View>
      )}

      {/*
        Said out loud rather than left to be discovered at the counter.

        There is no table being held, and a diner who thinks otherwise finds
        out at the worst possible moment. It sits at the BOTTOM, after the
        list, because it is a caveat about what tapping a card does — not a
        warning to be read before browsing.
      */}
      {shown.length > 0 ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <FoodNotice
            tone="info"
            title="No table is held"
            body="Ordering here books food, not a seat. Kitchens this size seat whoever walks in, so on a busy evening you may be waiting for a chair."
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
