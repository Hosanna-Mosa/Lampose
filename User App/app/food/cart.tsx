import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, IconButton, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  AddControl,
  AddressSheet,
  CancellationPolicy,
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
import { foodBillLines } from '@/components/food/foodBill';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import { useBottomEdgeInset } from '@/hooks/useActionBarInset';
import { useKitchen } from '@/services/hooks/useFood';
import type { Dish } from '@/types/food';

/** How many dishes one tab of "Complete your meal" offers. */
const RAIL_SIZE = 10;
/** Menu sections offered as tabs after "Popular". */
const RAIL_SECTION_TABS = 3;
const POPULAR = 'Popular';
/** The rail's photo edge — large enough to tell one dish from another. */
const RAIL_PHOTO = 68;
/** The round add button, sat on the photo's lower-right corner. */
const RAIL_ADD = 24;

/**
 * The cart.
 *
 * Laid out as cards on a sunken page: where it is going, what is in it, what
 * else this kitchen makes, coupons, then the bill. The bill folds into one
 * "To pay" row — its footnote stays outside the fold, because the one thing it
 * must never hide is that a total is not final yet.
 */
export default function CartScreen() {
  const { kitchenOpen, findKitchen, menuFor, loading: catalogueLoading } = useFoodCatalogue();
  const { colors, space, layout, radius, mode, touch } = useTheme();
  const insets = useSafeAreaInsets();
  /* Nothing on a handset that reports a real inset; the shortfall on one
     that reports none, so the action clears the navigation bar. */
  const actionInset = useBottomEdgeInset();
  const router = useRouter();
  const {
    lines,
    setQty,
    clear,
    cartKitchen,
    itemTotal,
    packagingCharge,
    bill: figures,
    billSource,
    toPay,
    address,
    addressChoices,
    setAddressId,
    refreshAddresses,
    count,
    add,
    qtyOf,
    preferences,
  } = useFood();

  const [confirmingClear, setConfirmingClear] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [addressSheet, setAddressSheet] = useState(false);
  const [railTab, setRailTab] = useState(POPULAR);
  const scrollRef = useRef<ScrollView>(null);

  const kitchen = cartKitchen;

  /* The header shows where this is going, so a cart opened with nothing
     chosen picks the book's default — the one the diner already said is
     usual. Never overrides a choice, and never guesses between several. */
  useEffect(() => {
    if (address || addressChoices.length === 0) return;
    const usual = addressChoices.find((entry) => entry.isDefault)
      ?? (addressChoices.length === 1 ? addressChoices[0] : undefined);
    if (usual) setAddressId(usual.id);
  }, [address, addressChoices, setAddressId]);

  /* Re-read on focus: the sheet's "Add a new address" goes to the editor, and
     the cart it comes back to should already be delivering there. */
  useFocusEffect(
    useCallback(() => {
      void refreshAddresses();
    }, [refreshAddresses]),
  );

  /* The rest of this kitchen's menu — the catalogue's copy when the feed
     lists it, else its own page read by id, as the kitchen screen does. */
  const listed = kitchen ? findKitchen(kitchen.id) : undefined;
  const detail = useKitchen(kitchen && !listed && !catalogueLoading ? kitchen.id : null);
  const detailDishes = detail.data?.dishes;

  /* Taken once per visit, so a dish added from the rail stays on it with its
     count rather than vanishing from under the thumb that tapped it. */
  const [inCartAtOpen] = useState(() => new Set(lines.map((line) => line.dishId)));

  const suggestions = useMemo(() => {
    if (!kitchen) return [];
    const menu = listed ? menuFor(kitchen) : [...(detailDishes ?? [])];
    /* Only dishes the kitchen has photographed: a rail of striped wells sells
       nothing, and a dish without a picture is still one tap away on the menu. */
    return menu.filter(
      (dish) =>
        !!dish.photo &&
        !dish.soldOut &&
        !inCartAtOpen.has(dish.id) &&
        (!preferences.vegOnly || dish.diet === 'veg'),
    );
  }, [kitchen, listed, menuFor, detailDishes, inCartAtOpen, preferences.vegOnly]);

  const railTabs = useMemo(() => {
    const present = new Set(suggestions.map((dish) => dish.section));
    const sections = (kitchen?.sections ?? []).filter((name) => name !== POPULAR && present.has(name));
    return [POPULAR, ...sections.slice(0, RAIL_SECTION_TABS)];
  }, [suggestions, kitchen]);

  const railDishes = useMemo(() => {
    if (railTab !== POPULAR) return suggestions.filter((dish) => dish.section === railTab).slice(0, RAIL_SIZE);
    /* Popular is what this building orders, then what is rated by the most
       people — never a hand-picked "sponsored" row. */
    const weight = (dish: Dish) => [dish.ordersInBlock ?? 0, (dish.rating ?? 0) * (dish.ratingCount ?? 0)];
    return [...suggestions]
      .sort((a, b) => {
        const [ao, ar] = weight(a);
        const [bo, br] = weight(b);
        return bo - ao || br - ar;
      })
      .slice(0, RAIL_SIZE);
  }, [suggestions, railTab]);

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

  /* There is no minimum order any more: the server reports 0 for every kitchen
     and `foodCustomerOrder.controller.js` no longer refuses anything for being
     under one. The notice that used to stand here went with it. */

  /*
    The bill, and nothing but the bill — every line from `foodBillLines`, in
    the order the payment screen and the receipt print them too. The figures
    are the server's quote once it has arrived (see `billSource`), and the
    order is priced by the server again when it is placed.
  */
  const bill: BillLine[] = foodBillLines({
    itemCount: count,
    itemTotal,
    foodGst: figures.foodGst,
    foodGstRate: Math.round(figures.foodGstRate * 100),
    foodGstIncluded: figures.foodGstIncluded,
    deliveryFee: figures.deliveryFee,
    deliveryGst: figures.deliveryGst,
    deliveryLabel: figures.distanceKnown && figures.distanceKm !== null
      ? `Delivery fee | ${figures.distanceKm.toFixed(1)} km`
      : 'Delivery fee',
    serviceFee: figures.serviceFee,
    serviceFeeGst: figures.serviceFeeGst,
    packagingFee: figures.packagingFee,
    packagingGst: figures.packagingGst,
    smallOrderFee: figures.smallOrderFee,
    discount: figures.discount,
  });
  const smallOrderHint = figures.smallOrderFee > 0
    ? ` Add ${formatRupees(Math.max(0, figures.smallOrderThreshold - itemTotal))} more to skip the small order fee.`
    : '';

  const open = kitchenOpen(kitchen);
  const footnote =
    /* The one case where this block is NOT the whole bill: the kitchen's own
       row carries its packing charge and has not arrived, so the total is
       short by an amount nobody has told us yet. Said out loud rather than
       papered over with a zero. */
    packagingCharge === null
      ? 'This kitchen has not sent its packaging fee yet, so the total is not final. The order is priced when you place it.'
      : billSource === 'preview'
        ? `Delivery is priced by distance once the address is confirmed.${smallOrderHint}`
        : `Includes delivery, GST and other charges.${smallOrderHint}`;

  const card = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
  };

  const openBill = () => {
    setBillOpen(true);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSunken }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      {/* Where this is going, under the kitchen it is coming from. Tapping
          the address is the way to change it. */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: colors.surface,
            borderBottomColor: colors.borderSubtle,
            paddingHorizontal: space[1],
          },
        ]}
      >
        <IconButton name="chevronLeft" onPress={() => router.back()} accessibilityLabel="Back" />
        <Pressable
          onPress={() => setAddressSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={address ? `Delivering to ${address.title}. Change address` : 'Choose a delivery address'}
          style={{ flex: 1, minWidth: 0, minHeight: touch.min, justifyContent: 'center', paddingHorizontal: space[1], gap: 1 }}
        >
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {kitchen.name}
          </Text>
          <View style={[styles.row, { gap: space[1] }]}>
            <Icon name="mapPin" size={14} color={colors.brandInk} />
            <Text variant="title3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {address ? address.title : 'Choose a delivery address'}
            </Text>
            {address?.detail ? (
              <Text variant="caption" color="tertiary" numberOfLines={1} style={{ flexShrink: 2 }}>
                | {address.detail}
              </Text>
            ) : null}
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <Icon name="chevronRight" size={14} color={colors.textSecondary} />
            </View>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setConfirmingClear(true)}
          accessibilityRole="button"
          accessibilityLabel="Clear cart"
          style={{ minHeight: touch.min, justifyContent: 'center', paddingHorizontal: space[3] }}
        >
          <Text variant="bodyStrong" color="brand">
            Clear
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[3] }}
      >
        {confirmingClear ? (
          <View
            style={[
              styles.bordered,
              { backgroundColor: colors.danger.tint, borderColor: colors.danger.border, borderRadius: radius.card, padding: space[3], gap: space[2] },
            ]}
          >
            <Text variant="title3" style={{ color: colors.danger.ink }}>
              Clear {count} {count === 1 ? 'item' : 'items'} worth {formatRupees(itemTotal)}?
            </Text>
            <Text variant="caption" style={{ color: colors.danger.ink }}>
              This also drops the add-ons and spice you set.
            </Text>
            <View style={[styles.row, { gap: space[2] }]}>
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

        {!open ? (
          <FoodNotice
            tone="deadline"
            title={`${kitchen.name} is closed right now`}
            body="The order stays in your cart — placing it will need the kitchen to be open."
          />
        ) : null}

        {/* The lines, and the way back to the menu */}
        <View style={[styles.bordered, card, { paddingHorizontal: space[4], paddingBottom: space[4] }]}>
          {lines.map((line, index) => (
            <View
              key={line.key}
              style={[
                styles.row,
                {
                  paddingVertical: space[3],
                  gap: space[3],
                  borderBottomWidth: index === lines.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: colors.borderSubtle,
                },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={[styles.row, { gap: 6 }]}>
                  <DietMark diet={line.dish.diet} size={12} />
                  <Text variant="title3" numberOfLines={2} style={{ flex: 1 }}>
                    {line.dish.name}
                  </Text>
                </View>
                {line.note ? (
                  <Text variant="caption" color="tertiary" numberOfLines={1} style={{ paddingLeft: 18 }}>
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

          <Pressable
            onPress={() => router.push(foodHref.kitchen(kitchen.id))}
            accessibilityRole="button"
            accessibilityLabel={`Add more from ${kitchen.name}`}
            style={({ pressed }) => [
              styles.chip,
              {
                marginTop: space[1],
                gap: space[1],
                paddingHorizontal: space[3],
                borderRadius: radius.chip,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
              },
            ]}
          >
            <Text variant="title3" style={{ color: colors.brandInk }}>
              +
            </Text>
            <Text variant="bodyStrong">Add items</Text>
          </Pressable>
        </View>

        {/* Complete your meal — the rest of this kitchen's menu */}
        {suggestions.length > 0 ? (
          <View style={[styles.bordered, card, { paddingVertical: space[4], gap: space[3] }]}>
            <Text variant="eyebrow" color="tertiary" style={{ paddingHorizontal: space[4] }}>
              Complete your meal
            </Text>

            {railTabs.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: space[4], gap: space[2] }}
              >
                {railTabs.map((tab) => {
                  const active = tab === railTab;
                  return (
                    <Pressable
                      key={tab}
                      onPress={() => setRailTab(tab)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.tab,
                        {
                          paddingHorizontal: space[4],
                          borderRadius: radius.pill,
                          backgroundColor: active ? colors.graphite : colors.surfaceSunken,
                        },
                      ]}
                    >
                      <Text variant="bodyStrong" style={{ color: active ? colors.onGraphite : colors.textSecondary }}>
                        {tab}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[1], gap: space[3] }}
            >
              {railDishes.map((dish) => {
                const qty = qtyOf(dish.id);
                return (
                  <View key={dish.id} style={[styles.railTile, { gap: 2 }]}>
                    <Pressable
                      onPress={() => router.push(foodHref.dish(dish.id))}
                      accessibilityRole="button"
                      accessibilityLabel={`${dish.name}, ${formatRupees(dish.price)}`}
                    >
                      <FoodPhoto height={RAIL_PHOTO} width={RAIL_PHOTO} radius={radius.chip} uri={dish.photo} />
                    </Pressable>
                    <Pressable
                      onPress={() => add(dish, { spice: preferences.spice, kitchen })}
                      disabled={!open}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={qty > 0 ? `Add another ${dish.name}, ${qty} in cart` : `Add ${dish.name}`}
                      style={({ pressed }) => [
                        styles.railAdd,
                        {
                          borderColor: qty > 0 ? colors.brand : colors.border,
                          backgroundColor: qty > 0 ? colors.brand : pressed ? colors.surfaceSunken : colors.surface,
                          opacity: open ? 1 : 0.5,
                          transform: [{ scale: pressed ? 0.92 : 1 }],
                        },
                      ]}
                    >
                      <Text variant="bodyStrong" style={{ color: qty > 0 ? colors.onBrand : colors.brandInk, fontWeight: '700' }}>
                        {qty > 0 ? qty : '+'}
                      </Text>
                    </Pressable>
                    <View style={[styles.row, styles.railName, { gap: 4, marginTop: space[1] }]}>
                      <View style={{ marginTop: 2 }}>
                        <DietMark diet={dish.diet} size={9} />
                      </View>
                      <Text variant="caption" numberOfLines={2} style={{ flex: 1, color: colors.textPrimary }}>
                        {dish.name}
                      </Text>
                    </View>
                    <Text variant="priceSm" style={{ color: colors.textPrimary }}>
                      {formatRupees(dish.price)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
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
        <View style={[styles.bordered, card, { paddingVertical: space[4], gap: space[2] }]}>
          <Text variant="eyebrow" color="tertiary" style={{ paddingHorizontal: space[4] }}>
            Savings corner
          </Text>
          <Pressable
            onPress={() => router.push(foodHref.coupons)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.row,
              {
                paddingHorizontal: space[4],
                paddingVertical: space[1],
                gap: space[3],
                backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
              },
            ]}
          >
            {/* Coupons are the logo's yellow, never the caution amber that
                means "waiting on somebody". */}
            <View style={[styles.iconWell, { backgroundColor: colors.deal.tint, borderRadius: radius.chip }]}>
              <Icon name="offer" size={16} color={colors.deal.ink} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="title3">Apply coupon</Text>
              <Text variant="caption" color="tertiary" numberOfLines={1}>
                Codes are not live yet
              </Text>
            </View>
            <Icon name="chevronRight" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        {/* The bill, folded into one "To pay" row */}
        <View style={[styles.bordered, card]}>
          <Pressable
            onPress={() => setBillOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded: billOpen }}
            accessibilityLabel={`To pay ${formatRupees(toPay)}`}
            accessibilityHint={billOpen ? 'Hides the bill' : 'Shows the full bill'}
            style={[styles.row, { padding: space[4], gap: space[3], alignItems: 'flex-start' }]}
          >
            <View style={[styles.iconWell, { backgroundColor: colors.brandTint, borderRadius: radius.chip }]}>
              <Icon name="rupee" size={16} color={colors.brandInk} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={[styles.row, { gap: space[2] }]}>
                <Text variant="title2" style={{ flex: 1 }}>
                  To pay
                </Text>
                <Text variant="priceLg">{formatRupees(toPay)}</Text>
              </View>
              <Text variant="caption" color={packagingCharge === null ? 'secondary' : 'tertiary'}>
                {footnote}
              </Text>
            </View>
            <View style={{ marginTop: 2, transform: [{ rotate: billOpen ? '-90deg' : '90deg' }] }}>
              <Icon name="chevronRight" size={16} color={colors.textSecondary} />
            </View>
          </Pressable>
          {billOpen ? (
            <View
              style={[
                styles.rule,
                { borderTopColor: colors.borderSubtle, paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[2] },
              ]}
            >
              <BillBreakdown lines={bill} total={toPay} totalLabel="To pay" embedded />
            </View>
          ) : null}
        </View>

        <CancellationPolicy />
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
            gap: space[4],
          },
        ]}
      >
        <Pressable
          onPress={openBill}
          accessibilityRole="button"
          accessibilityLabel={`${formatRupees(toPay)}, view the bill`}
          style={{ gap: 2 }}
        >
          <Text variant="priceLg">{formatRupees(toPay)}</Text>
          <Text variant="caption" style={{ color: colors.brandInk }}>
            View bill
          </Text>
        </Pressable>
        {/*
          The next thing this order actually needs. With an address chosen —
          picked here or defaulted from the book — that is payment; without
          one it is the address, the one thing an order cannot go out without.
          Collection is no longer offered, so there is no third path. The
          address is picked in a sheet over the cart, not on a page of its own.
        */}
        <Button
          label={address ? `Pay ${formatRupees(toPay)}` : 'Choose address'}
          variant="food"
          style={{ flex: 1 }}
          /* The notice above already says it is closed; the button stayed
             live and walked a closed kitchen's cart all the way to payment. */
          disabled={!open}
          onPress={() => (address ? router.push(foodHref.payment) : setAddressSheet(true))}
        />
      </View>

      <AddressSheet visible={addressSheet} onClose={() => setAddressSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  bordered: { borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 36,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tab: { minHeight: 34, justifyContent: 'center' },
  railTile: { width: RAIL_PHOTO },
  /* Two lines tall whatever the name, so every price sits on one line. */
  railName: { alignItems: 'flex-start', minHeight: 28 },
  /* Sat on the photo's lower-right corner, lifted off it by a soft shadow. */
  railAdd: {
    position: 'absolute',
    top: RAIL_PHOTO - RAIL_ADD + 6,
    right: -4,
    width: RAIL_ADD,
    height: RAIL_ADD,
    borderRadius: RAIL_ADD / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  iconWell: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  rule: { borderTopWidth: StyleSheet.hairlineWidth },
  footer: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
});
