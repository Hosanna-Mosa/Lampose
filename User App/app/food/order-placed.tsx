import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Ionicons } from '@expo/vector-icons';

import { Button, Text } from '@/components/ui';
import { foodHref } from '@/components/food/routes';
import { FOOD_EMBER } from '@/constants/tokens';
import { useFood } from '@/context/FoodContext';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';

/**
 * "Hurray! Your order is placed" — the moment an order actually goes to the
 * kitchen: paid online, placed as cash, or switched to cash after a payment
 * that did not go through.
 *
 * A burst of confetti and a check that pops in, then on to the tracking
 * screen by itself after `AUTO_CONTINUE_MS` (or at once, on the button). It
 * says only what is true — the amount, and whether it was paid or is owed at
 * the door — read from the order itself.
 *
 * Under reduced motion there is no confetti and no pop; the words are the
 * same.
 */

const AUTO_CONTINUE_MS = 3500;
const PIECES = 46;
const CONFETTI = ['#C8441E', '#FCDD44', '#0E6E5C', '#3D7BD9', '#E2584D', '#8E5BB5', '#F08A3C'];

export default function OrderPlacedScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { orders, refreshOrder } = useFood();
  const order = orders.find((entry) => entry.id === id);

  useEffect(() => {
    if (id && !order) void refreshOrder(String(id));
  }, [id, order, refreshOrder]);

  /* Once, and only forward: the order screen, with `placed` so Back from it
     goes home rather than to a checkout that is finished. */
  const left = useRef(false);
  const goToOrder = useCallback(() => {
    if (left.current || !id) return;
    left.current = true;
    const route = foodHref.order(String(id), true);
    if (from === 'order') router.dismissTo(route);
    else router.replace(route);
  }, [id, from, router]);

  useEffect(() => {
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    const timer = setTimeout(goToOrder, AUTO_CONTINUE_MS);
    return () => clearTimeout(timer);
  }, [goToOrder]);

  /* The check: pops in past full size and settles. */
  const pop = useSharedValue(reduceMotion ? 1 : 0);
  const ring = useSharedValue(0);
  const words = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    pop.value = withDelay(120, withSpring(1, { damping: 9, stiffness: 180 }));
    ring.value = withDelay(180, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    words.value = withDelay(420, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [reduceMotion, pop, ring, words]);

  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.5,
    transform: [{ scale: 1 + ring.value * 1.4 }],
  }));
  const wordsStyle = useAnimatedStyle(() => ({
    opacity: words.value,
    transform: [{ translateY: (1 - words.value) * 14 }],
  }));

  const cash = order?.paymentLabel === 'Cash on delivery';
  const amount = order ? formatRupees(order.paid) : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      {reduceMotion ? null : <Confetti />}

      <View style={[styles.centre, { padding: layout.gutter, gap: space[4] }]}>
        <View style={styles.badgeHost}>
          <Animated.View style={[styles.ring, { borderColor: FOOD_EMBER.base }, ringStyle]} />
          <Animated.View style={[styles.badge, { backgroundColor: FOOD_EMBER.base }, checkStyle]}>
            <Ionicons name="checkmark" size={60} color={FOOD_EMBER.on} />
          </Animated.View>
        </View>

        <Animated.View style={[{ alignItems: 'center', gap: space[2] }, wordsStyle]}>
          <Text variant="display1" style={[styles.centred, { color: FOOD_EMBER.base, fontSize: 34, lineHeight: 40 }]}>
            Hurray!
          </Text>
          <Text variant="title1" style={styles.centred}>
            Your order is placed
          </Text>
          <Text variant="bodyLg" color="secondary" style={styles.centred}>
            {order
              ? `${order.kitchenName} has your order and will start on it soon.`
              : 'The kitchen has your order and will start on it soon.'}
          </Text>

          {order ? (
            <View
              style={[
                styles.receipt,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.card,
                  paddingHorizontal: space[4],
                  paddingVertical: space[3],
                  marginTop: space[2],
                },
              ]}
            >
              <Text variant="caption" color="tertiary">
                {cash ? 'Pay at your door' : 'Paid online'}
              </Text>
              <Text variant="priceLg">{amount}</Text>
              <Text variant="caption" color="tertiary">
                Order {order.id}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </View>

      <View style={{ paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[2] }}>
        <Button label="Track your order" variant="food" fullWidth onPress={goToOrder} />
        <Text variant="caption" color="tertiary" style={styles.centred}>
          Taking you there in a moment…
        </Text>
      </View>
    </View>
  );
}

/* ── The blast ─────────────────────────────────────────────────────────── */

type Piece = { angle: number; distance: number; size: number; color: string; spin: number; delay: number; round: boolean };

function Confetti() {
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 2400, easing: Easing.linear }));
  }, [t]);

  /* Fixed once per mount, so a re-render does not reshuffle the burst. */
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        /* Mostly upward and outward, so gravity can bring them back down. */
        angle: -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5,
        distance: 140 + Math.random() * Math.min(width, 420) * 0.55,
        size: 6 + Math.random() * 7,
        color: CONFETTI[i % CONFETTI.length],
        spin: (Math.random() - 0.5) * 1080,
        delay: Math.random() * 0.12,
        round: i % 4 === 0,
      })),
    [width],
  );

  /* From the check mark, which sits a little above the middle. */
  const originX = width / 2;
  const originY = height * 0.36;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece, i) => (
        <ConfettiPiece key={i} piece={piece} t={t} originX={originX} originY={originY} fall={height * 0.6} />
      ))}
    </View>
  );
}

function ConfettiPiece({
  piece,
  t,
  originX,
  originY,
  fall,
}: {
  piece: Piece;
  t: SharedValue<number>;
  originX: number;
  originY: number;
  fall: number;
}) {
  const style = useAnimatedStyle(() => {
    const k = Math.max(0, Math.min(1, (t.value - piece.delay) / (1 - piece.delay)));
    /* Out fast, slowing — then gravity takes over. */
    const out = 1 - (1 - Math.min(1, k * 2.2)) ** 3;
    const x = Math.cos(piece.angle) * piece.distance * out;
    const y = Math.sin(piece.angle) * piece.distance * out + fall * k * k;
    return {
      opacity: k === 0 ? 0 : k > 0.75 ? (1 - k) / 0.25 : 1,
      transform: [
        { translateX: originX + x - piece.size / 2 },
        { translateY: originY + y - piece.size / 2 },
        { rotate: `${piece.spin * k}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: piece.size,
          height: piece.round ? piece.size : piece.size * 0.45,
          borderRadius: piece.round ? piece.size / 2 : 1,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
  badgeHost: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 104, height: 104, borderRadius: 52, borderWidth: 3 },
  receipt: { alignItems: 'center', gap: 2, borderWidth: StyleSheet.hairlineWidth, minWidth: 200 },
  piece: { position: 'absolute', left: 0, top: 0 },
});
