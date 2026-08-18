import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useFood } from '@/context/FoodContext';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useTheme } from '@/context/ThemeContext';
import { findKitchen } from '@/data/food';
import { findWindow } from '@/types/food';

import { CartSwitchSheet } from './CartSwitchSheet';
import { foodHref } from './routes';
import { DockedCartBar } from './DockedCartBar';
import { FoodHome } from './FoodHome';
import { FoodOrders } from './FoodOrders';
import { FoodSearch } from './FoodSearch';

/**
 * The Food module, inside the Food tab.
 *
 * Three screens and no fourth. Home, Search and Orders are the whole surface;
 * food settings, favourites and the order detail are all pushes, so the module
 * never grows a navigation layer of its own.
 *
 * The three do NOT get a control of their own at the top of the screen. While
 * Food is open the app's one bottom bar becomes the food bar — Home, Search,
 * Orders, and the raised Explore disc back to the stay side — so the module is
 * navigated exactly the way the rest of the app is, with the thumb, and the
 * top of the screen is left for the meal window, which is the thing that
 * actually changes what is on it.
 *
 * The clock is read ONCE, here, and passed down. Every child that needs to know
 * whether lunch is open reads the same `now`, so a feed cannot disagree with
 * the cart bar sitting under it about what time it is.
 */
export function FoodModule() {
  const { space } = useTheme();
  const router = useRouter();
  const {
    count,
    itemTotal,
    window,
    browseWindow,
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

  /*
   * The bar names the CART's window, not the one being browsed.
   *
   * A student can read the dinner menu at 2 pm with a lunch cart already built;
   * renaming that cart "Dinner" because they looked ahead would be a lie about
   * what is going to be cooked.
   */
  const cartWindow = findWindow(window ?? browseWindow);
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

  const cartContext = useMemo(
    () =>
      [
        cartWindow.label,
        fulfilment === 'pickup' ? `pickup · ${kitchen?.name ?? 'counter'}` : address.title,
      ].join(' · '),
    [cartWindow.label, fulfilment, kitchen?.name, address.title],
  );

  return (
    <View style={styles.host}>
      <View style={styles.body}>
        {foodTab === 'home' ? (
          <FoodHome now={now} onSearch={() => setFoodTab('search')} />
        ) : foodTab === 'search' ? (
          <FoodSearch now={now} />
        ) : (
          <FoodOrders onHome={() => setFoodTab('home')} />
        )}
      </View>

      {/*
        The cart bar clears the raised Explore disc rather than sitting under it.
        The disc is punched 26pt through the top edge of the bar below, so a
        full-width bar tucked right against that edge would have its "View cart"
        target hidden behind the disc.
      */}
      {count > 0 ? (
        <View style={{ paddingBottom: space[7] }}>
          <DockedCartBar
            count={count}
            total={itemTotal}
            context={cartContext}
            onPress={() => router.push(foodHref.cart)}
            onMeasure={measureCart}
          />
        </View>
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

const styles = StyleSheet.create({
  host: { flex: 1 },
  body: { flex: 1 },
});
