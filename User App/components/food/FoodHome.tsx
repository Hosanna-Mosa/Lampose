import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useAppState } from '@/context/AppStateContext';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { dishesFor, findKitchen, kitchenOpen, kitchensFor } from '@/data/food';
import { clockLabel, findWindow, minutesUntilClose, minutesUntilOpen } from '@/types/food';
import { formatRupees } from '@/utils/money';

import { DishTile } from './DishRow';
import { foodHref } from './routes';
import { FoodEmptyState } from './FoodStates';
import { FoodNotice, FoodSectionHeader, OfferStrip } from './FoodNotices';
import { RoomTargetRow } from './Fulfilment';
import { KitchenCard } from './KitchenCard';
import { MealWindowRail, WindowStatusLine } from './MealWindowRail';
import { VegOnlyToggle } from './FoodMarks';
import { ActiveOrderCard } from './FoodStatus';

/**
 * Home — the Food module's feed.
 *
 * The reading order is the order a hungry student actually decides in:
 *
 *   1. which window am I in, and how long is it open
 *   2. where is this going — my room, or am I walking
 *   3. who is cooking right now
 *   4. what is cheap
 *
 * Nothing above the fold is a recommendation. A carousel of "chef's picks" is
 * what an app shows when it does not know where you live; this one does, so it
 * leads with the two facts that are true only for this student — their window
 * and their room.
 */
export function FoodHome({ now, onSearch }: { now: Date; onSearch: () => void }) {
  const { colors, space, layout, radius } = useTheme();
  const router = useRouter();
  const { locality } = useAppState();
  const {
    liveOrder,
    address,
    fulfilment,
    setFulfilment,
    preferences,
    setPreferences,
    browseWindow: windowId,
    setBrowseWindow: onWindowChange,
  } = useFood();

  const [dismissedOffer, setDismissedOffer] = useState(false);

  // Resolved on every render rather than stored, so a feed left open across
  // 3:30 pm re-reads the clock instead of holding yesterday's answer.
  const activeWindow = findWindow(windowId);
  const closesIn = minutesUntilClose(activeWindow, now);
  const opensIn = minutesUntilOpen(activeWindow, now);
  const areaLabel = locality?.name ?? 'your area';

  const kitchens = useMemo(() => kitchensFor(windowId), [windowId]);
  const openKitchens = kitchens.filter((kitchen) => kitchenOpen(kitchen, windowId));

  const dishes = useMemo(() => {
    const inWindow = dishesFor(windowId);
    return preferences.vegOnly ? inWindow.filter((dish) => dish.diet === 'veg') : inWindow;
  }, [windowId, preferences.vegOnly]);

  const cheap = dishes.filter((dish) => dish.price <= 100 && !dish.soldOut).slice(0, 6);
  const popular = [...dishes]
    .filter((dish) => dish.ordersInBlock)
    .sort((a, b) => (b.ordersInBlock ?? 0) - (a.ordersInBlock ?? 0))
    .slice(0, 6);

  const openKitchen = (id: string) => router.push(foodHref.kitchen(id));
  const openDish = (id: string) => router.push(foodHref.dish(id));

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: space[2], paddingBottom: space[8], gap: space[4] }}
    >
      {/* 1 — the clock */}
      <View style={{ gap: space[2] }}>
        <MealWindowRail now={now} value={windowId} onChange={onWindowChange} />
        <View style={{ paddingHorizontal: layout.gutter }}>
          <WindowStatusLine window={activeWindow} now={now} kitchenCount={openKitchens.length} />
        </View>
      </View>

      {/* 2 — where it goes. Above the feed, because it changes every price on it. */}
      <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
        <RoomTargetRow
          address={address}
          fulfilment={fulfilment}
          onChange={setFulfilment}
        />

        <Pressable
          onPress={onSearch}
          accessibilityRole="search"
          accessibilityLabel="Search dishes, kitchens"
          style={({ pressed }) => [
            styles.searchRow,
            {
              backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
              borderColor: colors.borderInput,
              borderRadius: radius.button,
              paddingHorizontal: space[3] + 2,
              gap: space[3],
            },
          ]}
        >
          <Icon name="search" size={20} color={colors.textTertiary} />
          <Text variant="body" color="tertiary" style={{ flex: 1 }} numberOfLines={1}>
            {`Search ${activeWindow.label.toLowerCase()} near ${areaLabel}`}
          </Text>
          <Icon name="chevronRight" size={16} color={colors.textTertiary} />
        </Pressable>

        <View style={styles.filterRow}>
          <VegOnlyToggle
            value={preferences.vegOnly}
            onChange={(value) => setPreferences({ vegOnly: value })}
          />
          {preferences.vegOnly ? (
            <Text variant="caption" color="tertiary" style={{ flex: 1 }} numberOfLines={2}>
              Non-veg dishes are hidden while this is on.
            </Text>
          ) : null}
        </View>
      </View>

      {/* The order in flight, mirrored here so it is not something you have to
          go looking for. Orders holds the full version. */}
      {liveOrder ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <ActiveOrderCard
            order={liveOrder}
            headline={
              liveOrder.fulfilment === 'pickup'
                ? 'Waiting at the counter'
                : `Arriving at ${address.title}`
            }
            detail={`${liveOrder.kitchenName} · ${liveOrder.lines.map((line) => line.name).join(', ')}`}
            actionLabel="Track order"
            onPress={() => router.push(foodHref.order(liveOrder.id))}
          />
        </View>
      ) : null}

      {/* The window's own state, when it is not simply open */}
      {closesIn === null ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <FoodNotice
            tone="info"
            title={`${activeWindow.label} opens at ${clockLabel(activeWindow.startMinute)}`}
            body={
              opensIn < 240
                ? `In about ${opensIn} minutes. Browse now and order the moment it opens — the cart survives the wait.`
                : 'Browse the menu now. Ordering opens with the window.'
            }
          />
        </View>
      ) : closesIn <= 30 ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <FoodNotice
            tone="deadline"
            title={`${activeWindow.label} closes at ${clockLabel(activeWindow.endMinute)}`}
            body={`Place an order in the next ${closesIn} minutes or it moves to the next window.`}
          />
        </View>
      ) : null}

      {/* One offer strip per screen. Never two. */}
      {!dismissedOffer ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <OfferStrip
            headline="₹20 off"
            body={`Student price on any ${activeWindow.label.toLowerCase()} over ${formatRupees(99)}, from every kitchen near you.`}
            onDismiss={() => setDismissedOffer(true)}
          />
        </View>
      ) : null}

      {/* 3 — who is cooking */}
      <View style={{ gap: space[2] }}>
        <View style={{ paddingHorizontal: layout.gutter }}>
          <FoodSectionHeader
            title={`Kitchens near ${areaLabel}`}
            trailing={`${openKitchens.length} of ${kitchens.length} cooking`}
          />
        </View>

        <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
          {kitchens.map((kitchen) => {
            const open = kitchenOpen(kitchen, windowId) && closesIn !== null;
            const nextWindow = kitchen.windows[0];
            return (
              <KitchenCard
                key={kitchen.id}
                kitchen={kitchen}
                locality={areaLabel}
                window={activeWindow}
                now={now}
                open={open}
                reopensAt={open ? undefined : clockLabel(findWindow(nextWindow).startMinute)}
                onPress={() => openKitchen(kitchen.id)}
              />
            );
          })}
        </View>
      </View>

      {/* 4 — what is cheap. A rail, because this is browsing rather than deciding. */}
      {cheap.length ? (
        <View style={{ gap: space[2] }}>
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodSectionHeader
              title={preferences.vegOnly ? `Under ${formatRupees(100)}, veg` : `Under ${formatRupees(100)}`}
              trailing={`${cheap.length} dishes`}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: space[2] }}
          >
            {cheap.map((dish) => (
              <DishTile
                key={dish.id}
                dish={dish}
                kitchenName={findKitchen(dish.kitchenId)?.name ?? ''}
                onPress={() => openDish(dish.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {popular.length ? (
        <View style={{ gap: space[2] }}>
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodSectionHeader title="Ordered most in your building" trailing="this week" />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: space[2] }}
          >
            {popular.map((dish) => (
              <DishTile
                key={dish.id}
                dish={dish}
                kitchenName={findKitchen(dish.kitchenId)?.name ?? ''}
                onPress={() => openDish(dish.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Veg-only can empty a whole window. Say which filter did it. */}
      {dishes.length === 0 ? (
        <FoodEmptyState
          title={`No veg ${activeWindow.label.toLowerCase()} near you`}
          body={`Every kitchen cooking this window is non-veg today. Turning veg-only off shows ${dishesFor(windowId).length} dishes.`}
          primaryLabel="Show everything"
          onPrimary={() => setPreferences({ vegOnly: false })}
          secondaryLabel="Try another window"
          onSecondary={() => onWindowChange('dinner')}
        />
      ) : null}

      <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
        <Pressable
          onPress={() => router.push(foodHref.favourites)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.link,
            {
              backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
              borderColor: colors.border,
              borderRadius: radius.card,
              padding: space[3],
              gap: space[3],
            },
          ]}
        >
          <Icon name="bookmark" size={20} color={colors.brandInk} />
          <View style={{ flex: 1 }}>
            <Text variant="title3">Favourites</Text>
            <Text variant="caption" color="tertiary">
              The dishes you order again
            </Text>
          </View>
          <Icon name="chevronRight" size={16} color={colors.textTertiary} />
        </Pressable>

        <Pressable
          onPress={() => router.push(foodHref.preferences)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.link,
            {
              backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
              borderColor: colors.border,
              borderRadius: radius.card,
              padding: space[3],
              gap: space[3],
            },
          ]}
        >
          <Icon name="filters" size={20} color={colors.brandInk} />
          <View style={{ flex: 1 }}>
            <Text variant="title3">Food preferences</Text>
            <Text variant="caption" color="tertiary" numberOfLines={1}>
              {preferences.diet === 'veg' ? 'Veg' : preferences.diet === 'egg' ? 'Veg and egg' : 'Everything'} ·{' '}
              {preferences.spice} spice · {preferences.allergens.length} flagged
            </Text>
          </View>
          <Icon name="chevronRight" size={16} color={colors.textTertiary} />
        </Pressable>
      </View>

      {/*
        The honest footer.
        Two admissions, deliberately quiet rather than a red banner at the top:
        every ready time on this screen is the kitchen's own estimate, and the
        catalogue behind it is mock data behind the `dev` gate. A student on a
        production build never reaches this screen at all.
      */}
      <Text variant="numMeta" color="tertiary" style={{ paddingHorizontal: layout.gutter }}>
        Ready times are the kitchen&apos;s estimate · dev build, mock catalogue (EXPO_PUBLIC_FOOD_MODE)
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderWidth: 1.5 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  link: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
});
