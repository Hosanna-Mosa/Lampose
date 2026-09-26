import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { contactNumberOf, metaLine, walkLabel } from '@/services/adapters/food.adapter';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, SearchField, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  DietMark,
  DockedCartBar,
  FoodEmptyState,
  FoodMenuSkeleton,
  FoodNotice,
  RatingPill,
  DishRow,
} from '@/components/food';
import { useAppState } from '@/context/AppStateContext';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import type { Diet, Dish } from '@/types/food';
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

  const setDishQty = (dish: Dish, next: number) => {
    const existing = lines.find((line) => line.dishId === dish.id);
    if (existing) {
      setQty(existing.key, next);
      return;
    }
    if (next > 0) add(dish, { spice: preferences.spice });
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
          well printed the name twice on one screen, once truncated. The bar
          keeps the back arrow and the call action, which are the two things
          that have to stay reachable. */}
      <StandardHeader
        title=""
        onBack={() => router.back()}
        actionIcon={phone ? 'phone' : undefined}
        onAction={phone ? call : undefined}
      />

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
        </View>

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
            <FoodEmptyState
              title="Nothing veg on this menu today"
              body={`${kitchen.name} cooks ${menu.length} dishes, none of them veg. Turning veg-only off shows all of them.`}
              primaryLabel="Show everything"
              onPrimary={() => setPreferences({ vegOnly: false })}
            />
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
