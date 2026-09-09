import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useFood } from '@/context/FoodContext';
import { usePendingRequest } from '@/context/PendingRequestContext';

import { CartSwitchSheet } from './CartSwitchSheet';
import { foodHref } from './routes';
import { DockedCartBar } from './DockedCartBar';
import { FoodHome } from './FoodHome';
import { FoodOrders } from './FoodOrders';
import { FoodSearch } from './FoodSearch';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';

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
 * navigated exactly the way the rest of the app is, with the thumb.
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

export function FoodModule({ onBannerUnderHeader }: FoodModuleProps) {
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
          <FoodSearch />
        ) : (
          <FoodOrders onHome={() => setFoodTab('home')} />
        )}
      </View>

      {/*
        Flush against the tab bar below, not floating a gap above it. The tab
        bar already reserves the device's own safe-area inset, so this bar
        does not reserve a second one — `bottomInset={0}` — or the two would
        stack into a band of dead space neither needed.
      */}
      {count > 0 ? (
        <DockedCartBar
          count={count}
          total={itemTotal}
          context={cartContext}
          onPress={() => router.push(foodHref.cart)}
          onMeasure={measureCart}
          bottomInset={0}
        />
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
