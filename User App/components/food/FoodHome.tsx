import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useAppState } from '@/context/AppStateContext';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { clockLabel, findWindow, minutesUntilClose, minutesUntilOpen } from '@/types/food';
import { formatRupees } from '@/utils/money';

import { DishTile } from './DishRow';
import { foodHref } from './routes';
import { FoodEmptyState, FoodFeedSkeleton } from './FoodStates';
import { FoodNotice, FoodSectionHeader, OfferStrip } from './FoodNotices';
import { RoomTargetRow } from './Fulfilment';
import { KitchenCard } from './KitchenCard';
import { MealWindowRail, WindowStatusLine } from './MealWindowRail';
import { VegOnlyToggle } from './FoodMarks';
import { ActiveOrderCard } from './FoodStatus';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';

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
  const {
    dishesFor,
    findKitchen,
    kitchenOpen,
    kitchensFor,
    loading,
    loadingMenus,
    error,
    refetch,
  } = useFoodCatalogue();
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

  /* Both of these depend on the catalogue as well as on the window: the
     helpers are rebuilt whenever rows arrive, so leaving them out of the
     dependencies froze the feed at whatever was loaded on the first render —
     which, on a cold start, is nothing at all. */
  const kitchens = useMemo(() => kitchensFor(windowId), [kitchensFor, windowId]);
  const openKitchens = kitchens.filter((kitchen) => kitchenOpen(kitchen, windowId));

  const dishes = useMemo(() => {
    const inWindow = dishesFor(windowId);
    return preferences.vegOnly ? inWindow.filter((dish) => dish.diet === 'veg') : inWindow;
  }, [dishesFor, windowId, preferences.vegOnly]);

  /*
   * Three quiet screens that are not the same screen.
   *
   * Nothing has arrived yet; the request failed; or no kitchen near this
   * student has been approved. Only the middle one is worth retrying, only the
   * last one is about kitchens rather than about the network, and the first
   * one is not a state at all — it is a wait, and it gets the layout it is
   * about to become rather than a sentence apologising for itself.
   */
  if (loading && kitchens.length === 0) return <FoodFeedSkeleton />;

  if (error && kitchens.length === 0) {
    return (
      <FoodEmptyState
        tone="problem"
        title="Could not load what is cooking"
        body="Nothing is wrong with your account or an order you have placed — the kitchen feed did not answer. It is usually the connection."
        primaryLabel="Try again"
        onPrimary={refetch}
        footnote={error}
      />
    );
  }

  if (kitchens.length === 0) {
    return (
      <FoodEmptyState
        title={`No kitchen near ${areaLabel} yet`}
        body="A kitchen appears here the day it is approved, and none near you has been. Nothing is hidden behind a filter — there is genuinely nobody cooking on LAMPOSE here."
        primaryLabel="Check again"
        onPrimary={refetch}
      />
    );
  }

  const unfiltered = dishesFor(windowId).length;
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
        {/* The row says "tap to pick where your food goes", so it goes there.
            The address screen is also where a diner with an address already
            set changes it, which is the other half of the same tap. */}
        <RoomTargetRow
          address={address}
          fulfilment={fulfilment}
          onChange={setFulfilment}
          onPress={() => router.push(foodHref.address)}
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
                : address ? `Arriving at ${address.title}` : 'Arriving soon'
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

      {/* A refresh that did not get through, over rows that did. The kitchens
          below are still worth reading; whether they are cooking and what they
          charge may have moved since, and that is worth one line and a retry
          rather than a screen the student cannot get past. */}
      {error ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <FoodNotice
            tone="problem"
            title="This feed is not current"
            body="The last refresh did not reach us, so prices and who is open may have changed."
            actionLabel="Try again"
            onAction={refetch}
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
                favouritable
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

      {/*
        An empty dish rail has three causes and only one of them is the veg
        filter. Blaming the filter for a menu that has not arrived sends a
        student to turn off a setting that was never the problem, and blaming
        it on a window nobody cooks sends them nowhere at all.
      */}
      {dishes.length === 0 ? (
        loadingMenus ? (
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodNotice
              tone="info"
              title="Reading the menus"
              body={`${kitchens.length} ${kitchens.length === 1 ? 'kitchen is' : 'kitchens are'} listed near you. What each of them is cooking is still arriving.`}
            />
          </View>
        ) : preferences.vegOnly && unfiltered > 0 ? (
          <FoodEmptyState
            title={`No veg ${activeWindow.label.toLowerCase()} near you`}
            body={`Every kitchen cooking this window is non-veg today. Turning veg-only off shows ${unfiltered} dishes.`}
            primaryLabel="Show everything"
            onPrimary={() => setPreferences({ vegOnly: false })}
            secondaryLabel="Try another window"
            onSecondary={() => onWindowChange('dinner')}
          />
        ) : (
          <FoodEmptyState
            title={`No ${activeWindow.label.toLowerCase()} on any menu near you`}
            body={`${kitchens.length} ${kitchens.length === 1 ? 'kitchen is' : 'kitchens are'} listed near ${areaLabel} and none of them cooks this window. Another window is usually busier.`}
            primaryLabel="Try another window"
            onPrimary={() => onWindowChange('dinner')}
          />
        )
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
