import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBottomBar } from '@/context/BottomBarContext';
import { useFood } from '@/context/FoodContext';
import { usePendingRequest } from '@/context/PendingRequestContext';

import { CartSwitchSheet } from './CartSwitchSheet';
import { foodHref } from './routes';
import { DockedCartBar } from './DockedCartBar';
import { FoodDineIn } from './FoodDineIn';
import { FoodHome } from './FoodHome';
import { FoodOrders } from './FoodOrders';
import { FoodSearch } from './FoodSearch';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';

/**
 * The Food module, inside the Food tab.
 *
 * Four screens now: Home, Orders, Dine In and Search. Food settings,
 * favourites and the order detail are all pushes, so the module never grows a
 * navigation layer of its own.
 *
 * They do NOT get a control of their own at the top of the screen. While Food
 * is open the app's one bottom bar becomes the food bar — Home, Orders, Dine
 * In, and the raised Explore disc back to the stay side — so the module is
 * navigated exactly the way the rest of the app is, with the thumb.
 *
 * ## Search is a screen that is not a tab
 *
 * The bar carries three destinations and the disc, and Dine In took the slot
 * Search had. That is a change of DOOR, not of status: search is still one of
 * this module's screens, still mounted here, and still reached in one tap from
 * the field across the top of Home — which is where somebody who wants to
 * search is already looking.
 *
 * The consequence that has to be paid for explicitly is the way OUT. Every
 * other screen here is a tab, so the bar is its own escape; Search is not, so
 * it is handed an `onBack` and draws a control for it. Without that a diner
 * who taps the field is on a screen with no exit but the Explore disc, which
 * leaves the module altogether.
 *
 * The clock is read ONCE, here, and passed down. Every child that needs to know
 * whether a kitchen is open reads the same `now`.
 */
export type FoodModuleProps = {
  /** Reports whether Home's banner is still behind the app header, so the
   *  screen above can paint that header over artwork or as an ordinary bar.
   *  Only Home has a banner; the other two screens never fire it. */
  onBannerUnderHeader?: (under: boolean) => void;
};

function FoodModuleImpl({ onBannerUnderHeader }: FoodModuleProps) {
  const { findKitchen } = useFoodCatalogue();
  const router = useRouter();
  const {
    count,
    itemTotal,
    foodTab,
    setFoodTab,
    address,
    fulfilment,
    kitchenId,
    pendingAdd,
    confirmSwitch,
    cancelSwitch,
    lines,
  } = useFood();
  const { reserveBottom, releaseBottom } = usePendingRequest();
  /*
   * The cart bar rides on the tab bar.
   *
   * The tab bar floats over the screen now, so this one sits `barHeight` up
   * from the bottom edge to stand on it rather than behind it — and when the
   * tab bar slides away, this comes down the same distance to take its place.
   * Anything else leaves the cart hovering over a gap where the bar used to
   * be, which reads as a bar that failed to move rather than as one that
   * chose not to.
   */
  const { hidden, height: barHeight } = useBottomBar();
  const insets = useSafeAreaInsets();
  /* Not the bar's full height: part of that height IS the device's own bottom
     inset, and the gesture bar does not go away when the tab bar does. Drop by
     everything above the inset and the cart lands where the tab bar's own
     content sat, still clear of the hardware. */
  const cartDrop = Math.max(0, barHeight - insets.bottom);
  const cartSlide = useAnimatedStyle(() => ({
    transform: [{ translateY: hidden.value * cartDrop }],
  }));

  /*
   * One clock reading per minute, shared by the whole module.
   *
   * A `new Date()` per component would let the rail and the cart bar land on
   * opposite sides of 3:30 pm in the same frame. A minute is fine: nothing here
   * counts seconds, and a ticking second hand on a feed is a wake-up every
   * second on hardware that cannot afford it.
   */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const kitchen = kitchenId ? findKitchen(kitchenId) : undefined;

  /*
   * The docked cart bar claims the bottom edge while it is up, so the floating
   * request pill and the snackbar sit above it rather than on it. Same registry
   * the tab bar uses — the largest claim wins, and a claimant may only withdraw
   * its own.
   */
  const measureCart = useCallback(
    (height: number) => reserveBottom('foodCart', height),
    [reserveBottom],
  );
  useEffect(() => {
    if (count === 0) releaseBottom('foodCart');
    return () => releaseBottom('foodCart');
  }, [count, releaseBottom]);

  const cartContext =
    fulfilment === 'pickup' ? `pickup · ${kitchen?.name ?? 'counter'}` : (address?.title ?? 'no address yet');

  return (
    <View style={styles.host}>
      <View style={styles.body}>
        {foodTab === 'home' ? (
          <FoodHome
            onSearch={() => setFoodTab('search')}
            onBannerUnderHeader={onBannerUnderHeader}
          />
        ) : foodTab === 'search' ? (
          <FoodSearch onBack={() => setFoodTab('home')} />
        ) : foodTab === 'dinein' ? (
          <FoodDineIn onHome={() => setFoodTab('home')} />
        ) : (
          <FoodOrders onHome={() => setFoodTab('home')} />
        )}
      </View>

      {/*
        Flush against the tab bar, not floating a gap above it. The tab bar
        no longer sits in the column below this one — it floats over the whole
        screen — so the gap it used to occupy has to be paid for here instead:
        `bottomInset={barHeight}` is exactly the room the bar takes, safe-area
        inset included, which is why it is read rather than guessed.
      */}
      {count > 0 ? (
        <Animated.View style={cartSlide}>
          <DockedCartBar
            count={count}
            total={itemTotal}
            context={cartContext}
            onPress={() => router.push(foodHref.cart)}
            onMeasure={measureCart}
            bottomInset={barHeight}
          />
        </Animated.View>
      ) : null}

      <CartSwitchSheet
        pending={pendingAdd}
        currentKitchenName={kitchen?.name}
        lineCount={lines.length}
        lineTotal={itemTotal}
        onConfirm={confirmSwitch}
        onCancel={cancelSwitch}
      />
    </View>
  );
}

/**
 * Memoised, and for one specific reason.
 *
 * The app bar above this module repaints itself when Home's feed scrolls past
 * the top — `onBannerUnderHeader` sets state on the SCREEN, which re-renders
 * everything that screen owns. Without this, "everything" includes the entire
 * food feed: fifteen kitchen cards, two dish rails and the cuisine rail, all
 * reconciled before the bar's new colour reaches the glass. That delay is
 * visible, and what it looks like is a bar taking its time to stick.
 *
 * The one prop is `setBannerUnderHeader` itself, whose identity React
 * guarantees is stable, so this bails out on every one of those renders and
 * the bar repaints on its own.
 */
export const FoodModule = React.memo(FoodModuleImpl);

const styles = StyleSheet.create({
  host: { flex: 1 },
  body: { flex: 1 },
});
