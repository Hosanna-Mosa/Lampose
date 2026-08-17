import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Checkbox, Icon, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { AddControl, DietMark, FoodEmptyState, FoodNotice, FoodPhoto, RatingPill } from '@/components/food';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { findDish, findKitchen } from '@/data/food';
import type { SpiceLevel } from '@/types/food';
import { SPICE_LABEL, clockLabel, findWindow, minutesUntilOpen } from '@/types/food';
import { formatRupees } from '@/utils/money';

const SPICES: readonly SpiceLevel[] = ['mild', 'medium', 'hot'];

/**
 * One dish, and the three choices that come with it.
 *
 * Portion, add-ons and spice, in that order, because that is the order they
 * change the price: portion is the dish, add-ons are additions, spice is free.
 * The CTA carries the running total including everything chosen — a student who
 * ticks ₹15 of curd and then sees "Add to cart" with no number has been given
 * a surprise to discover on the next screen.
 *
 * Allergens flagged in preferences are WARNED about here, never hidden. The
 * data comes from small kitchens and is not good enough to hide food over; a
 * student who is told "you flagged peanut, this has peanut" can decide, and one
 * whose dish silently vanished cannot.
 */
export default function DishScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { add, qtyOf, preferences, browseWindow } = useFood();

  const [now] = useState(() => new Date());
  const dish = id ? findDish(id) : undefined;
  const kitchen = dish ? findKitchen(dish.kitchenId) : undefined;

  const [addOnIds, setAddOnIds] = useState<readonly string[]>([]);
  const [spice, setSpice] = useState<SpiceLevel>(preferences.spice);
  const [qty, setLocalQty] = useState(1);

  if (!dish || !kitchen) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Dish" onBack={() => router.back()} />
        <FoodEmptyState
          title="This dish is off the menu"
          body="Kitchens change what they cook between windows. The rest of this kitchen's menu is still here."
          primaryLabel="Back"
          onPrimary={() => router.back()}
        />
      </View>
    );
  }

  const windowId = browseWindow;
  const activeWindow = findWindow(windowId);
  const inWindow = dish.windows.includes(windowId);
  const windowOpen = minutesUntilOpen(activeWindow, now) === 0;
  const orderable = inWindow && windowOpen && !dish.soldOut;

  const addOns = dish.addOns ?? [];
  const addOnTotal = addOns
    .filter((addOn) => addOnIds.includes(addOn.id))
    .reduce((sum, addOn) => sum + addOn.price, 0);
  const unitPrice = dish.price + addOnTotal;

  const flagged = preferences.allergens.filter((allergen) =>
    `${dish.name} ${dish.description}`.toLowerCase().includes(allergen.split(',')[0].toLowerCase()),
  );

  const inCart = qtyOf(dish.id);

  const commit = () => {
    add(dish, { qty, addOnIds, spice, window: windowId });
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title={kitchen.name} onBack={() => router.back()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[4] }}
      >
        <FoodPhoto height={160} radius={radius.card} uri={dish.photo} label="photo coming from the kitchen" />

        <View style={{ gap: space[2] }}>
          <View style={styles.titleRow}>
            <DietMark diet={dish.diet} size={16} />
            <Text variant="display2" style={{ flex: 1 }}>
              {dish.name}
            </Text>
          </View>

          <Text variant="body" color="secondary">
            {dish.description}
          </Text>

          <View style={styles.metaRow}>
            {dish.serves ? (
              <Text variant="caption" color="tertiary">
                {dish.serves}
              </Text>
            ) : null}
            {dish.rating ? <RatingPill rating={dish.rating} count={dish.ratingCount} showCount /> : null}
          </View>

          <Text variant="priceHero" style={{ marginTop: space[1] }}>
            {formatRupees(dish.price)}
          </Text>
        </View>

        {/* Availability, before any choice is offered */}
        {!inWindow ? (
          <FoodNotice
            tone="info"
            title={`Cooked in the ${dish.windows.map((entry) => findWindow(entry).label.toLowerCase()).join(' and ')} window`}
            body={`Not on the ${activeWindow.label.toLowerCase()} menu. It comes back at ${clockLabel(findWindow(dish.windows[0]).startMinute)}.`}
          />
        ) : dish.soldOut ? (
          <FoodNotice
            tone="deadline"
            title="Sold out for this window"
            body="The kitchen has run out. It is cooked fresh each window, so it is back at the next one."
          />
        ) : !windowOpen ? (
          <FoodNotice
            tone="info"
            title={`${activeWindow.label} opens at ${clockLabel(activeWindow.startMinute)}`}
            body="Set your choices now — the cart holds them until the window opens."
          />
        ) : null}

        {/* Allergens: warned about, never hidden */}
        {flagged.length ? (
          <FoodNotice
            tone="deadline"
            title={`You flagged ${flagged.join(' and ').toLowerCase()}`}
            body="Allergen data comes from the kitchen and is not complete. Call them if it matters — the number is in the header."
          />
        ) : null}

        {/* Add-ons */}
        {addOns.length ? (
          <View style={{ gap: space[2] }}>
            <Text variant="eyebrow" color="tertiary">
              Add-ons
            </Text>
            <View
              style={[
                styles.group,
                { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
              ]}
            >
              {addOns.map((addOn, index) => (
                <View
                  key={addOn.id}
                  style={[
                    styles.addOnRow,
                    {
                      paddingVertical: space[2],
                      borderBottomWidth: index === addOns.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: colors.borderSubtle,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Checkbox
                      label={addOn.label}
                      checked={addOnIds.includes(addOn.id)}
                      onChange={(checked) =>
                        setAddOnIds(
                          checked ? [...addOnIds, addOn.id] : addOnIds.filter((entry) => entry !== addOn.id),
                        )
                      }
                    />
                  </View>
                  <Text variant="priceSm" color="secondary">
                    {formatRupees(addOn.price)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Spice */}
        {!dish.spiceFixed ? (
          <View style={{ gap: space[2] }}>
            <Text variant="eyebrow" color="tertiary">
              Spice level
            </Text>
            <View style={[styles.spiceRow, { gap: space[2] }]}>
              {SPICES.map((level) => {
                const active = spice === level;
                return (
                  <Pressable
                    key={level}
                    onPress={() => setSpice(level)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.spiceChip,
                      {
                        borderRadius: radius.button,
                        backgroundColor: active ? colors.graphite : colors.surface,
                        borderColor: active ? colors.graphite : colors.border,
                      },
                    ]}
                  >
                    <Text
                      variant="title3"
                      style={{ color: active ? colors.onGraphite : colors.textSecondary }}
                    >
                      {SPICE_LABEL[level]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text variant="caption" color="tertiary">
              This goes to the kitchen with the order. Some dishes cannot be changed.
            </Text>
          </View>
        ) : null}

        {/* What other students said */}
        {dish.rating ? (
          <View style={{ gap: space[2] }}>
            <Text variant="eyebrow" color="tertiary">
              What students say
            </Text>
            <View
              style={[
                styles.group,
                { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: space[3], gap: space[3] },
              ]}
            >
              <Review
                name="Rahul K."
                stars={5}
                when="2 days ago"
                body="Sambar is properly spicy and the refill actually happens. Cheaper than my mess."
              />
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />
              <Review
                name="Sneha M."
                stars={4}
                when="last week"
                body="Portion is right for one. Ask for less rice if you are picking up."
              />
            </View>
          </View>
        ) : null}

        {inCart > 0 ? (
          <Text variant="caption" color="tertiary">
            {inCart} already in your cart. Adding here does not replace it.
          </Text>
        ) : null}
      </ScrollView>

      {/* The committing bar. It carries the number, always. */}
      <View
        style={[
          styles.cta,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: space[6],
            gap: space[3],
          },
        ]}
      >
        <AddControl
          value={qty}
          onChange={(next) => setLocalQty(Math.max(1, next))}
          size="lg"
          disabled={!orderable}
          reason={dish.soldOut ? 'Sold out' : !inWindow ? 'Another window' : 'Opens later'}
          accessibilityLabel={dish.name}
        />

        <Pressable
          onPress={orderable ? commit : undefined}
          accessibilityRole="button"
          accessibilityState={{ disabled: !orderable }}
          accessibilityLabel={`Add to cart, ${formatRupees(unitPrice * qty)}`}
          style={({ pressed }) => [
            styles.ctaButton,
            {
              borderRadius: radius.button,
              backgroundColor: orderable ? (pressed ? colors.graphiteRaised : colors.graphite) : colors.surfaceSunken,
            },
          ]}
        >
          <Text variant="title2" style={{ color: orderable ? colors.onGraphite : colors.textTertiary }}>
            {orderable ? `Add to cart · ${formatRupees(unitPrice * qty)}` : 'Not cooking right now'}
          </Text>
        </Pressable>
      </View>

    </View>
  );
}

function Review({ name, stars, when, body }: { name: string; stars: number; when: string; body: string }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ gap: space[1] }}>
      <View style={styles.reviewHead}>
        <Text variant="title3">{name}</Text>
        <View style={styles.stars}>
          {Array.from({ length: stars }).map((_, index) => (
            <Icon key={index} name="star" size={16} color={colors.warning.base} />
          ))}
        </View>
        <Text variant="numMeta" color="tertiary">
          {when}
        </Text>
      </View>
      <Text variant="caption" color="secondary">
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  group: { borderWidth: StyleSheet.hairlineWidth },
  addOnRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spiceRow: { flexDirection: 'row' },
  spiceChip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cta: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  ctaButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stars: { flexDirection: 'row', gap: 1 },
});
