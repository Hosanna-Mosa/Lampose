import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text, TextField } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { FoodSectionHeader } from '@/components/food';
import { COUPONS, findCoupon } from '@/data/food';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import type { Coupon } from '@/types/food';
import { formatRupees } from '@/utils/money';

/**
 * Coupons.
 *
 * Every coupon states its condition in the same sentence as its saving, and a
 * coupon that cannot run keeps its card with the reason on it — "Add ₹40 more",
 * "After 11 pm", "Already used". A greyed card that says why is a coupon a
 * student can act on; a hidden one is a coupon they will ask support about.
 *
 * They do not stack, and the card that refuses says which one it refuses with.
 */
export default function CouponsScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const router = useRouter();
  const { itemTotal, coupon, applyCoupon, fulfilment, discount } = useFood();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const found = findCoupon(code);
    if (!found) {
      setError(`${code.trim().toUpperCase()} is not a valid code. Check the spelling, or pick a coupon below.`);
      return;
    }
    if (found.blockedReason) {
      setError(`${found.code} is not usable yet — ${found.blockedReason.toLowerCase()}.`);
      return;
    }
    if (itemTotal < found.minimum) {
      setError(`${found.code} needs an item total of ${formatRupees(found.minimum)}. You are at ${formatRupees(itemTotal)}.`);
      return;
    }
    setError(null);
    applyCoupon(found.code);
    router.back();
  };

  const usable = COUPONS.filter(
    (entry) => !entry.blockedReason && itemTotal >= entry.minimum && (!entry.pickupOnly || fulfilment === 'pickup'),
  );
  const notYet = COUPONS.filter((entry) => !usable.includes(entry));

  const blockedLabel = (entry: Coupon): string => {
    if (entry.blockedReason) return entry.blockedReason;
    if (itemTotal < entry.minimum) return `Add ${formatRupees(entry.minimum - itemTotal)} more`;
    if (entry.pickupOnly) return 'Pickup only';
    return 'Not now';
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Coupons" onBack={() => router.back()} />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[4] }}
      >
        <View style={{ gap: space[2] }}>
          <View style={[styles.entry, { gap: space[2] }]}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Have a code"
                value={code}
                onChangeText={(next) => {
                  setCode(next.toUpperCase());
                  setError(null);
                }}
                autoCapitalize="characters"
                placeholder="STUDENT20"
                error={error ?? undefined}
              />
            </View>
            <Button label="Apply" onPress={submit} disabled={code.trim().length === 0} style={{ marginTop: 22 }} />
          </View>
        </View>

        <View style={{ gap: space[2] }}>
          <FoodSectionHeader title="Usable on this order" trailing={`${usable.length}`} />
          {usable.map((entry) => {
            const applied = coupon?.code === entry.code;
            return (
              <Pressable
                key={entry.code}
                onPress={() => {
                  applyCoupon(applied ? null : entry.code);
                  if (!applied) router.back();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: applied }}
                style={[
                  {
                    backgroundColor: colors.surface,
                    borderColor: applied ? colors.brand : colors.border,
                    borderWidth: applied ? 1.5 : StyleSheet.hairlineWidth,
                    borderRadius: radius.card,
                    padding: space[3],
                    gap: space[1],
                  },
                ]}
              >
                <View style={styles.cardHead}>
                  <Text variant="title2" style={{ flex: 1, letterSpacing: 0.4 }}>
                    {entry.code}
                  </Text>
                  {applied ? (
                    <View
                      style={[
                        styles.appliedChip,
                        { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: space[2] + 2 },
                      ]}
                    >
                      <Text variant="label" style={{ color: colors.onBrand, letterSpacing: 0.3 }}>
                        Applied
                      </Text>
                    </View>
                  ) : (
                    <Text variant="bodyStrong" style={{ color: colors.brandInk }}>
                      Apply
                    </Text>
                  )}
                </View>

                <Text variant="caption" color="secondary">
                  {entry.body}
                </Text>
                <Text variant="numMeta" color="tertiary" style={{ marginTop: space[1] }}>
                  {applied ? `You save ${formatRupees(discount)}` : `Saves ${formatRupees(entry.discount)}`}
                  {entry.excludes?.length ? ` · not with ${entry.excludes.join(' or ')}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {notYet.length ? (
          <View style={{ gap: space[2] }}>
            <FoodSectionHeader title="Not yet" />
            {notYet.map((entry) => (
              <View
                key={entry.code}
                style={[
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderSubtle,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderRadius: radius.card,
                    padding: space[3],
                    gap: space[1],
                  },
                ]}
              >
                <View style={styles.cardHead}>
                  <Text variant="title2" color="tertiary" style={{ flex: 1, letterSpacing: 0.4 }}>
                    {entry.code}
                  </Text>
                  <View
                    style={[
                      styles.appliedChip,
                      { backgroundColor: colors.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: space[2] + 2 },
                    ]}
                  >
                    <Text variant="numMeta" color="secondary">
                      {blockedLabel(entry)}
                    </Text>
                  </View>
                </View>
                <Text variant="caption" color="tertiary">
                  {entry.body}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text variant="caption" color="tertiary">
          One coupon per order. When two would apply, the app keeps whichever saves you more.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', alignItems: 'flex-start' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appliedChip: { paddingVertical: 4 },
});
