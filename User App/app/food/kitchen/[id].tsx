import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { contactNumberOf, deliveryFeeFor, metaLine, walkLabel } from '@/services/adapters/food.adapter';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, SearchField, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  DietMark,
  DockedCartBar,
  FoodEmptyState,
  FoodMenuSkeleton,
  FoodNotice,
  FulfilmentToggle,
  RatingPill,
  DishRow,
} from '@/components/food';
import { useAppState } from '@/context/AppStateContext';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import type { Diet, Dish } from '@/types/food';
import { formatRupees } from '@/utils/money';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';

/**
 * A kitchen, with its menu.
 *
 * There is no photo hero. The screen opens on the kitchen's own name, its
 * distance and how long it takes — not on a slow-loading picture of a
 * counter.
 *
 * The kitchen is named ONCE, in the identity block, and the header bar
 * carries no title: it used to hold the name as well, which printed it twice
 * on one screen with the upper copy truncated.
 *
 * The deliver/pickup pair (`FulfilmentToggle`) sits in the identity block
 * below, while the kitchen is open — the one place in the app that calls
 * `setFulfilment`, so this is where a diner actually chooses.
 *
 * A CLOSED kitchen keeps its whole menu, greyed. Hiding the menu would make
 * the commonest question here ("is this the place with the ₹95 thali?")
 * unanswerable whenever the kitchen happens not to be open.
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
  } = useFood();

  const [section, setSection] = useState<string | null>(null);
  const [callFailed, setCallFailed] = useState(false);
  const [query, setQuery] = useState('');
  /*
   * The menu's own diet filter, and it is a real one — `Diet` is
   * `veg | egg | nonveg` on every dish, so all three chips filter something
   * rather than decorating the row.
   *
   * Local to this screen and multi-select, with none selected meaning "show
   * everything". It does NOT write to `preferences.vegOnly`: that is the
   * account's standing choice across the whole app, and a chip tapped while
   * reading one menu should not quietly change what the Home feed does
   * tomorrow. The global preference still applies on top — see `visible`.
   */
  const [diets, setDiets] = useState<readonly Diet[]>([]);

  const toggleDiet = (diet: Diet) =>
    setDiets((current) =>
      current.includes(diet) ? current.filter((d) => d !== diet) : [...current, diet],
    );
  const term = query.trim().toLowerCase();

  const kitchen = id ? findKitchen(id) : undefined;

  const open = kitchen ? kitchenOpen(kitchen) : false;

  /* `menuFor` is rebuilt whenever dishes arrive, so it belongs in here beside
     the kitchen: without it this menu is whatever had loaded on the render the
     screen opened on. */
  const menu = useMemo(() => (kitchen ? menuFor(kitchen) : []), [menuFor, kitchen]);
  const visible = useMemo(
    () =>
      menu.filter((dish) => {
        /* The account's standing choice first — a chip cannot widen past it,
           which is why turning on "Non-veg" while veg mode is on correctly
           shows nothing rather than overriding the preference. */
        if (preferences.vegOnly && dish.diet !== 'veg') return false;
        if (diets.length && !diets.includes(dish.diet)) return false;
        if (term && !`${dish.name} ${dish.description}`.toLowerCase().includes(term)) return false;
        return true;
      }),
    [menu, preferences.vegOnly, diets, term],
  );

  const sections = useMemo(() => {
    const present = new Set(visible.map((dish) => dish.section));
    return (kitchen?.sections ?? []).filter((name) => present.has(name));
  }, [visible, kitchen]);

  /* A section chip stays selected by name, not by position — so narrowing the
     menu (typing a search, flipping veg-only) can leave it pointing at a
     section that no longer has anything in it. Left alone that reads as a
     false "no dishes" empty state over a menu that plainly has matches; this
     drops back to "Everything" the moment the chip it was showing is gone. */
  useEffect(() => {
    if (section && !sections.includes(section)) setSection(null);
  }, [sections, section]);

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

  /* "Ready about 7:45 PM" — the counter-ready clock time, not a minute count.
     `deliveryMinutes` is ZERO always (see `food.adapter.ts`: nothing in
     `food_restaurants` records how long a rider takes), which is why
     `arrivesAt` is null on every kitchen today and `FulfilmentToggle` already
     has a fallback line for exactly that case. */
  const clockAfter = (minutes: number) =>
    new Date(Date.now() + minutes * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const readyAt = clockAfter(kitchen.prepMinutes);
  const arrivesAt = kitchen.deliveryMinutes > 0 ? clockAfter(kitchen.prepMinutes + kitchen.deliveryMinutes) : null;
  const deliveryFee = deliveryFeeFor(kitchen, itemTotal);

  const setDishQty = (dish: Dish, next: number) => {
    const existing = lines.find((line) => line.dishId === dish.id);
    if (existing) {
      setQty(existing.key, next);
      return;
    }
    if (next > 0) add(dish, { spice: preferences.spice });
  };

  const shown = section ? visible.filter((dish) => dish.section === section) : visible;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      {/* No title, deliberately. The kitchen is named in the identity block
          at the top of the content, in display type — carrying it up here as
          well printed the name twice on one screen, once truncated. The bar
          keeps the back arrow and the call action, which are the two things
          that have to stay reachable. */}
      <StandardHeader
        title=""
        onBack={() => router.back()}
        actionIcon={phone ? 'phone' : undefined}
        onAction={phone ? call : undefined}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        /* The search row. Index 1 — the identity block is 0 — and it has to
           stay 1: `stickyHeaderIndices` counts DIRECT children of the
           ScrollView, so inserting anything above the search row without
           moving this number silently sticks the wrong thing. */
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: space[8] * 2, gap: space[3] }}
        refreshControl={
          <RefreshControl refreshing={loading || loadingMenus} onRefresh={refetch} tintColor={colors.brand} />
        }
      >
        {/* The identity block, in the reference's own order: who, then where,
            then how long, then whether they are cooking. The name repeats
            what the header bar says because the bar's copy is one line that
            truncates — this is where the kitchen is actually named. */}
        <View style={{ paddingHorizontal: layout.gutter, gap: space[3], paddingTop: space[2] }}>
          <View style={styles.identityRow}>
            <Text variant="display1" numberOfLines={2} style={{ flex: 1 }}>
              {kitchen.name}
            </Text>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <RatingPill rating={kitchen.rating} count={kitchen.ratingCount} />
              {kitchen.ratingCount > 0 ? (
                <Text variant="numMeta" color="tertiary">
                  By {kitchen.ratingCount}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ gap: space[1] }}>
            <View style={styles.identityMeta}>
              <Icon name="mapPin" size={16} color={colors.textTertiary} />
              <Text variant="caption" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
                {metaLine(walkLabel(kitchen), kitchen.landmark || locality?.name)}
              </Text>
            </View>

            {/* `prepMinutes` is the kitchen's own counter-ready time. A single
                number, not the reference's comfortable-looking range — the
                data has one. */}
            {kitchen.prepMinutes > 0 ? (
              <View style={styles.identityMeta}>
                <Icon name="zap" size={16} color={open ? colors.brandInk : colors.textTertiary} />
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={{ flex: 1, color: open ? colors.brandInk : colors.textSecondary }}
                >
                  {metaLine(
                    `${kitchen.prepMinutes + kitchen.deliveryMinutes} mins`,
                    open ? 'Open now' : 'Closed now',
                  )}
                </Text>
              </View>
            ) : null}
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

          {fulfilment !== 'pickup' ? (
            <View style={styles.metaRow}>
              <Text variant="numMeta" color="tertiary" style={{ flex: 1 }}>
                Minimum {formatRupees(kitchen.minOrder)} for delivery{address ? ` to ${address.title}` : ''}
              </Text>
            </View>
          ) : null}

          {open ? (
            <FulfilmentToggle
              value={fulfilment}
              onChange={setFulfilment}
              kitchen={kitchen}
              readyAt={readyAt}
              arrivesAt={arrivesAt}
              deliveryFee={deliveryFee}
              size="compact"
            />
          ) : null}

          {!open ? (
            <FoodNotice
              tone="deadline"
              title="Closed right now"
              body="Read the menu now — ordering opens the moment the kitchen does."
            />
          ) : null}
        </View>

        {/*
          THE STICKY ROW — index 1 of the ScrollView, which is what
          `stickyHeaderIndices` below refers to. Two things it needs that a
          non-sticky child does not:

          an OPAQUE background, because a sticky header does not clip what
          passes under it — without a fill the menu scrolls visibly through
          the search field; and its own horizontal padding, because it is a
          direct child of the ScrollView now rather than a sibling inside the
          padded identity block above.

          Moving it out here is also why the block above had to close: only a
          DIRECT child of the ScrollView can be made sticky.
        */}
        <View style={{ paddingHorizontal: layout.gutter, paddingBottom: space[2], backgroundColor: colors.bg }}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            placeholder={`Search ${kitchen.name}'s menu`}
            returnKeyType="search"
            accessibilityLabel="Search this menu"
          />
        </View>

        <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
          {/* Three chips, each backed by `Dish.diet`. Multi-select, and none
              selected means all — the reference's own behaviour, and the
              only one that makes "Veg" and "Egg" together mean anything. */}
          <View style={styles.dietRow}>
            {DIET_CHIPS.map(({ diet, label }) => {
              const on = diets.includes(diet);
              return (
                <Pressable
                  key={diet}
                  onPress={() => toggleDiet(diet)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${label} dishes only`}
                  style={[
                    styles.dietChip,
                    {
                      borderRadius: radius.pill,
                      paddingHorizontal: space[3],
                      gap: space[1] + 2,
                      backgroundColor: on ? colors.surfaceSunken : colors.surface,
                      borderColor: on ? colors.borderInput : colors.border,
                    },
                  ]}
                >
                  <DietMark diet={diet} size={16} />
                  <Text variant={on ? 'bodyStrong' : 'body'}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text variant="caption" color="tertiary" numberOfLines={2}>
            {visible.length} of {menu.length} dishes shown
          </Text>
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
          term ? (
            <FoodEmptyState
              glyph="search"
              title={`Nothing matches “${query.trim()}”`}
              body={`${kitchen.name}'s menu doesn't have that. Try a different word, or clear the search to see everything.`}
              primaryLabel="Clear search"
              onPrimary={() => setQuery('')}
            />
          ) : (
            <FoodEmptyState
              title="Nothing veg on this menu today"
              body={`${kitchen.name} cooks ${menu.length} dishes, none of them veg. Turning veg-only off shows all of them.`}
              primaryLabel="Show everything"
              onPrimary={() => setPreferences({ vegOnly: false })}
            />
          )
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
                          reason={!open ? 'Closed' : undefined}
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
            context={fulfilment === 'pickup' ? 'pickup' : address ? address.title : 'no address yet'}
            onPress={() => router.push(foodHref.cart)}
          />
        </View>
      ) : null}
    </View>
  );
}

/** The three the `Diet` union actually has. Labelled the way a menu says
 *  them, not the way the type spells them. */
const DIET_CHIPS: readonly { diet: Diet; label: string }[] = [
  { diet: 'veg', label: 'Veg' },
  { diet: 'egg', label: 'Egg' },
  { diet: 'nonveg', label: 'Non-veg' },
];

const styles = StyleSheet.create({
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  identityMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dietRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dietChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionChip: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  directions: { borderWidth: StyleSheet.hairlineWidth },
});
