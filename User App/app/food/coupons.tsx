import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StandardHeader } from '@/components/shell';
import { FoodEmptyState } from '@/components/food';
import { useTheme } from '@/context/ThemeContext';

/**
 * Coupons, and the fact that there are none.
 *
 * ## Why this screen no longer offers anything
 *
 * Nothing in this product can take money off a food order. `PlaceOrderRequest`
 * carries no coupon field, so a code the app accepted was never sent anywhere;
 * `foodCustomerOrder.controller.js` prices the order from `food_products` and
 * `food_restaurants` and writes `discount: 0` on every row it creates. The
 * five codes this screen used to list — STUDENT20, PICKUP10, MESS175 and the
 * two greyed ones — are fixtures in `data/food.ts` that a designer wrote. One
 * of them was applied to every cart on launch without anybody tapping
 * anything, so the cart, the payment screen and the Pay button all quoted a
 * total ₹20 below what the kitchen was going to charge.
 *
 * A screen that accepts a code, congratulates somebody on a saving and then
 * hands them a bill without it is worse than one that says there is nothing
 * here. So the entry field and the offer cards are gone, and what is left is
 * the one true sentence.
 *
 * ## Why it is still reachable
 *
 * The cart still links here, deliberately. "Coupon" is the first thing a
 * student looks for on a checkout, and finding a screen that answers the
 * question is how they stop looking; finding nothing at all is how they
 * assume the code they were given failed to apply and go asking support. When
 * codes become real this is the screen they arrive on, under the same route.
 */
export default function CouponsScreen() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Coupons" onBack={() => router.back()} />

      <FoodEmptyState
        glyph="rupee"
        title="Coupon codes are not live yet"
        body="Nothing can be taken off a food order today, so there is no code to enter and none to offer. The kitchen prices what you ordered — items, its packing charge and delivery — and that total is what you pay."
        primaryLabel="Back to your order"
        onPrimary={() => router.back()}
      />
    </View>
  );
}
