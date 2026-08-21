import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  AddControl,
  BillBreakdown,
  DietMark,
  FoodEmptyState,
  FoodPhoto,
  FoodNotice,
  MealWindowToken,
  RoomTargetRow,
  type BillLine,
} from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { findKitchen } from '@/data/food';
import { clockLabel, findWindow, focusWindow, minutesUntilClose } from '@/types/food';
import { formatRupees } from '@/utils/money';

/**
 * The cart.
 *
 * Two things here are not decoration. The window deadline, because a cart built
 * at 3:10 pm is a lunch order that stops existing at 3:30 — and a student who
 * only finds that out at the payment screen has lost the order and the twenty
 * minutes. And the bill, expanded, because nobody should have to tap to find
 * out what the delivery fee is.
 */
export default function CartScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    lines,
    setQty,
    clear,
    kitchenId,
    window,
    itemTotal,
    deliveryFee,
    taxes,
    discount,
    toPay,
    coupon,
    fulfilment,
    address,
    count,
  } = useFood();

  const [now] = useState(() => new Date());
  const [confirmingClear, setConfirmingClear] = useState(false);

  const kitchen = kitchenId ? findKitchen(kitchenId) : undefined;
  const windowId = window ?? focusWindow(now).id;
  const activeWindow = findWindow(windowId);
  const closesIn = minutesUntilClose(activeWindow, now);

  if (count === 0 || !kitchen) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Cart" onBack={() => router.back()} />
        <FoodEmptyState
          glyph="food"
          title="Your cart is empty"
          body={
            closesIn === null
              ? `${activeWindow.label} opens at ${clockLabel(activeWindow.startMinute)}. Browse now and the cart holds what you pick.`
              : `${activeWindow.label} runs until ${clockLabel(activeWindow.endMinute)} and kitchens near you are cooking.`
          }
          primaryLabel={`Browse ${activeWindow.label.toLowerCase()}`}
          onPrimary={() => router.back()}
        />
      </View>
    );
  }

  const belowMinimum = fulfilment === 'delivery' && itemTotal < kitchen.minOrder;

  const bill: BillLine[] = [
    { id: 'items', label: `Item total · ${count} ${count === 1 ? 'item' : 'items'}`, amount: itemTotal },
    fulfilment === 'pickup'
      ? { id: 'pickup', label: 'Pickup at the counter', amount: 0, amountLabel: 'Free' }
      : { id: 'delivery', label: `Delivery to ${address.title}`, amount: deliveryFee },
    ...(taxes ? [{ id: 'taxes', label: 'Taxes and charges', amount: taxes }] : []),
    ...(coupon ? [{ id: 'coupon', label: `${coupon.code} · student price`, amount: discount, discount: true }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Cart"
        subtitle={`${kitchen.name} · ${activeWindow.label}`}
        onBack={() => router.back()}
        actionLabel="Clear"
        onAction={() => setConfirmingClear(true)}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[3] }}
      >
        <View style={styles.scopeRow}>
          <MealWindowToken window={activeWindow} now={now} />
          <Text variant="caption" color="tertiary" style={{ flex: 1 }}>
            {kitchen.cuisine} · {kitchen.walkMinutes} min walk
          </Text>
        </View>

        {/* The lines */}
        <View
          style={[
            styles.group,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
          ]}
        >
          {lines.map((line, index) => (
            <View
              key={line.key}
              style={[
                styles.line,
                {
                  paddingVertical: space[3],
                  gap: space[3],
                  borderBottomWidth: index === lines.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: colors.borderSubtle,
                },
              ]}
            >
              <FoodPhoto height={44} width={44} radius={radius.chip} uri={line.dish.photo} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={styles.lineTitle}>
                  <DietMark diet={line.dish.diet} size={12} />
                  <Text variant="title3" numberOfLines={1} style={{ flex: 1 }}>
                    {line.dish.name}
                  </Text>
                </View>
                {line.note ? (
                  <Text variant="caption" color="tertiary" numberOfLines={1}>
                    {line.note}
                  </Text>
                ) : null}
              </View>

              <AddControl
                value={line.qty}
                onChange={(next) => setQty(line.key, next)}
                accessibilityLabel={line.dish.name}
              />

              <Text variant="priceMd" style={{ minWidth: 56, textAlign: 'right' }}>
                {formatRupees(line.lineTotal)}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => router.push(foodHref.kitchen(kitchen.id))}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.addMore,
            {
              backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
              borderColor: colors.border,
              borderRadius: radius.card,
              gap: space[2],
            },
          ]}
        >
          <Icon name="search" size={16} color={colors.brandInk} />
          <Text variant="bodyStrong" style={{ color: colors.brandInk }}>
            Add more from {kitchen.name}
          </Text>
        </Pressable>

        {/* Where and when */}
        <RoomTargetRow address={address} onPress={() => router.push(foodHref.slot)} />

        {closesIn !== null && closesIn <= 45 ? (
          <FoodNotice
            tone="deadline"
            title={`${activeWindow.label} orders close at ${clockLabel(activeWindow.endMinute)}`}
            body={`Place this within ${closesIn} minutes or it moves to the next window and re-prices.`}
          />
        ) : null}

        {belowMinimum ? (
          <FoodNotice
            tone="info"
            title={`${formatRupees(kitchen.minOrder - itemTotal)} more for delivery`}
            body={`${kitchen.name} delivers from ${formatRupees(kitchen.minOrder)}. Pickup has no minimum and costs nothing.`}
          />
        ) : null}

        {/* Coupon */}
        <Pressable
          onPress={() => router.push(foodHref.coupons)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.couponRow,
            {
              backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
              borderColor: colors.border,
              borderRadius: radius.card,
              padding: space[3],
              gap: space[3],
            },
          ]}
        >
          <View
            style={[
              styles.couponChip,
              { backgroundColor: colors.warning.tint, borderRadius: radius.chip, paddingHorizontal: space[2] },
            ]}
          >
            <Text variant="numMeta" style={{ color: colors.warning.ink }}>
              {coupon ? coupon.code : 'Coupon'}
            </Text>
          </View>
          <Text variant="body" color="secondary" style={{ flex: 1 }} numberOfLines={1}>
            {coupon ? `Saving you ${formatRupees(discount)}` : 'Apply a coupon or student code'}
          </Text>
          <Icon name="chevronRight" size={16} color={colors.textTertiary} />
        </Pressable>

        <BillBreakdown
          lines={bill}
          total={toPay}
          totalLabel="To pay"
          footnote={
            fulfilment === 'pickup'
              ? 'Pickup, so nothing is charged for delivery. The counter holds your order for 20 minutes once it is ready.'
              : `Delivered to ${address.title}. The rider is assigned once the kitchen plates it.`
          }
        />

        {confirmingClear ? (
          <View
            style={[
              styles.confirm,
              { backgroundColor: colors.danger.tint, borderColor: colors.danger.border, borderRadius: radius.card, padding: space[3], gap: space[2] },
            ]}
          >
            <Text variant="title3" style={{ color: colors.danger.ink }}>
              Clear {count} {count === 1 ? 'item' : 'items'} worth {formatRupees(itemTotal)}?
            </Text>
            <Text variant="caption" style={{ color: colors.danger.ink }}>
              This also drops the add-ons and spice you set. {coupon ? `${coupon.code} stays available.` : ''}
            </Text>
            <View style={[styles.confirmActions, { gap: space[2] }]}>
              <Button label="Keep my cart" size="sm" onPress={() => setConfirmingClear(false)} />
              <Button
                label="Clear it"
                size="sm"
                variant="destructive"
                onPress={() => {
                  clear();
                  setConfirmingClear(false);
                  router.back();
                }}
              />
            </View>
          </View>
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
            paddingBottom: space[6],
          },
        ]}
      >
        <Button
          label={`Choose slot · ${formatRupees(toPay)}`}
          fullWidth
          onPress={() => router.push(foodHref.slot)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  group: { borderWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center' },
  lineTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  couponRow: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  couponChip: { paddingVertical: 4 },
  confirm: { borderWidth: StyleSheet.hairlineWidth },
  confirmActions: { flexDirection: 'row' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
