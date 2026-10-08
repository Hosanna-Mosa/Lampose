import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { dineInOf, metaLine } from '@/services/adapters/food.adapter';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Icon, SearchField, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  DietMark,
  DineInCard,
  DockedCartBar,
  FoodEmptyState,
  FoodMenuSkeleton,
  FoodNotice,
  FoodPhoto,
  FoodPhotoStrip,
  RatingPill,
  DishRow,
} from '@/components/food';
import { useAppState } from '@/context/AppStateContext';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import type { Diet, Dish } from '@/types/food';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import { DishSheet } from '@/components/food/DishDetail';
import { ApiError } from '@/services/api/client';
import { useKitchen } from '@/services/hooks/useFood';

/**
 * A kitchen, with its menu.
 *
 * The kitchen's own photographs, and only those: its cover across the top,
 * its logo beside the name, and its restaurant photos in a row under the
 * identity block. Each is drawn over the photo well, so a slow or missing one
 * never moves the page, and a kitchen without one simply has none — there is
 * no stand-in picture. The name, distance and time stay the first words read.
 *
 * The kitchen is named ONCE, in the identity block, and the header bar
 * carries no title: it used to hold the name as well, which printed it twice
 * on one screen with the upper copy truncated.
 *
 * There is no deliver/pickup pair here any more. Pickup was withdrawn from the
 * product — the order endpoint refuses one — so every order is a delivery and
 * there is nothing on this screen for a diner to choose between.
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
    address,
    preferences,
    setPreferences,
  } = useFood();

  /*
   * The section chips JUMP, they do not filter: the whole menu stays on the
   * page and a tap scrolls its section's heading to just under the pinned bar.
   * The chip that is lit follows the scroll, so it always names the section
   * being read.
   */
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const stickyY = useRef(0);
  /* Height of the pinned overlay — what a jumped-to heading has to clear. */
  const barHeight = useRef(0);
  /* Each section's top, in content coordinates, from its own onLayout. */
  const sectionTops = useRef<Record<string, number>>({});
  const sectionsRef = useRef<readonly string[]>([]);
  /* While a tapped jump is animating, the scroll must not light every section
     it passes on the way. */
  const jumpLockUntil = useRef(0);

  /*
   * The lit chip, kept OUT of this screen's state. The chips subscribe to it
   * themselves (`SectionChips`), so a scroll across a section boundary
   * re-renders two short chip rows, not fifty dish rows.
   */
  const activeSection = useRef<string | null>(null);
  const activeListeners = useRef(new Set<(name: string | null) => void>());
  const setActiveSection = useCallback((name: string | null) => {
    if (activeSection.current === name) return;
    activeSection.current = name;
    activeListeners.current.forEach((listener) => listener(name));
  }, []);
  const subscribeActive = useCallback((listener: (name: string | null) => void) => {
    activeListeners.current.add(listener);
    return () => {
      activeListeners.current.delete(listener);
    };
  }, []);

  /* The section whose heading has reached the bottom of the pinned bar. */
  const trackSection = (y: number) => {
    if (Date.now() < jumpLockUntil.current) return;
    const line = y + barHeight.current + 1;
    let current: string | null = null;
    for (const name of sectionsRef.current) {
      const top = sectionTops.current[name];
      if (top !== undefined && top <= line) current = name;
    }
    setActiveSection(current);
  };

  const jumpToSection = (name: string) => {
    const top = sectionTops.current[name];
    if (top === undefined) return;
    setActiveSection(name);
    jumpLockUntil.current = Date.now() + 600;
    scrollRef.current?.scrollTo({ y: Math.max(0, top - barHeight.current), animated: true });
  };

  const pinnedRef = useRef(false);
  const pinnedListeners = useRef(new Set<(pinned: boolean) => void>());
  const subscribePinned = useCallback((listener: (pinned: boolean) => void) => {
    pinnedListeners.current.add(listener);
    listener(pinnedRef.current);
    return () => {
      pinnedListeners.current.delete(listener);
    };
  }, []);
  /*
   * The overlay is shown and hidden by the scroll position ON THE NATIVE SIDE,
   * never by React state. It used to be `pinned ? <overlay/> : null`, and the
   * first scroll past the bar re-rendered the whole menu and built the overlay
   * from nothing in the middle of the gesture — a visible jerk. Now it is
   * mounted once, and crossing the line costs no render at all.
   */
  const scrollAnim = useRef(new Animated.Value(0)).current;
  /* State, unlike `stickyY`: the interpolation below is built from it. Set on
     layout, so it changes when the identity block above does, not on scroll. */
  const [barY, setBarY] = useState(0);
  const [query, setQuery] = useState('');
  /*
   * The dish opened as a sheet over the menu. The id outlives `sheetOpen` so
   * the sheet still has its dish to draw while it closes.
   */
  const [sheetDishId, setSheetDishId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
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

  /*
   * The feed is scoped to where the student is, so a kitchen opened from an
   * old order, a favourite or a link can be one the feed never listed. It is
   * then asked for by id — the same query and cache entry the catalogue's own
   * menu fan-out uses — rather than reported as gone. Only asked when the
   * feed does not have it, so a listed kitchen costs nothing extra.
   */
  const listed = id ? findKitchen(id) : undefined;
  const detail = useKitchen(!listed && !loading ? id : null);
  const kitchen = listed ?? detail.data?.kitchen;
  /* A 404 is the server saying the kitchen is gone, which is the "not on
     LAMPOSE" screen below; anything else is the connection. */
  const detailError =
    detail.error && !(detail.error instanceof ApiError && detail.error.status === 404)
      ? (detail.error as Error).message
      : null;

  const open = kitchen ? kitchenOpen(kitchen) : false;

  /*
   * The dine-in floor travels on the kitchen's OWN response, not the feed
   * row. A listed kitchen whose menu the catalogue has not fanned out to yet
   * has not said either way, so it is read by id — the same cache entry the
   * catalogue would fill, so a kitchen already read costs nothing.
   */
  const knownFloor = kitchen ? dineInOf(kitchen) : undefined;
  const floorRead = useKitchen(kitchen && knownFloor === undefined ? id : null);
  const floor = knownFloor !== undefined
    ? knownFloor
    : floorRead.data
      ? dineInOf(floorRead.data.kitchen)
      : undefined;
  /* The restaurant's photos ride on the same response as the floor: a kitchen
     whose own page has been read carries them, and one that has not is read
     above. */
  const gallery = (knownFloor !== undefined ? kitchen?.gallery : floorRead.data?.kitchen.gallery) ?? [];
  const { width: screenWidth } = useWindowDimensions();

  /* `menuFor` is rebuilt whenever dishes arrive, so it belongs in here beside
     the kitchen: without it this menu is whatever had loaded on the render the
     screen opened on. A kitchen from the fallback brings its own dishes. */
  const detailDishes = detail.data?.dishes;
  const menu = useMemo(() => {
    if (!kitchen) return [];
    if (listed) return menuFor(kitchen);
    return [...(detailDishes ?? [])].sort(
      (a, b) => kitchen.sections.indexOf(a.section) - kitchen.sections.indexOf(b.section),
    );
  }, [menuFor, kitchen, listed, detailDishes]);
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
  sectionsRef.current = sections;


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
        {loading || loadingMenus || detail.isLoading ? (
          <FoodMenuSkeleton />
        ) : error || detailError ? (
          <FoodEmptyState
            tone="problem"
            title="Could not open this kitchen"
            body="The menu did not answer. The kitchen is probably fine — this is usually the connection."
            primaryLabel="Try again"
            onPrimary={() => {
              refetch();
              if (detailError) void detail.refetch();
            }}
            secondaryLabel="Back to food"
            onSecondary={() => router.back()}
            footnote={error ?? detailError ?? undefined}
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

  const sheetDish = sheetDishId ? menu.find((dish) => dish.id === sheetDishId) : undefined;

  const setDishQty = (dish: Dish, next: number) => {
    /* The row shows the TOTAL across this dish's lines (one per set of
       add-ons), so the stepper's `next` is a total too. It used to be written
       onto the first line as-is: two lines of 1 showed "2", a tap on + set the
       first line to 3, and the cart jumped to 4. Applied as a step to the
       newest line instead. */
    const dishLines = lines.filter((line) => line.dishId === dish.id);
    if (dishLines.length) {
      const target = dishLines[dishLines.length - 1];
      const delta = next - dishLines.reduce((sum, line) => sum + line.qty, 0);
      setQty(target.key, target.qty + delta);
      return;
    }
    if (next > 0) add(dish, { spice: preferences.spice, kitchen });
  };

  /*
   * The search field and the section chips — drawn twice: once in the flow of
   * the page, and once as an overlay pinned over the top of the list after the
   * first copy has scrolled away.
   *
   * It used to be one copy made sticky with `stickyHeaderIndices`, and on
   * Android the chips in it took several taps to answer. A sticky header stays
   * INSIDE the scrolling list, moved down by a transform on every frame, so a
   * tap on it is first the list's to claim — and one landing while the list
   * is still gliding only stops the glide. The overlay is not part of the list
   * at all, so every tap reaches the chip it lands on.
   */
  const renderFilterBar = () => (
      <View style={{ paddingBottom: space[3], gap: space[4] }}>
        <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            placeholder={`Search ${kitchen.name}'s menu`}
            returnKeyType="search"
            accessibilityLabel="Search this menu"
          />
        </View>

        {sections.length > 1 ? (
          <SectionChips sections={sections} onPick={jumpToSection} subscribe={subscribeActive} />
        ) : null}
      </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      {/* No title, deliberately. The kitchen is named in the identity block
          at the top of the content, in display type — carrying it up here as
          well printed the name twice on one screen, once truncated. */}
      <StandardHeader title="" onBack={() => router.back()} />

      <View style={{ flex: 1 }}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollAnim } } }], {
          useNativeDriver: true,
          /* Refs only — nothing here may cause a render. */
          listener: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
            const pinned = scrollY.current > stickyY.current;
            if (pinned !== pinnedRef.current) {
              pinnedRef.current = pinned;
              pinnedListeners.current.forEach((listener) => listener(pinned));
            }
            trackSection(scrollY.current);
          },
        })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
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
          {/* The kitchen's cover, as uploaded. Dimmed while it is closed, as
              on its card in the feed. */}
          {kitchen.cover ? (
            <FoodPhoto
              uri={kitchen.cover}
              height={Math.round((screenWidth - layout.gutter * 2) / 2.4)}
              radius={radius.card}
              muted={!open}
            />
          ) : null}
          <View style={styles.identityRow}>
            {kitchen.logo ? (
              <FoodPhoto uri={kitchen.logo} width={52} height={52} radius={radius.button} />
            ) : null}
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
                {kitchen.landmark || locality?.name}
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
                    kitchen.deliveryMinutes > 0
                      ? `${kitchen.prepMinutes + kitchen.deliveryMinutes} mins`
                      : `Ready in ${kitchen.prepMinutes} mins`,
                    open ? 'Open now' : 'Closed now',
                  )}
                </Text>
              </View>
            ) : null}
          </View>

          {address ? (
            <View style={styles.metaRow}>
              <Text variant="numMeta" color="tertiary" style={{ flex: 1 }}>
                Delivering to {address.title}
              </Text>
            </View>
          ) : null}

          {!open ? (
            <FoodNotice
              tone="deadline"
              title="Closed right now"
              body="Read the menu now — ordering opens the moment the kitchen does."
            />
          ) : null}

          {/* Dine-in, when this kitchen takes table bookings at all. Booking
              does not wait on the kitchen being open now — a table is for
              later — so it sits beside the closed notice, not behind it. */}
          {floor ? <DineInCard floor={floor} onBook={() => router.push(foodHref.bookTable(kitchen.id))} /> : null}
        </View>

        <FoodPhotoStrip
          title="Photos"
          uris={gallery}
          gutter={layout.gutter}
          provenance={`Photos from ${kitchen.name}`}
        />

        {/* The search field and the section chips, in the flow of the page.
            Once they scroll out of sight the overlay copy below takes over —
            see `renderFilterBar`. */}
        <View
          style={{ backgroundColor: colors.bg }}
          /* Where the bar sits in the content — the offset past which the
             overlay shows. */
          onLayout={(event) => {
            stickyY.current = event.nativeEvent.layout.y;
            setBarY(event.nativeEvent.layout.y);
          }}
        >
          {renderFilterBar()}
        </View>

        {/* Not pinned: only the search and the section chips stay under the
            header while the menu scrolls. */}
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

        {/* The menu */}
        {visible.length === 0 ? (
          term ? (
            <FoodEmptyState
              glyph="search"
              title={`Nothing matches “${query.trim()}”`}
              body={`${kitchen.name}'s menu doesn't have that. Try a different word, or clear the search to see everything.`}
              primaryLabel="Clear search"
              onPrimary={() => setQuery('')}
            />
          ) : (
            /* Only "nothing veg" when that is the reason. An empty menu, or a
               diet filter, said "Nothing veg" too — wrongly blaming veg-only
               for a menu that had simply not loaded. */
            preferences.vegOnly && menu.length > 0 ? (
              <FoodEmptyState
                title="Nothing veg on this menu today"
                body={`${kitchen.name} cooks ${menu.length} dishes, none of them veg. Turning veg-only off shows all of them.`}
                primaryLabel="Show everything"
                onPrimary={() => setPreferences({ vegOnly: false })}
              />
            ) : diets.length && menu.length > 0 ? (
              <FoodEmptyState
                title="Nothing matches these filters"
                body="Clear the filters to see the whole menu."
                primaryLabel="Clear filters"
                onPrimary={() => setDiets([])}
              />
            ) : (
              <FoodEmptyState
                title="No dishes to show right now"
                body={`${kitchen.name}'s menu could not be shown. Pull down to try again.`}
                primaryLabel="Back"
                onPrimary={() => router.back()}
              />
            )
          )
        ) : (
          sections
            .map((name) => {
              const dishes = visible.filter((dish) => dish.section === name);
              if (!dishes.length) return null;
              return (
                <View
                  key={name}
                  style={{ gap: 0 }}
                  /* Where a chip tap scrolls to. A direct child of the
                     ScrollView's content, so `y` is already in its terms. */
                  onLayout={(event) => {
                    sectionTops.current[name] = event.nativeEvent.layout.y;
                  }}
                >
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
                          onPress={() => {
                            setSheetDishId(dish.id);
                            setSheetOpen(true);
                          }}
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
      </Animated.ScrollView>

      {/* Always mounted, and never MOVED — see `PinnedBar`. */}
      <PinnedBar
        subscribe={subscribePinned}
        opacity={scrollAnim.interpolate({
          inputRange: [barY, barY + 1],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        })}
        onHeight={(height) => {
          barHeight.current = height;
        }}
      >
        {renderFilterBar()}
      </PinnedBar>
      </View>

      {count > 0 ? (
        <View style={{ paddingBottom: space[3] }}>
          <DockedCartBar
            count={count}
            total={itemTotal}
            context={address ? address.title : 'no address yet'}
            onPress={() => router.push(foodHref.cart)}
          />
        </View>
      ) : null}

      {sheetDish ? (
        <DishSheet
          key={sheetDish.id}
          dish={sheetDish}
          kitchen={kitchen}
          open={open}
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
        />
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

/**
 * The overlay copy of the search field and section chips.
 *
 * It sits at the top of the list the whole time and is only FADED in and out
 * — by the scroll, on the native side, so the fade is frame-exact. It used to
 * be parked 2000pt up and slid into place with a native-driven `translateY`,
 * and taps on its chips then worked once and stopped: on the new architecture
 * a native-driven transform is not written back to the shadow tree, so
 * `Pressable` measured the chip where it had been PARKED, decided every touch
 * had left it, and cancelled the press.
 *
 * Whether it takes touches is the one thing that needs React, and it is this
 * component's own state — flipping it re-renders the overlay alone (its
 * children are the same elements, so React skips them), never the menu.
 */
function PinnedBar({
  subscribe,
  opacity,
  onHeight,
  children,
}: {
  subscribe: (listener: (pinned: boolean) => void) => () => void;
  opacity: Animated.AnimatedInterpolation<number>;
  onHeight: (height: number) => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const [pinned, setPinned] = useState(false);
  useEffect(() => subscribe(setPinned), [subscribe]);

  return (
    <Animated.View
      pointerEvents={pinned ? 'auto' : 'none'}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      style={[styles.pinnedBar, { backgroundColor: colors.bg, opacity }]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The section chips — they jump to a section, they do not filter.
 *
 * Its own component so the lit chip can change on scroll without re-rendering
 * the menu: it reads the active section from `subscribe`, not from a prop.
 * Two copies are mounted (in the page and in the pinned overlay); both follow
 * the same source, and each keeps its lit chip scrolled into view.
 */
function SectionChips({
  sections,
  onPick,
  subscribe,
}: {
  sections: readonly string[];
  onPick: (name: string) => void;
  subscribe: (listener: (name: string | null) => void) => () => void;
}) {
  const { colors, space, layout, radius } = useTheme();
  const [active, setActive] = useState<string | null>(null);
  const rowRef = useRef<ScrollView>(null);
  const chips = useRef<Record<string, { x: number; width: number }>>({});
  const rowX = useRef(0);
  const rowWidth = useRef(0);

  useEffect(() => subscribe(setActive), [subscribe]);

  /* Slide the row only when the lit chip is actually out of view. A chip that
     was just TAPPED is on screen by definition, and sliding the row anyway
     would swallow the next tap: a touch on a row that is still moving only
     stops it. */
  useEffect(() => {
    const chip = active ? chips.current[active] : undefined;
    if (!chip) return;
    const inView = chip.x >= rowX.current && chip.x + chip.width <= rowX.current + rowWidth.current;
    if (!inView) rowRef.current?.scrollTo({ x: Math.max(0, chip.x - layout.gutter), animated: true });
  }, [active, layout.gutter]);

  return (
    <ScrollView
      ref={rowRef}
      onLayout={(event) => {
        rowWidth.current = event.nativeEvent.layout.width;
      }}
      onScroll={(event) => {
        rowX.current = event.nativeEvent.contentOffset.x;
      }}
      scrollEventThrottle={32}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: space[2] }}
    >
      {sections.map((name) => {
        const on = active === name;
        return (
          <Pressable
            key={name}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              chips.current[name] = { x, width };
            }}
            onPress={() => onPick(name)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Jump to ${name}`}
            style={[
              styles.sectionChip,
              {
                borderRadius: radius.pill,
                paddingHorizontal: space[3],
                backgroundColor: on ? colors.graphite : colors.surface,
                borderColor: on ? colors.graphite : colors.border,
              },
            ]}
          >
            <Text variant="label" style={{ color: on ? colors.onGraphite : colors.textSecondary, letterSpacing: 0.3 }}>
              {name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pinnedBar: { position: 'absolute', top: 0, left: 0, right: 0 },
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
