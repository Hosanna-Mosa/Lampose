import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { contactNumberOf, deliveryFeeFor, metaLine, walkLabel } from '@/services/adapters/food.adapter';
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  DockedCartBar,
  FoodEmptyState,
  FoodMenuSkeleton,
  FoodNotice,
  FulfilmentToggle,
  MealWindowToken,
  RatingPill,
  DishRow,
  VegOnlyToggle,
} from '@/components/food';
import { useAppState } from '@/context/AppStateContext';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import type { Dish } from '@/types/food';
import { clockLabel, findWindow, minutesUntilOpen, readyLabel } from '@/types/food';
import { formatRupees } from '@/utils/money';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';

/**
 * A kitchen, with its menu.
 *
 * There is no photo hero. The header is 80pt of text and the deliver/pickup
 * pair sits above the fold, so the first decision on the screen is the one that
 * changes every price under it — not scrolling past a slow-loading picture of
 * a counter.
 *
 * A CLOSED kitchen keeps its whole menu, greyed, with the time it opens and a
 * reminder button. Hiding the menu would make the commonest question here
 * ("is this the place with the ₹95 thali?") unanswerable at 4 pm.
 */
export default function KitchenScreen() {
  const { findKitchen, kitchenOpen, menuFor, loading, loadingMenus, error, refetch } = useFoodCatalogue();
  const { colors, space, layout, radius, mode } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locality } = useAppState();
  const {
    add,
    setQty,
    qtyOf,
    lines,
    count,
    itemTotal,
    fulfilment,
    setFulfilment,
    address,
    preferences,
    setPreferences,
    browseWindow,
  } = useFood();

  const [now] = useState(() => new Date());
  const [section, setSection] = useState<string | null>(null);
  const [callFailed, setCallFailed] = useState(false);

  const kitchen = id ? findKitchen(id) : undefined;

  const windowId = browseWindow;
  const activeWindow = findWindow(windowId);
  const open = kitchen ? kitchenOpen(kitchen, windowId) && minutesUntilOpen(activeWindow, now) === 0 : false;

  /* `menuFor` is rebuilt whenever dishes arrive, so it belongs in here beside
     the kitchen: without it this menu is whatever had loaded on the render the
     screen opened on. */
  const menu = useMemo(() => (kitchen ? menuFor(kitchen, windowId) : []), [menuFor, kitchen, windowId]);
  const visible = useMemo(
    () => (preferences.vegOnly ? menu.filter((dish) => dish.diet === 'veg') : menu),
    [menu, preferences.vegOnly],
  );

  const sections = useMemo(() => {
    const present = new Set(visible.map((dish) => dish.section));
    return (kitchen?.sections ?? []).filter((name) => present.has(name));
  }, [visible, kitchen]);

  /*
   * No kitchen under this id — which is three different situations wearing one
   * face, and only one of them is the kitchen being gone.
   *
   * This screen is reachable straight from a link, so the ordinary case is a
   * catalogue that has not arrived yet. Telling that student the kitchen "is
   * not on LAMPOSE" is a flat lie told a second before it becomes untrue, and
   * it is the sentence that sends them back to the feed instead of waiting the
   * half second.
   */
  if (!kitchen) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Kitchen" onBack={() => router.back()} />
        {loading || loadingMenus ? (
          <FoodMenuSkeleton />
        ) : error ? (
          <FoodEmptyState
            tone="problem"
            title="Could not open this kitchen"
            body="The menu did not answer. The kitchen is probably fine — this is usually the connection."
            primaryLabel="Try again"
            onPrimary={refetch}
            secondaryLabel="Back to food"
            onSecondary={() => router.back()}
            footnote={error}
          />
        ) : (
          <FoodEmptyState
            title="This kitchen is not on LAMPOSE"
            body="It may have been removed while you were looking at it. Everything cooking near you is one tap away."
            primaryLabel="Back to food"
            onPrimary={() => router.back()}
          />
        )}
      </View>
    );
  }

  const nextOpen = findWindow(kitchen.windows[0]);
  const opensIn = minutesUntilOpen(nextOpen, now);

  /*
   * The number the header's phone button dials.
   *
   * `contactNumber` is the customer-facing number the restaurant gave us — the
   * detail response keeps it apart from the owner's private line for exactly
   * this — and it travels on that response only. A kitchen opened before its
   * detail landed, or one that never filled the field in, therefore has no
   * number, and then the header shows NO button: an icon that dials nothing is
   * read as the app failing rather than as the kitchen having no line.
   */
  const phone = contactNumberOf(kitchen);
  const call = () => {
    if (!phone) return;
    /* A stored number is punctuated for reading — "+91 98765 43210" — and a
       `tel:` URI is not, so everything but the digits and a leading plus goes
       before it reaches the dialler. */
    Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => setCallFailed(true));
  };

  /*
   * What is in the basket for THIS kitchen, which is what decides the delivery
   * fee shown beside it.
   *
   * A kitchen on a `free_above` rule stops charging delivery the moment the
   * items reach its threshold, and the toggle is read while the basket is
   * being filled — a flat fee printed there is a number the checkout will not
   * ask for. The cart holds one kitchen at a time, so a cart belonging to a
   * different one counts as nothing here rather than as progress towards this
   * kitchen's threshold.
   */
  const basket = lines[0]?.dish.kitchenId === kitchen.id ? itemTotal : 0;

  const setDishQty = (dish: Dish, next: number) => {
    const existing = lines.find((line) => line.dishId === dish.id);
    if (existing) {
      setQty(existing.key, next);
      return;
    }
    if (next > 0) add(dish, { window: windowId, spice: preferences.spice });
  };

  const shown = section ? visible.filter((dish) => dish.section === section) : visible;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      <StandardHeader
        title={kitchen.name}
        subtitle={metaLine(kitchen.cuisine, locality?.name ?? 'near you', walkLabel(kitchen))}
        onBack={() => router.back()}
        actionIcon={phone ? 'phone' : undefined}
        onAction={phone ? call : undefined}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space[8] * 2, gap: space[3] }}
      >
        {/* Open / closed, stated before anything priced */}
        <View style={{ paddingHorizontal: layout.gutter, gap: space[3], paddingTop: space[2] }}>
          <View style={styles.statusRow}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: open ? colors.brand : colors.textTertiary,
              }}
            />
            <Text variant="bodyStrong" style={{ color: open ? colors.brandInk : colors.textSecondary }}>
              {open ? 'Open now' : 'Closed now'}
            </Text>
            <Text variant="caption" color="tertiary" style={{ flex: 1 }} numberOfLines={1}>
              · {kitchen.windows.map((entry) => findWindow(entry).label).join(', ')}
            </Text>
            <RatingPill rating={kitchen.rating} count={kitchen.ratingCount} showCount />
          </View>

          {/* A device with no dialler — a tablet, an emulator — still has a
              student holding a question. The number goes on screen so it can
              be read out or copied by hand. */}
          {callFailed && phone ? (
            <FoodNotice
              tone="problem"
              title="This device cannot place calls"
              body={`${kitchen.name} answers on ${phone}.`}
            />
          ) : null}

          <FulfilmentToggle
            value={fulfilment}
            onChange={setFulfilment}
            kitchen={kitchen}
            readyAt={readyLabel(now, kitchen.prepMinutes)}
            arrivesAt={kitchen.deliveryMinutes > 0 ? readyLabel(now, kitchen.deliveryMinutes) : null}
            deliveryFee={deliveryFeeFor(kitchen, basket)}
          />

          <View style={styles.metaRow}>
            <Text variant="numMeta" color="tertiary" style={{ flex: 1 }}>
              Minimum {formatRupees(kitchen.minOrder)} for delivery{address ? ` to ${address.title}` : ''}
            </Text>
            <MealWindowToken window={activeWindow} now={now} />
          </View>

          {!open ? (
            <FoodNotice
              tone="deadline"
              title={`Opens at ${clockLabel(nextOpen.startMinute)}`}
              body={
                opensIn < 300
                  ? `In about ${Math.round(opensIn / 60) || 1} ${opensIn < 90 ? 'hour' : 'hours'}. Read the menu now — ordering opens with the window.`
                  : 'Read the menu now. Ordering opens with the window.'
              }
            />
          ) : null}

          <View style={styles.filterRow}>
            <VegOnlyToggle value={preferences.vegOnly} onChange={(value) => setPreferences({ vegOnly: value })} />
            <Text variant="caption" color="tertiary" style={{ flex: 1 }} numberOfLines={2}>
              {visible.length} of {menu.length} dishes shown
            </Text>
          </View>
        </View>

        {/* Section nav. Sticky is not worth the jank on this hardware; the list
            is short and the chips jump to it. */}
        {sections.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: space[2] }}
          >
            {[null, ...sections].map((name) => {
              const active = section === name;
              return (
                <Pressable
                  key={name ?? 'all'}
                  onPress={() => setSection(name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.sectionChip,
                    {
                      borderRadius: radius.pill,
                      paddingHorizontal: space[3],
                      backgroundColor: active ? colors.graphite : colors.surface,
                      borderColor: active ? colors.graphite : colors.border,
                    },
                  ]}
                >
                  <Text
                    variant="label"
                    style={{ color: active ? colors.onGraphite : colors.textSecondary, letterSpacing: 0.3 }}
                  >
                    {name ?? 'Everything'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* The menu */}
        {shown.length === 0 ? (
          <FoodEmptyState
            title="Nothing veg on this menu today"
            body={`${kitchen.name} is cooking ${menu.length} dishes in this window, none of them veg. Turning veg-only off shows all of them.`}
            primaryLabel="Show everything"
            onPrimary={() => setPreferences({ vegOnly: false })}
          />
        ) : (
          sections
            .filter((name) => !section || name === section)
            .map((name) => {
              const dishes = shown.filter((dish) => dish.section === name);
              if (!dishes.length) return null;
              return (
                <View key={name} style={{ gap: 0 }}>
                  <View
                    style={{
                      paddingHorizontal: layout.gutter,
                      paddingVertical: space[2],
                      backgroundColor: colors.bg,
                    }}
                  >
                    <Text variant="eyebrow" color="tertiary">
                      {name} · {dishes.length} {dishes.length === 1 ? 'item' : 'items'}
                    </Text>
                  </View>

                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderColor: colors.border,
                      paddingHorizontal: layout.gutter,
                    }}
                  >
                    {dishes.map((dish, index) => (
                      <View
                        key={dish.id}
                        style={{
                          borderBottomWidth: index === dishes.length - 1 ? 0 : StyleSheet.hairlineWidth,
                          borderBottomColor: colors.borderSubtle,
                        }}
                      >
                        <DishRow
                          dish={dish}
                          qty={qtyOf(dish.id)}
                          onQtyChange={(next) => setDishQty(dish, next)}
                          onPress={() => router.push(foodHref.dish(dish.id))}
                          disabled={!open}
                          reason={!open ? clockLabel(nextOpen.startMinute) : undefined}
                          favouritable
                        />
                      </View>
                    ))}
                  </View>
                </View>
              );
            })
        )}

        {kitchen.directions ? (
          <View style={{ paddingHorizontal: layout.gutter, marginTop: space[2] }}>
            <View
              style={[
                styles.directions,
                { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: space[3] },
              ]}
            >
              <Text variant="title3">Getting to the counter</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: space[1] }}>
                {kitchen.directions}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {count > 0 ? (
        <View style={{ paddingBottom: space[3] }}>
          <DockedCartBar
            count={count}
            total={itemTotal}
            context={`${activeWindow.label}${fulfilment === 'pickup' ? ' · pickup' : address ? ` · ${address.title}` : ''}`}
            onPress={() => router.push(foodHref.cart)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionChip: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  directions: { borderWidth: StyleSheet.hairlineWidth },
});
