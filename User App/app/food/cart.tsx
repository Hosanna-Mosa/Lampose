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
  type BillLine,
} from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import { useActionBarInset } from '@/hooks/useActionBarInset';

/**
 * The cart.
 *
 * The bill is expanded rather than tucked behind a tap, because nobody should
 * have to hunt for what the delivery fee is.
 */
export default function CartScreen() {
  const { findKitchen, kitchenOpen } = useFoodCatalogue();
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  /* Nothing on a handset that reports a real inset; the shortfall on one
     that reports none, so the action clears the navigation bar. */
  const actionInset = useActionBarInset();
  const router = useRouter();
  const {
    lines,
    setQty,
    clear,
    kitchenId,
    itemTotal,
    deliveryFee,
    packagingCharge,
    toPay,
    fulfilment,
    address,
    count,
  } = useFood();

  const [confirmingClear, setConfirmingClear] = useState(false);

  const kitchen = kitchenId ? findKitchen(kitchenId) : undefined;

  if (count === 0 || !kitchen) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Cart" onBack={() => router.back()} />
        <FoodEmptyState
          glyph="food"
          title="Your cart is empty"
          body="Kitchens near you are cooking. Add a dish to get started."
          primaryLabel="Browse the menu"
          onPrimary={() => router.back()}
        />
      </View>
    );
  }

  /* The minimum is the KITCHEN'S, and the checkout applies it to pickup as
     well: `foodCustomerOrder.controller.js` compares the item total against
     `minOrderValue` before it has even looked at the fulfilment mode. This
     used to be tested for delivery only, under a notice that told the diner
     pickup had no minimum — and the server refused those orders anyway. */
  const belowMinimum = kitchen.minOrder > 0 && itemTotal < kitchen.minOrder;

  /*
    The bill, and nothing but the bill.

    Three terms, because the server adds three things: the items, the kitchen's
    packing charge and the delivery fee. The 5% "Taxes and charges" row that
    used to sit here was this app's own invention — no tax is computed, charged
    or remitted anywhere in the order flow — and the coupon line under it came
    off a total the server never discounted.

    Packaging prints only when there is some: a ₹0 row teaches a student to
    skim the one block on the screen that must not be skimmed. It is also the
    line that disappears while the kitchen's own row is still loading, which is
    why the footnote below says so rather than letting a short total pass for a
    complete one.
  */
  const bill: BillLine[] = [
    { id: 'items', label: `Item total · ${count} ${count === 1 ? 'item' : 'items'}`, amount: itemTotal },
    ...(packagingCharge ? [{ id: 'packaging', label: 'Packaging by the kitchen', amount: packagingCharge }] : []),
    fulfilment === 'pickup'
      ? { id: 'pickup', label: 'Pickup at the counter', amount: 0, amountLabel: 'Free' }
      : { id: 'delivery', label: address ? `Delivery to ${address.title}` : 'Delivery', amount: deliveryFee },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Cart"
        subtitle={kitchen.name}
        onBack={() => router.back()}
        actionLabel="Clear"
        onAction={() => setConfirmingClear(true)}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[3] }}
      >
        <Text variant="caption" color="tertiary">
          {kitchen.cuisine} · {kitchen.walkMinutes} min walk
        </Text>

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

        {!kitchenOpen(kitchen) ? (
          <FoodNotice
            tone="deadline"
            title={`${kitchen.name} is closed right now`}
            body="The order stays in your cart — placing it will need the kitchen to be open."
          />
        ) : null}

        {belowMinimum ? (
          <FoodNotice
            tone="info"
            title={`${formatRupees(kitchen.minOrder - itemTotal)} more to place this order`}
            body={`${kitchen.name} takes orders from ${formatRupees(kitchen.minOrder)}, collected or delivered. Anything under that is refused at the counter.`}
          />
        ) : null}

        {/*
          The coupons screen, still reachable and no longer promising anything.

          There is no coupon in this product yet: the place-order request has
          no field for a code, and the checkout writes `discount: 0` on every
          order it creates. This row used to print "Saving you ₹20" against a
          code the app had applied to itself on launch, over a total the server
          was never going to discount. It now says what is true and leads to a
          screen that says the same thing at length.
        */}
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
              Coupons
            </Text>
          </View>
          <Text variant="body" color="secondary" style={{ flex: 1 }} numberOfLines={1}>
            Codes are not live yet
          </Text>
          <Icon name="chevronRight" size={16} color={colors.textTertiary} />
        </Pressable>

        <BillBreakdown
          lines={bill}
          total={toPay}
          totalLabel="To pay"
          footnote={
            /* The one case where this block is NOT the whole bill: the
               kitchen's own row carries its packing charge and has not
               arrived, so the total below is short by an amount nobody has
               told us yet. Said out loud rather than papered over with a zero. */
            packagingCharge === null
              ? 'This kitchen has not sent its packing charge yet, so the total is not final. The order is priced by the kitchen when you place it.'
              : fulfilment === 'pickup'
                ? 'Pickup, so nothing is charged for delivery. The counter holds your order for 20 minutes once it is ready.'
                : address
                  ? `Delivered to ${address.title}. The rider is assigned once the kitchen plates it.`
                  : 'Choose where this is going next. The rider is assigned once the kitchen plates it.'
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
              This also drops the add-ons and spice you set.
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
            paddingBottom: space[6] + actionInset,
          },
        ]}
      >
        {/*
          The next thing this order actually needs, which depends on how it is
          being collected.

          A DELIVERY needs an address — the slot picker that used to sit here
          set a time the server has no field for, where the address is the one
          thing an order cannot go out without.

          A PICKUP does not. The backend sends no rider for one and forces
          `deliveryAddress` to empty, so demanding an address would be asking a
          question with no consequence — and worse, the address screen's only
          forward action for an empty book is "Add an address", which would
          DEADLOCK somebody who has never saved one and only ever meant to
          collect the food themselves.
        */}
        <Button
          label={
            fulfilment === 'pickup'
              ? `Choose payment · ${formatRupees(toPay)}`
              : `Choose address · ${formatRupees(toPay)}`
          }
          fullWidth
          onPress={() =>
            router.push(fulfilment === 'pickup' ? foodHref.payment : foodHref.address)
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
