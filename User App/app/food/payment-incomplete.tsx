import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button, Spinner, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { FoodNotice } from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { COD_LIMIT_RUPEES } from '@/constants/food';
import { useFood } from '@/context/FoodContext';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import { FOOD_EMBER } from '@/constants/tokens';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { useBottomEdgeInset } from '@/hooks/useActionBarInset';
import { formatRupees } from '@/utils/money';

/**
 * "Oh no! Payment failed" — where the checkout lands when the browser closes
 * on an order the server still has as unpaid.
 *
 * Cash on delivery leads whenever it is on offer ("you can still order it via
 * COD"), because a student whose UPI just failed usually wants dinner more
 * than a second attempt at the same app; retrying online is right beside it.
 *
 * It used to go straight to the order's tracking screen, which read as the
 * order going through. Nothing has: the order is HELD — priced, but the
 * kitchen has not been told and nothing was charged — so this says that and
 * offers the three ways on: pay online again, pay the rider in cash instead
 * (only up to `COD_LIMIT_RUPEES`, and only at a kitchen that takes cash), or
 * cancel it. Left alone, the server cancels a held order after 30 minutes.
 *
 * It re-reads the order first, because closing the browser is not evidence
 * either way: a payment approved in a UPI app can land after the browser shut.
 * If it has, this screen never shows — it goes on to the order.
 */
export default function PaymentIncompleteScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const actionInset = useBottomEdgeInset();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, refreshOrder, startPayment, payOrderInCash, cancelOrder } = useFood();
  const { findKitchen } = useFoodCatalogue();

  const order = orders.find((entry) => entry.id === id);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState<'online' | 'cash' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReduceMotion();
  /* One action at a time, whatever a double tap does to `busy`'s render. */
  const acting = useRef(false);

  const check = useCallback(async () => {
    if (!id) return;
    setChecking(true);
    await refreshOrder(String(id));
    setChecking(false);
  }, [id, refreshOrder]);

  useEffect(() => {
    void check();
  }, [check]);

  /* Paid after all, or already a cash order: this screen has nothing to say. */
  const settled = order?.paymentLabel === 'Paid online' || order?.paymentLabel === 'Cash on delivery';
  useEffect(() => {
    if (settled && id) router.replace(foodHref.orderPlaced(String(id)));
  }, [settled, id, router]);

  const shown = !!order && !settled;
  const pop = useSharedValue(reduceMotion ? 1 : 0);
  const shake = useSharedValue(0);
  useEffect(() => {
    if (!shown || reduceMotion) return;
    pop.value = withSpring(1, { damping: 10, stiffness: 170 });
    shake.value = withDelay(
      380,
      withSequence(
        withTiming(-1, { duration: 70 }),
        withTiming(1, { duration: 90 }),
        withTiming(-0.7, { duration: 90 }),
        withTiming(0.5, { duration: 90 }),
        withTiming(0, { duration: 110, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [shown, reduceMotion, pop, shake]);
  const artStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { translateX: shake.value * 8 }, { rotate: `${shake.value * 4}deg` }],
  }));

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const run = async (kind: 'online' | 'cash' | 'cancel', action: () => Promise<void>) => {
    if (acting.current) return;
    acting.current = true;
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error)?.message || 'That did not go through. Please try again.');
      /* Whatever it was refused for — paid meanwhile, expired — the order
         itself says it now. */
      void check();
    } finally {
      acting.current = false;
      setBusy(null);
    }
  };

  const payAgain = () =>
    run('online', async () => {
      const intent = await startPayment(String(id));
      if (intent.alreadyPaid) {
        await refreshOrder(String(id));
        return;
      }
      if (!intent.checkoutToken) throw new Error('Online payment is not available right now.');
      router.replace({ pathname: '/pay/checkout', params: { foodToken: intent.checkoutToken, orderNumber: String(id) } });
    });

  const payInCash = () =>
    run('cash', async () => {
      await payOrderInCash(String(id));
      router.replace(foodHref.orderPlaced(String(id)));
    });

  const cancel = () =>
    run('cancel', async () => {
      await cancelOrder(String(id), 'Payment not completed');
      /* The cart is still there — nothing was bought — so back to it. */
      router.replace(foodHref.cart);
    });

  const header = <StandardHeader title="Payment" onBack={leave} />;

  if (!order && !checking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        {header}
        <View style={[styles.centre, { gap: space[3], padding: layout.gutter }]}>
          <Text variant="title2" style={styles.centred}>
            We could not check this payment
          </Text>
          <Text variant="bodyLg" color="secondary" style={styles.centred}>
            Check your connection. Nothing is charged until the payment is completed.
          </Text>
          <Button label="Check again" variant="food" onPress={() => void check()} />
        </View>
      </View>
    );
  }

  if (!order || settled) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        {header}
        <View style={[styles.centre, { gap: space[3], padding: layout.gutter }]}>
          <Spinner />
          <Text variant="bodyLg" color="secondary" style={styles.centred}>
            Checking your payment…
          </Text>
        </View>
      </View>
    );
  }

  const closed = order.status === 'cancelled' || order.status === 'rejected';
  const kitchen = findKitchen(order.kitchenId);
  const kitchenTakesCash = kitchen?.acceptsCod !== false;
  const underLimit = order.paid <= COD_LIMIT_RUPEES;
  const canCash = !closed && kitchenTakesCash && underLimit;
  const noCashReason = !kitchenTakesCash
    ? `${order.kitchenName} does not take cash on delivery, so this one has to be paid online.`
    : `Cash on delivery is only for orders up to ${formatRupees(COD_LIMIT_RUPEES)}, so this one has to be paid online.`;
  const amount = formatRupees(order.paid);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {header}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, gap: space[4], paddingBottom: space[8], flexGrow: 1 }}
      >
        {/* The picture and the words. */}
        <View style={[styles.hero, { gap: space[2], paddingTop: space[6] }]}>
          <Animated.View style={[styles.art, artStyle]}>
            <View style={[styles.artDisc, { backgroundColor: colors.danger.tint }]}>
              <Ionicons name={closed ? 'time-outline' : 'card-outline'} size={56} color={colors.danger.base} />
            </View>
            <View style={[styles.artBadge, { backgroundColor: colors.danger.base, borderColor: colors.bg }]}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </View>
          </Animated.View>

          <Text variant="display1" style={[styles.centred, { color: colors.danger.base, fontSize: 30, lineHeight: 36, marginTop: space[3] }]}>
            Oh no!
          </Text>
          <Text variant="title1" style={styles.centred}>
            {closed ? 'This order has expired' : 'Payment failed'}
          </Text>
          <Text variant="bodyLg" color="secondary" style={styles.centred}>
            {closed
              ? `It was not paid for in time, so ${order.kitchenName} never received it. Nothing was charged and your cart is still there.`
              : `Don't worry — nothing was charged. ${order.kitchenName} hasn't received this order yet.`}
          </Text>

          <View
            style={[
              styles.chip,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, marginTop: space[2] },
            ]}
          >
            <Text variant="caption" color="tertiary">
              Order {order.id}
            </Text>
            <Text variant="caption" color="tertiary">
              ·
            </Text>
            <Text variant="title3">{amount}</Text>
          </View>
        </View>

        {/* The way out that still gets dinner. */}
        {!closed ? (
          canCash ? (
            <View
              style={[
                styles.cod,
                {
                  backgroundColor: mode === 'dark' ? colors.surface : '#FFF3EE',
                  borderColor: FOOD_EMBER.base,
                  borderRadius: radius.card,
                  padding: space[4],
                  gap: space[3],
                },
              ]}
            >
              <View style={[styles.codIcon, { backgroundColor: FOOD_EMBER.base, borderRadius: radius.pill }]}>
                <Ionicons name="cash-outline" size={22} color={FOOD_EMBER.on} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="title3">You can still order it via COD</Text>
                <Text variant="caption" color="secondary">
                  Pay {amount} in cash to the rider at your door. Your order goes to {order.kitchenName} right away.
                </Text>
              </View>
            </View>
          ) : (
            <Text variant="caption" color="tertiary" style={styles.centred}>
              {noCashReason}
            </Text>
          )
        ) : null}

        {error ? <FoodNotice tone="problem" title="We could not do that" body={error} /> : null}

        {/* A UPI app can approve the payment a moment after the browser shut. */}
        {!closed ? (
          <Pressable
            accessibilityRole="button"
            disabled={checking || busy !== null}
            onPress={() => void check()}
            style={{ alignSelf: 'center', paddingVertical: space[1] }}
          >
            <Text variant="caption" style={{ color: colors.brandInk }}>
              {checking ? 'Checking…' : 'Already paid? Check again'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: space[6] + actionInset,
            gap: space[2],
          },
        ]}
      >
        {closed ? (
          <Button label="Back to cart" variant="food" fullWidth onPress={() => router.replace(foodHref.cart)} />
        ) : (
          <>
            {canCash ? (
              <>
                <Button
                  label={`Order via COD · ${amount}`}
                  variant="food"
                  fullWidth
                  loading={busy === 'cash'}
                  loadingLabel="Sending to the kitchen"
                  disabled={busy !== null}
                  onPress={payInCash}
                />
                <Button
                  label="Retry payment"
                  variant="secondary"
                  fullWidth
                  loading={busy === 'online'}
                  loadingLabel="Opening your payment"
                  disabled={busy !== null}
                  onPress={payAgain}
                />
              </>
            ) : (
              <Button
                label={`Retry payment · ${amount}`}
                variant="food"
                fullWidth
                loading={busy === 'online'}
                loadingLabel="Opening your payment"
                disabled={busy !== null}
                onPress={payAgain}
              />
            )}
            <Pressable
              accessibilityRole="button"
              disabled={busy !== null}
              onPress={cancel}
              style={{ alignSelf: 'center', paddingVertical: space[2] }}
            >
              <Text variant="bodyStrong" color="secondary">
                {busy === 'cancel' ? 'Cancelling…' : 'Cancel this order'}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
  hero: { alignItems: 'center' },
  art: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  artDisc: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  /* The red "×" on the card, ringed in the page colour so it sits ON the disc. */
  artBadge: {
    position: 'absolute',
    right: 10,
    bottom: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cod: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5 },
  codIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
