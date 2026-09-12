import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { useStayCoupons } from '@/services';
import { useAuth } from '@/context/AuthContext';

/**
 * "You're in" — the screen a student lands on when their stay begins.
 *
 * ## Why this is a screen and not a card
 *
 * Moving in is the moment the whole product has been building towards: a
 * search, a request, an owner's yes, a payment, and a walk across a city with
 * a bag. Everything after it is admin. A line that changes colour on the
 * booking screen marks that with the same weight as a rent reminder, and the
 * one piece of news the student gets in exchange — ₹100 off their next
 * hotel — would arrive as a chip below the fold.
 *
 * ## The reward is the second thing on it, not the first
 *
 * The first is the confirmation. A screen that opens with a discount reads as
 * a promotion that happens to mention your room; a screen that opens with
 * "you have moved in" and then hands you something reads as a thank-you. The
 * order matters more than anything else here.
 *
 * ## Why the code is shown even though nothing has to type it
 *
 * The checkout resolves the coupon by id — the student never keys it in. The
 * code exists so the reward can be NAMED: in the push notification, here, and
 * in the sentence somebody says to support when it did not come off. A reward
 * you cannot refer to is one you cannot ask about.
 */
export default function MovedInScreen() {
  const { colors, space, layout, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const { id, property } = useLocalSearchParams<{ id?: string; property?: string }>();

  const { coupons, isPending } = useStayCoupons(status === 'signedIn');

  /*
   * The reward to show: the newest spendable one.
   *
   * NOT matched to this screen's booking id, and that is a deliberate
   * limitation rather than an oversight — `BackendStayCoupon` does not carry
   * `bookingId`, because the checkout resolves a coupon by its own id and has
   * never needed to know which stay earned it. The list is newest-first and a
   * move-in mints its coupon before this screen can render, so the newest
   * spendable one IS this move-in's in every case except a student who moved
   * into two places and opened the older booking's screen second.
   *
   * If that case ever matters, the fix is to project `bookingId` in
   * `stayCoupon.controller.js#toPublic` and match on it here — not to guess
   * from timestamps.
   */
  const earned = coupons.find((coupon) => coupon.spendable) ?? coupons[0] ?? null;

  useEffect(() => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: layout.gutter,
          paddingTop: insets.top + space[7],
          paddingBottom: insets.bottom + space[6],
          gap: space[5],
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── The news ─────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(320)} style={styles.centre}>
          <View
            style={[
              styles.seal,
              { backgroundColor: colors.success.tint, borderColor: colors.success.border },
            ]}
          >
            <Icon name="check" size={28} color={colors.success.ink} />
          </View>

          <Text variant="display1" style={{ textAlign: 'center', marginTop: space[4] }}>
            You have moved in
          </Text>

          <Text
            variant="bodyLg"
            color="secondary"
            style={{ textAlign: 'center', marginTop: space[2] }}
          >
            {property
              ? `Your stay at ${property} has started.`
              : 'Your stay has started.'}{' '}
            Nothing else to confirm — the owner entered your code.
          </Text>
        </Animated.View>

        {/* ── The thank-you ────────────────────────────────────────── */}
        {isPending ? null : earned ? (
          <Animated.View
            entering={FadeInDown.delay(180).duration(360).springify()}
            style={[
              styles.reward,
              {
                backgroundColor: colors.brandTint,
                borderColor: colors.success.border,
                borderRadius: radius.card,
                padding: space[4],
                gap: space[3],
              },
            ]}
          >
            <View style={{ gap: space[1] }}>
              <Text variant="eyebrow" style={{ color: colors.brandInk }}>
                A thank-you from Lampose
              </Text>
              <Text variant="display1" style={{ color: colors.brandInk }}>
                ₹{earned.amountRupees} off your next hotel
              </Text>
              <Text variant="caption" color="secondary">
                Applied at checkout the next time you book a hotel through Lampose. No minimum.
              </Text>
            </View>

            {/* The code, as a thing to take away with you.

                Not copyable, and not an input. The checkout resolves the
                coupon by id, so this is never typed anywhere — it is here to
                be READ: to recognise on the next booking's bill, and to quote
                to support if it does not come off. A copy button would imply
                somewhere to paste it. */}
            <View
              accessibilityLabel={`Your code is ${earned.code.split('').join(' ')}`}
              style={[
                styles.codeRow,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.success.border,
                  borderRadius: radius.chip,
                  paddingHorizontal: space[3],
                  paddingVertical: space[3],
                },
              ]}
            >
              <Text variant="codeHero" style={styles.code}>
                {earned.code}
              </Text>
            </View>

            <Text variant="numMeta" color="tertiary">
              Valid until {new Date(earned.expiresAt).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </Text>
          </Animated.View>
        ) : null}

        <View style={{ flex: 1 }} />

        {/* ── Out ──────────────────────────────────────────────────── */}
        <View style={{ gap: space[2] }}>
          <Button
            label="Find a hotel"
            onPress={() => router.replace('/home')}
            fullWidth
          />
          <Button
            label="Back to my booking"
            variant="ghost"
            onPress={() => (id ? router.replace(`/bookings/${id}`) : router.replace('/home'))}
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center' },
  seal: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reward: { borderWidth: StyleSheet.hairlineWidth },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
  },
  /* The gate-code face, reused: this is the other string in the product that
     exists to be read off a screen and said out loud. */
  code: { letterSpacing: 3, fontSize: 28, lineHeight: 34 },
});
