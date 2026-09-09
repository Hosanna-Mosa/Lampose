import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Icon, Text } from '@/components/ui';
import { useAppState } from '@/context/AppStateContext';
import { useFood } from '@/context/FoodContext';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { vegModeOf, type Dish, type Kitchen, type VegMode } from '@/types/food';

import { DishTile } from './DishRow';
import { foodHref } from './routes';
import { FoodEmptyState, FoodFeedSkeleton } from './FoodStates';
import { FoodNotice, FoodSectionHeader } from './FoodNotices';
import { VegModeSheet } from './VegModeSheet';
import { VegModeTransition } from './VegModeTransition';
import { VegModeButton } from './VegModeButton';
import { PromoBanner, PROMO_ASPECT, type PromoSlide } from './PromoBanner';
import { HEADER_HEIGHT } from '@/components/shell';
import { CuisineRail } from './CuisineRail';
import { CuisineSheet } from './CuisineSheet';
import { RestaurantListCard } from './RestaurantListCard';
import { ActiveOrderCard } from './FoodStatus';
import { SUGGESTIONS } from './FoodSearch';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';

/**
 * Home — the Food module's feed.
 *
 * The reading order is still the order a hungry student actually decides in
 * — where it goes, who is cooking, what is cheap — this pass changes how
 * loudly each of those is said, not what they are. See `layout revert` if
 * this round does not earn its keep: the whole thing reverts to the version
 * before it in one step.
 *
 * Every colour used below is one already spent elsewhere in the app —
 * `colors.brand` and `colors.warning`, nothing invented — and every badge
 * and banner states something derived from real data (kitchen count, a
 * kitchen's own delivery fee, a real prep time). No percentage, no
 * "district"-style loyalty mark, no discount: see `PromoBanner` and
 * `RestaurantListCard`'s own doc comments for why, and the module audit
 * earlier this session for the mistake this is deliberately not repeating.
 */
export function FoodHome({
  onSearch,
  onBannerUnderHeader,
}: {
  onSearch: () => void;
  /** See `FoodModule.onBannerUnderHeader`. */
  onBannerUnderHeader?: (under: boolean) => void;
}) {
  const {
    dishesFor,
    findKitchen,
    kitchenOpen,
    kitchensFor,
    menuFor,
    loading,
    loadingMenus,
    error,
    refetch,
  } = useFoodCatalogue();
  const { colors, space, layout, radius } = useTheme();
  const reduceMotion = useReduceMotion();
  const router = useRouter();
  const { locality } = useAppState();
  const {
    liveOrder,
    address,
    preferences,
    setPreferences,
  } = useFood();

  /* The picker sheet ("veg items" vs "pure veg kitchens") and the full-screen
     transition are two different pieces of state on purpose: the sheet is a
     question, live only while it is open; the transition is an ANSWER already
     acted on, playing out over content that has already changed underneath
     it. Conflating them would mean the filter only actually applies once the
     animation finishes, which turns a 1.1s flourish into 1.1s of the tap
     appearing to do nothing. */
  const [vegPickerOpen, setVegPickerOpen] = useState(false);
  const [vegTransition, setVegTransition] = useState<VegMode | null>(null);
  /* Holds the timer `chooseVegMode` schedules below, so it can be cancelled
     if this screen unmounts mid-wait — the food tab swaps Home out for
     Search/Orders by unmounting it, and a timer that fires afterwards would
     call `setVegTransition` on a component nothing is reading any more. */
  const vegModeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (vegModeTimer.current) clearTimeout(vegModeTimer.current);
  }, []);

  /* The category rail's two filters. Both are additive on top of veg mode,
     never a replacement for it — see the `kitchens` derivation below. */
  const [cuisineFilter, setCuisineFilter] = useState<string | null>(null);
  const [cheapOnly, setCheapOnly] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  /*
   * The app header is PINNED over this screen's banner rather than sitting
   * above it, so two things are computed here and nowhere else.
   *
   * `headerRoom` is what the controls drawn on the artwork have to clear:
   * the device's own top inset plus the bar's height. `HeroControls` starts
   * below it.
   *
   * `bannerUnderHeader` is which way the bar should be painted. While the
   * artwork is still behind it, white ink on a scrim; once the feed has
   * scrolled up under it, white ink would be white-on-white, so the bar goes
   * back to being an ordinary opaque one. Only this component can answer it,
   * because the banner's height is derived from the artwork's ratio and the
   * screen's width — nothing above it knows either.
   */
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerRoom = insets.top + HEADER_HEIGHT;
  const bannerHeight = Math.round(width / PROMO_ASPECT);

  /* Compared against a ref, not state: this fires on every scroll frame and
     only the CROSSING matters. Re-rendering the whole feed sixty times a
     second to re-assert the same boolean is the version of this that drops
     frames. */
  const underHeader = useRef(true);
  const reportScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = event.nativeEvent.contentOffset.y < bannerHeight - headerRoom;
      if (next !== underHeader.current) {
        underHeader.current = next;
        onBannerUnderHeader?.(next);
      }
    },
    [bannerHeight, headerRoom, onBannerUnderHeader],
  );

  const areaLabel = locality?.name ?? 'your area';
  const vegMode = vegModeOf(preferences);

  /*
   * A kitchen counts as pure veg by its MENU, not by a flag it set once —
   * there is no such flag on `Kitchen`, and a kitchen that quietly added one
   * non-veg dish would otherwise keep advertising itself as pure veg forever.
   * Empty-menu kitchens are excluded rather than counted as vacuously pure
   * veg: "every dish is veg" is not a claim worth making about a kitchen with
   * no dishes to check it against.
   */
  const isPureVeg = useCallback(
    (kitchen: Kitchen) => {
      const menu = menuFor(kitchen);
      return menu.length > 0 && menu.every((dish) => dish.diet === 'veg');
    },
    [menuFor],
  );

  const hasCheapDish = useCallback(
    (kitchen: Kitchen) => menuFor(kitchen).some((dish) => dish.price <= 100 && !dish.soldOut),
    [menuFor],
  );

  /*
   * The one dish a kitchen's card names on its photograph.
   *
   * Most-ordered first, because that is the closest thing the data has to
   * "what this kitchen is known for" — the question a photo of a plate is
   * being asked to answer. Falls back to the first dish still on sale, and
   * to nothing at all for a kitchen whose menu is empty or has not loaded,
   * where the badge simply does not draw.
   *
   * Sold-out dishes are never chosen: naming one on the card and then
   * greying it out on the menu is a wasted tap the card caused.
   */
  const highlightDish = useCallback(
    (kitchen: Kitchen) => {
      const sellable = menuFor(kitchen).filter((dish) => !dish.soldOut);
      if (!sellable.length) return undefined;
      return sellable.reduce((best, dish) =>
        (dish.ordersInBlock ?? 0) > (best.ordersInBlock ?? 0) ? dish : best,
      );
    },
    [menuFor],
  );

  /* Both of these depend on the catalogue: the helpers are rebuilt whenever
     rows arrive, so leaving them out of the dependencies froze the feed at
     whatever was loaded on the first render — which, on a cold start, is
     nothing at all. */
  const allKitchens = useMemo(() => kitchensFor(), [kitchensFor]);
  const vegFilteredKitchens = useMemo(
    () => (preferences.vegRestaurantsOnly ? allKitchens.filter(isPureVeg) : allKitchens),
    [allKitchens, preferences.vegRestaurantsOnly, isPureVeg],
  );

  /* The rail's own chips — the cuisines actually present once veg mode has
     already narrowed the field, so a pure-veg view never offers a chip for a
     cuisine none of its kitchens carry. Sorted for a stable order run to
     run, not the order kitchens happen to load in. */
  /*
   * The rail's cuisines, each with its own bundled photograph.
   *
   * The WHICH is still live — the list is the set of `cuisineTypes` the
   * kitchens near you actually declare, so a cuisine nobody cooks never
   * appears and tapping one still filters exactly as before. Only the
   * PICTURE is fixed now.
   *
   * It used to take a real dish photo off a kitchen carrying the tag, and
   * that was broken twice over. The lookup picked the kitchen's first
   * photographed menu item without reference to the tag being matched, so
   * every cuisine on a kitchen got the same dish; and because all fifteen
   * seeded restaurants share one fifty-dish menu with shared Cloudinary
   * images, that dish was the same photograph everywhere. Every chip showed
   * one picture.
   *
   * Curated artwork fixes it at the root rather than patching the lookup:
   * one image per cuisine, chosen to actually look like the cuisine, which
   * a dish pulled out of a menu by position never reliably does.
   */
  const cuisineOptions = useMemo(() => {
    const tags = new Set<string>();
    vegFilteredKitchens.forEach((kitchen) => kitchen.cuisineTypes.forEach((tag) => tags.add(tag)));
    return [...tags]
      .map((name) => ({ name, photo: cuisineArt(name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [vegFilteredKitchens]);

  /*
   * The dishes the "see all" sheet lists, most-ordered first.
   *
   * DEDUPLICATED BY NAME, which is the whole difficulty. Every seeded
   * restaurant carries the same fifty-dish menu, so an undeduplicated list
   * is "Masala Chai" thirteen times before it reaches a second dish — a
   * grid of famous dishes that shows one dish. The most-ordered copy wins,
   * so the tile also opens the kitchen selling the most of it.
   */
  const popularDishes = useMemo(() => {
    const byName = new Map<string, Dish>();
    dishesFor().forEach((dish) => {
      if (!dish.photo || dish.soldOut) return;
      const held = byName.get(dish.name);
      if (!held || (dish.ordersInBlock ?? 0) > (held.ordersInBlock ?? 0)) byName.set(dish.name, dish);
    });
    return [...byName.values()]
      .sort((a, b) => (b.ordersInBlock ?? 0) - (a.ordersInBlock ?? 0))
      .slice(0, 40);
  }, [dishesFor]);

  /* "All" gets its own plate rather than the feed's most-ordered dish: the
     chip means "no filter", and a picture of one specific dish is the least
     accurate thing to put on it. */
  const allPhoto = CUISINE_ART_ALL;

  const kitchens = useMemo(() => {
    let list = vegFilteredKitchens;
    if (cuisineFilter) list = list.filter((kitchen) => kitchen.cuisineTypes.includes(cuisineFilter));
    if (cheapOnly) list = list.filter(hasCheapDish);
    return list;
  }, [vegFilteredKitchens, cuisineFilter, cheapOnly, hasCheapDish]);
  const openKitchens = kitchens.filter((kitchen) => kitchenOpen(kitchen));

  /* Whether the CURRENT list is empty because of veg mode specifically (the
     existing, already-handled case) or because of the rail's own filters —
     two different empty states with two different "clear" actions, decided
     in that order because veg mode narrows the field before the rail's
     filters ever see it. */
  const vegOnlyEmptied = preferences.vegRestaurantsOnly && vegFilteredKitchens.length === 0;
  const railEmptied = !vegOnlyEmptied && vegFilteredKitchens.length > 0 && kitchens.length === 0;

  const dishes = useMemo(() => {
    const all = dishesFor();
    const vegFiltered = preferences.vegOnly ? all.filter((dish) => dish.diet === 'veg') : all;
    /* Always scoped to the CURRENT kitchen list — veg mode, the cuisine
       chip and the price tile all narrow `kitchens` above, and the rails
       below have to agree with whichever of them is active or "Under ₹100"
       would still offer a dish from a kitchen the grid just hid. */
    const kitchenIds = new Set(kitchens.map((kitchen) => kitchen.id));
    return vegFiltered.filter((dish) => kitchenIds.has(dish.kitchenId));
  }, [dishesFor, preferences.vegOnly, kitchens]);

  /*
   * Choosing a mode, and switching it off, both go through the same steps in
   * the same order: the preference is set FIRST, the transition animation
   * SECOND. The animation is a beat over a change that has already happened,
   * not a loading state blocking one that hasn't — so the feed underneath is
   * already correct by the time the full-screen fades away.
   *
   * `chooseVegMode` additionally waits a beat before doing either. React
   * Native does not reliably show one `Modal` opening in the same commit
   * that another closes — most visible on Android, where the OS can drop the
   * new window while the old one's is still tearing down — and the picker
   * sheet closing (`setVegPickerOpen(false)`, one commit up in `pressVegButton`
   * / the sheet's own `onChoose`) is exactly that: another Modal, closing
   * right as this one would try to open. The short wait lets the sheet's
   * Modal actually finish closing first, so the transition's Modal is the
   * only one asking to be shown. `turnVegModeOff` has no sheet to wait on —
   * it is the only Modal in play — so it applies immediately.
   */
  const chooseVegMode = (mode: Exclude<VegMode, 'off'>) => {
    setVegPickerOpen(false);
    if (vegModeTimer.current) clearTimeout(vegModeTimer.current);
    vegModeTimer.current = setTimeout(() => {
      vegModeTimer.current = null;
      setPreferences({ vegOnly: true, vegRestaurantsOnly: mode === 'restaurants' });
      setVegTransition(mode);
    }, 250);
  };

  const turnVegModeOff = () => {
    setPreferences({ vegOnly: false, vegRestaurantsOnly: false });
    setVegTransition('off');
  };

  const pressVegButton = () => {
    if (vegMode === 'off') setVegPickerOpen(true);
    else turnVegModeOff();
  };

  const clearRailFilters = () => {
    setCuisineFilter(null);
    setCheapOnly(false);
  };

  /*
   * Three quiet screens that are not the same screen.
   *
   * Nothing has arrived yet; the request failed; or no kitchen near this
   * student has been approved. Only the middle one is worth retrying, only the
   * last one is about kitchens rather than about the network, and the first
   * one is not a state at all — it is a wait, and it gets the layout it is
   * about to become rather than a sentence apologising for itself.
   */
  if (loading && allKitchens.length === 0) return <FoodFeedSkeleton />;

  if (error && allKitchens.length === 0) {
    return (
      <FoodEmptyState
        tone="problem"
        title="Could not load what is cooking"
        body="Nothing is wrong with your account or an order you have placed — the kitchen feed did not answer. It is usually the connection."
        primaryLabel="Try again"
        onPrimary={refetch}
        footnote={error}
      />
    );
  }

  if (allKitchens.length === 0) {
    return (
      <FoodEmptyState
        title={`No kitchen near ${areaLabel} yet`}
        body="A kitchen appears here the day it is approved, and none near you has been. Nothing is hidden behind a filter — there is genuinely nobody cooking on LAMPOSE here."
        primaryLabel="Check again"
        onPrimary={refetch}
      />
    );
  }

  const unfiltered = dishesFor().length;
  const cheap = dishes.filter((dish) => dish.price <= 100 && !dish.soldOut).slice(0, 6);
  const popular = [...dishes]
    .filter((dish) => dish.ordersInBlock)
    .sort((a, b) => (b.ordersInBlock ?? 0) - (a.ordersInBlock ?? 0))
    .slice(0, 6);

  const openKitchen = (id: string) => router.push(foodHref.kitchen(id));
  const openDish = (id: string) => router.push(foodHref.dish(id));

  /*
   * The block's slides — whole-block artwork, one file each.
   *
   * A slide here is not a strip under a header any more; it IS the header.
   * Each file carries the background AND the message in one picture, drawn
   * at 1.5, and the locality line and search field are laid over its clean
   * upper third. That is what finally makes the top of this screen one
   * surface: there is no seam to hide, because there is no longer a second
   * thing.
   *
   * `headline`/`body`/`metric` stay absent for the same reason as before —
   * the lettering is baked in, and a second set drawn over it would collide
   * with the first.
   *
   * ## Ratios, and the reconstruction three of these needed
   *
   * The pager has exactly ONE height, so every file here has to be 1.5.
   * Only `fullfirst` was drawn that way; `fullsecond`, `fullthird` and
   * `fullfourth` arrived at 2.0, which at 1.5 would have lost 12.5% off
   * each side and cut into the lettering. Rather than crop them, the build
   * step mirrored each one's top rows upward and blurred them: mirroring
   * puts row 0 next to row 0, so the join cannot show, and the blur stops
   * the mirrored content being readable. The original's own top 150 rows
   * are then feathered from that blur into focus, or the blurred band ends
   * against sharp leaves and its rectangle is visible.
   *
   * Artwork drawn at 3:2 needs none of this. It is worth asking for.
   *
   * The earlier 2.38 strips (`banner-brighter-mood.jpg`,
   * `banner-street-bites.jpg`, `banner-delivered.jpg`,
   * `banner-first-order.jpg`) and `hero-spices.jpg` are all superseded now
   * and referenced by nothing.
   *
   * ## The 50%-off slide
   *
   * `banner-full-first-order.jpg` promises a discount this app cannot yet
   * honour — every order it has ever written carries `discount: 0`, so a
   * diner who taps it arrives at full price. That was raised twice and
   * included anyway, deliberately, so this is a note rather than an
   * argument: the slide comes out, or the discount gets built, before this
   * is in front of real diners. It is the one thing on this screen that
   * breaks the rule the rest of the module keeps — see
   * `RestaurantListCard` on why no card here ever shows a percentage.
   *
   * Every slide carries `onPress`, because every one of these images has a
   * button PAINTED into it. See `PromoSlide.onPress`.
   */
  const promoSlides: PromoSlide[] = [
    {
      id: 'full-brighter-mood',
      tone: 'brand',
      image: require('../../assets/images/banner-full-brighter-mood.jpg'),
      /* Measured off `new1.png` itself, not estimated: the painted plume
         leaves the biryani at 64% of the picture's height and has faded out
         by 49%, centred on 68% of its width. The moving puffs start inside
         the painted ones and carry on past where they stop. */
      /* The words are NOT in this file any more — the build step lifted them
         out and the app draws them, so they can move. Coordinates and the
         yellow are both measured off `new1.png`, which still has them. */
      headlineArt: {
        x: 0.06,
        y: 0.548,
        eyebrow: 'GOOD FOOD',
        /* Cap heights read off the painted words, converted to point sizes
           for a 360dp card: 6.1dp, 20.8dp and 22.7dp of cap. "Mood" really
           is set larger than "Brighter" in the original. */
        eyebrowSize: 9,
        line1: 'Brighter',
        line1Size: 29,
        line2: 'Mood',
        line2Size: 32,
        accent: '#FFE604',
      },
      /* `strength` 1 — this is the banner the default was tuned against. Its
         shaded green garden gives white steam the most contrast of the
         four, so it needs no help. */
      steam: [{ x: 0.68, y: 0.64, rise: 0.24, spread: 0.13, strength: 1 }],
      onPress: onSearch,
      label: 'Order now — find dishes and kitchens near you',
    },
    {
      id: 'full-first-order',
      tone: 'caution',
      image: require('../../assets/images/banner-full-first-order.jpg'),
      /* Two, both measured off `new2.png`: the coconut chutney bowl at 68%
         across and the filter coffee tumbler at 77%. The coffee's is the
         smaller and shorter of the pair, because a tumbler that size does
         not throw the plume a full bowl does — a matched pair would read as
         two copies of one effect rather than as two hot things. */
      /* Pushed harder than the green banner: this one steams against a lit
         orange sky, where white has far less of the range to itself. */
      steam: [
        { x: 0.679, y: 0.632, rise: 0.22, spread: 0.12, strength: 1.2 },
        { x: 0.774, y: 0.661, rise: 0.16, spread: 0.09, strength: 1.2 },
      ],
      onPress: onSearch,
      label: 'New user offer — flat 50% off your first order',
    },
    {
      id: 'full-street-bites',
      tone: 'caution',
      image: require('../../assets/images/banner-full-street-bites.jpg'),
      /* The chai glass, measured off `new3.png` — 61% across, leaving the
         glass at 58% down. The noodles beside it are being lifted cold on
         chopsticks and get none: steam on food the picture does not show as
         hot is the same kind of lie as a badge with no data behind it. */
      /* The hardest of the three, and pushed hardest. White steam on a pale
         pink sky is a small step however opaque it is — this is close to the
         ceiling of what the effect can do here, and if it still reads faint
         the fix is a warmer, greyer steam rather than a more opaque white. */
      steam: [{ x: 0.613, y: 0.583, rise: 0.22, spread: 0.105, strength: 1.35 }],
      onPress: onSearch,
      label: 'Explore a wide variety of cuisines near you',
    },
    {
      id: 'full-delivered',
      tone: 'brand',
      /* A PLATE — the scooter has been taken out of this file and is layered
         over it by `rider` below, so it can be driven. */
      image: require('../../assets/images/banner-full-delivered.jpg'),
      rider: {
        image: require('../../assets/images/banner-full-delivered-bike.png'),
        aspect: 1.313,
        size: 0.36,
        /*
         * Every point sits inside the road, and so does every point BETWEEN
         * them — which is the part the earlier versions got wrong.
         *
         * The road is found by colour (dark blue, green channel under 115,
         * against bright water over 140) and its centreline walked row by
         * row from the pin downward, each row taking the run nearest the
         * one above it. Sampling columns independently does not work here:
         * at x 0.86 a column meets the ribbon near the top AND the broad
         * near road at the bottom, with WATER between them. Reading that as
         * one span is what put a path segment across open water — the
         * scooter rode correctly for a while and then struck out across the
         * river, which is exactly what it looked like.
         *
         * ## Why it stops short of the pin
         *
         * Walked properly, the ribbon above y 0.88 is a tight S and between
         * 0.5% and 4% of the card wide. That is a route line on a map, not
         * a road with room for a vehicle: a scooter scaled to sit inside it
         * is about 17dp across and reads as a speck, and one scaled to be
         * visible covers the whole thing. So the ride ends at the top of the
         * first sweep and fades, which is what going into the distance looks
         * like anyway. Reaching the marker was a nice idea that the artwork
         * will not support.
         *
         * Scale falls faster than distance because the road is receding —
         * equal steps in TIME are unequal steps in the picture.
         */
        path: [
          { x: 0.62, y: 0.99, scale: 1.0, tilt: -2 },
          { x: 0.7, y: 0.972, scale: 0.88, tilt: -2 },
          { x: 0.78, y: 0.952, scale: 0.74, tilt: -3 },
          { x: 0.84, y: 0.93, scale: 0.6, tilt: -3 },
          { x: 0.888, y: 0.911, scale: 0.48, tilt: -3 },
          { x: 0.93, y: 0.893, scale: 0.39, tilt: -2 },
          /* 0.32 rather than 0.27. Still a three-fold reduction, so the
             recession reads — but small enough and it stops looking like
             distance and starts looking like the scooter disappearing. */
          { x: 0.965, y: 0.876, scale: 0.32, tilt: -2 },
        ],
      },
      onPress: onSearch,
      label: 'Order now — your favourite food, delivered',
    },
  ];

  return (
    <>
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: space[8], gap: space[4] }}
      onScroll={reportScroll}
      scrollEventThrottle={16}
    >
      {/* One block, and now literally one picture.
          Earlier passes stacked a coloured hero on top of a banner strip and
          worked at hiding the join — first the gap, then the corner radius,
          then the colour either side of it. The artwork solved it instead:
          one image carries the background and the message together, so the
          controls simply sit ON it and there is no join left to hide.

          `box-none` on the overlay: it spans the whole picture, and without
          it the artwork underneath would be untappable everywhere the
          search field and the toggle do not reach — including the "Order
          Now" button painted into the picture, which is the most likely
          place on the whole screen for a thumb to land. */}
      <View>
        <PromoBanner slides={promoSlides} />

        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <HeroControls
            areaLabel={areaLabel}
            onSearch={onSearch}
            vegMode={vegMode}
            onPressVeg={pressVegButton}
            headerRoom={headerRoom}
          />
        </View>

        {/* The bottom edge, curved rather than a straight cut into the page
            below. See `BannerCurve`'s own comment for how and why. */}
        <BannerCurve width={width} />
      </View>

      {/* The whole wrapper is conditional, not just its contents.
          It used to render empty whenever veg mode was off — which is the
          default — and an empty child of a `gap`-spaced ScrollView is not
          free: it collects a gap above AND below itself, so a row with
          nothing in it was costing two gaps' worth of dead space between
          the banner and the rail. */}
      {vegMode !== 'off' ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <View style={styles.filterRow}>
            <Text variant="caption" color="tertiary" style={{ flex: 1 }} numberOfLines={2}>
              {vegMode === 'restaurants'
                ? 'Showing pure veg kitchens only — every dish on their menu is veg.'
                : 'Non-veg dishes are hidden. Kitchens that also cook non-veg still show up.'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Pulled up into the gap above it.
          The rail reserves `ARC_RISE` of headroom at its top so the tiles
          that ride UP at either end are not clipped by the scroll bounds —
          that padding is load-bearing and cannot simply be deleted. But it
          does not have to be ADDED to the gap the ScrollView already puts
          there: this margin lets the arc's headroom overlap that gap
          instead, which is the difference between a rail that sits close
          under the banner and one that floats. Tuned to leave the risen end
          tiles a few points clear of the banner's own bottom edge. */}
      <View style={{ marginTop: -space[3] }}>
        <CuisineRail
          cuisines={cuisineOptions}
          allPhoto={allPhoto}
          active={cuisineFilter}
          onChange={setCuisineFilter}
          cheapActive={cheapOnly}
          onToggleCheap={() => setCheapOnly((current) => !current)}
          onSeeAll={() => setBrowseOpen(true)}
        />
      </View>

      {/* The order in flight, mirrored here so it is not something you have to
          go looking for. Orders holds the full version. */}
      {liveOrder ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <ActiveOrderCard
            order={liveOrder}
            headline={
              liveOrder.fulfilment === 'pickup'
                ? 'Waiting at the counter'
                : address ? `Arriving at ${address.title}` : 'Arriving soon'
            }
            detail={`${liveOrder.kitchenName} · ${liveOrder.lines.map((line) => line.name).join(', ')}`}
            actionLabel="Track order"
            onPress={() => router.push(foodHref.order(liveOrder.id))}
          />
        </View>
      ) : null}

      {/* A refresh that did not get through, over rows that did. The kitchens
          below are still worth reading; whether they are cooking and what they
          charge may have moved since, and that is worth one line and a retry
          rather than a screen the student cannot get past. */}
      {error ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <FoodNotice
            tone="problem"
            title="This feed is not current"
            body="The last refresh did not reach us, so prices and who is open may have changed."
            actionLabel="Try again"
            onAction={refetch}
          />
        </View>
      ) : null}

      {/* 2 — who is cooking, as a single column of full-width cards */}
      <View style={{ gap: space[2] }}>
        <View style={{ paddingHorizontal: layout.gutter }}>
          <FoodSectionHeader
            title="Recommended for you"
            trailing={`${openKitchens.length} of ${kitchens.length} cooking`}
          />
        </View>

        {/*
          Pure veg mode zeroed the list — a real outcome near a locality with
          no all-veg kitchen, not a bug. Distinguished from "no kitchen near
          you at all" above: `allKitchens` is not empty, this filter made it
          look that way, so the way out is offered right here rather than
          sending the student to hunt for the button that did it.
        */}
        {vegOnlyEmptied ? (
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodNotice
              tone="info"
              title="No pure veg kitchen near you"
              body={`${allKitchens.length} ${allKitchens.length === 1 ? 'kitchen cooks' : 'kitchens cook'} near ${areaLabel}, but none of them is all-veg. Veg items from all of them are still one tap away.`}
              actionLabel="Show veg items instead"
              onAction={() => chooseVegMode('items')}
            />
          </View>
        ) : railEmptied ? (
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodNotice
              tone="info"
              title="No kitchens match these filters"
              body="Nothing near you carries that cuisine tag, or has a dish that cheap, right now."
              actionLabel="Clear filters"
              onAction={clearRailFilters}
            />
          </View>
        ) : (
          /* One column, not two. A grid tile at half the screen's width is
             too small to carry a photograph anybody would order from — see
             `RestaurantListCard`. */
          <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
            {kitchens.map((kitchen, index) => (
              <RestaurantListCard
                key={kitchen.id}
                kitchen={kitchen}
                open={kitchenOpen(kitchen)}
                onPress={() => openKitchen(kitchen.id)}
                highlight={highlightDish(kitchen)}
                index={index}
              />
            ))}
          </View>
        )}
      </View>

      {/* 3 — what is cheap. A rail, because this is browsing rather than deciding. */}
      {cheap.length ? (
        <View style={{ gap: space[2] }}>
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodSectionHeader
              title={preferences.vegOnly ? `Under ${formatRupees(100)}, veg` : `Under ${formatRupees(100)}`}
              trailing={`${cheap.length} dishes`}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: space[2] }}
          >
            {cheap.map((dish) => (
              <DishTile
                key={dish.id}
                dish={dish}
                kitchenName={findKitchen(dish.kitchenId)?.name ?? ''}
                onPress={() => openDish(dish.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {popular.length ? (
        <View style={{ gap: space[2] }}>
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodSectionHeader title="Ordered most in your building" trailing="this week" />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: space[2] }}
          >
            {popular.map((dish) => (
              <DishTile
                key={dish.id}
                dish={dish}
                kitchenName={findKitchen(dish.kitchenId)?.name ?? ''}
                onPress={() => openDish(dish.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/*
        An empty dish rail has two causes and only one of them is the veg
        filter. Blaming the filter for a menu that has not arrived yet sends a
        student to turn off a setting that was never the problem.

        Gated on `kitchens.length > 0` as well: with any filter down to zero
        kitchens, `dishes` is empty for the same reason `kitchens` is, and
        that is already explained above with its own way out. Showing a
        second, differently-worded empty state under it would be two answers
        to one question.
      */}
      {dishes.length === 0 && kitchens.length > 0 ? (
        loadingMenus ? (
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodNotice
              tone="info"
              title="Reading the menus"
              body={`${kitchens.length} ${kitchens.length === 1 ? 'kitchen is' : 'kitchens are'} listed near you. What each of them is cooking is still arriving.`}
            />
          </View>
        ) : preferences.vegOnly && unfiltered > 0 ? (
          <FoodEmptyState
            title="No veg dishes near you"
            body={`Every dish near you is non-veg today. Turning veg mode off shows ${unfiltered} dishes.`}
            primaryLabel="Show everything"
            onPrimary={turnVegModeOff}
          />
        ) : (
          <FoodEmptyState
            title="Nothing on any menu near you"
            body={`${kitchens.length} ${kitchens.length === 1 ? 'kitchen is' : 'kitchens are'} listed near ${areaLabel}, and none of them has a dish listed yet.`}
            primaryLabel="Check again"
            onPrimary={refetch}
          />
        )
      ) : null}

      <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
        <Pressable
          onPress={() => router.push(foodHref.favourites)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.link,
            {
              backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
              borderColor: colors.border,
              borderRadius: radius.card,
              padding: space[3],
              gap: space[3],
            },
          ]}
        >
          <Icon name="bookmark" size={20} color={colors.brandInk} />
          <View style={{ flex: 1 }}>
            <Text variant="title3">Favourites</Text>
            <Text variant="caption" color="tertiary">
              The dishes you order again
            </Text>
          </View>
          <Icon name="chevronRight" size={16} color={colors.textTertiary} />
        </Pressable>

        <Pressable
          onPress={() => router.push(foodHref.preferences)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.link,
            {
              backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
              borderColor: colors.border,
              borderRadius: radius.card,
              padding: space[3],
              gap: space[3],
            },
          ]}
        >
          <Icon name="filters" size={20} color={colors.brandInk} />
          <View style={{ flex: 1 }}>
            <Text variant="title3">Food preferences</Text>
            <Text variant="caption" color="tertiary" numberOfLines={1}>
              {preferences.diet === 'veg' ? 'Veg' : preferences.diet === 'egg' ? 'Veg and egg' : 'Everything'} ·{' '}
              {preferences.spice} spice · {preferences.allergens.length} flagged
            </Text>
          </View>
          <Icon name="chevronRight" size={16} color={colors.textTertiary} />
        </Pressable>
      </View>

      {/*
        The honest footer.
        Two admissions, deliberately quiet rather than a red banner at the top:
        every ready time on this screen is the kitchen's own estimate, and the
        catalogue behind it is mock data behind the `dev` gate. A student on a
        production build never reaches this screen at all.
      */}
      <Text variant="numMeta" color="tertiary" style={{ paddingHorizontal: layout.gutter }}>
        Ready times are the kitchen&apos;s estimate · dev build, mock catalogue (EXPO_PUBLIC_FOOD_MODE)
      </Text>
    </ScrollView>

    <CuisineSheet
      visible={browseOpen}
      onClose={() => setBrowseOpen(false)}
      cuisines={cuisineOptions}
      dishes={popularDishes}
      /* Both close the sheet: picking is the end of the errand either way,
         and a sheet left open over the result it just produced hides it. */
      onPickCuisine={(name) => {
        setCuisineFilter(name);
        setBrowseOpen(false);
      }}
      onPickDish={(id) => {
        setBrowseOpen(false);
        openDish(id);
      }}
    />

    <VegModeSheet visible={vegPickerOpen} onClose={() => setVegPickerOpen(false)} onChoose={chooseVegMode} />
    <VegModeTransition mode={vegTransition} onDone={() => setVegTransition(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The controls that ride on the block's artwork. Scoped to this file so
 * `layout revert` stays a one-file change.
 * ------------------------------------------------------------------ */

/**
 * One photograph per cuisine, bundled rather than fetched.
 *
 * Keyed on the tag lower-cased, because `cuisineTypes` is free text a
 * restaurant typed — "North Indian" and "north indian" are the same
 * cuisine and must not be two chips with one picture between them.
 *
 * A tag with no entry here gets NO picture, deliberately, rather than
 * falling back to the "All" plate: `FoodPhoto` draws its own well for a
 * missing photo, and a wrong picture is worse than an honest empty one.
 * When a new cuisine starts appearing in the feed often enough to matter,
 * add artwork for it here — see the session notes for the generation
 * prompt the existing sixteen were made with.
 */
const CUISINE_ART: Record<string, number> = {
  bakery: require('../../assets/images/cuisine-bakery.jpg'),
  beverages: require('../../assets/images/cuisine-beverages.jpg'),
  chinese: require('../../assets/images/cuisine-chinese.jpg'),
  continental: require('../../assets/images/cuisine-continental.jpg'),
  desserts: require('../../assets/images/cuisine-desserts.jpg'),
  'fast food': require('../../assets/images/cuisine-fastfood.jpg'),
  healthy: require('../../assets/images/cuisine-healthy.jpg'),
  italian: require('../../assets/images/cuisine-italian.jpg'),
  japanese: require('../../assets/images/cuisine-japanese.jpg'),
  mexican: require('../../assets/images/cuisine-mexican.jpg'),
  mughlai: require('../../assets/images/cuisine-mughlai.jpg'),
  'north indian': require('../../assets/images/cuisine-northindian.jpg'),
  'south indian': require('../../assets/images/cuisine-southindian.jpg'),
  'street food': require('../../assets/images/cuisine-streetfood.jpg'),
  thai: require('../../assets/images/cuisine-thai.jpg'),
};

/** The "All" chip's own plate. Not in the map above — "All" is not a
 *  cuisine, and putting it there would make it filterable by name. */
const CUISINE_ART_ALL = require('../../assets/images/cuisine-all.jpg');

const cuisineArt = (tag: string): number | undefined => CUISINE_ART[tag.trim().toLowerCase()];

/** How far the curve dips at its deepest (dead centre), in dp.
 *
 *  Checked against the tightest of the four banners rather than guessed:
 *  `banner-full-brighter-mood.jpg`'s own "Order Now" button clears the true
 *  bottom edge by only about 19dp at a 360dp screen width, the smallest
 *  margin of the four. This value cuts into a little over half of that,
 *  verified by compositing the actual curve onto that actual file before
 *  it went in — see the session's own build notes for the render. Raising
 *  it is safe up to roughly 18dp; past that it starts to reach the button
 *  on THAT banner specifically, even though the other three have room to
 *  spare. */
const BANNER_CURVE_DEPTH = 12;

/**
 * The join between the banner and the page below it, curved rather than a
 * straight horizontal cut.
 *
 * ONE flat shape in the page's own background colour, not four — it works
 * the same way regardless of which of the four slides is showing, because
 * every one of them ends in different artwork but the page below them is
 * always the same colour. A per-slide version would need to either match
 * each banner's own edge colour (the pale-pink banner meeting a curve tuned
 * for the dark green one would show a seam of the wrong colour) or accept a
 * flash at the boundary every time the carousel turns; a single page-colour
 * shape has neither problem, because it never needs to agree with the
 * artwork — it sits ON TOP of it and reads as the page beginning early
 * rather than as a shape belonging to any one banner.
 *
 * The curve is a parabola, not a true arc: `y = D·(1 − (2x/W − 1)²)` is a
 * single quadratic — cheap, and reproduced exactly by ONE SVG `Q` command
 * with a control point at `2·D`, which is what the `Path` below is. It
 * peaks at `BANNER_CURVE_DEPTH` dead centre and falls to nothing at both
 * edges, so the banner reads as bulging gently downward in the middle and
 * tapering upward into the corners — the opposite of the square corners
 * this block deliberately kept everywhere else, and the one place on the
 * whole top block that is allowed to curve, because nothing underneath it
 * has to line up flush the way the header and the search field do.
 */
function BannerCurve({ width }: { width: number }) {
  const { colors } = useTheme();
  const d = BANNER_CURVE_DEPTH;
  const path = `M0,0 Q${width / 2},${d * 2} ${width},0 L${width},${d} L0,${d} Z`;

  return (
    <Svg width={width} height={d} style={styles.bannerCurve} pointerEvents="none">
      <Path d={path} fill={colors.bg} />
    </Svg>
  );
}

/**
 * The search row, laid over the banner artwork.
 *
 * This used to be a coloured box of its own stacked above the banner, with
 * its own gradient and its own background photograph. It has neither now:
 * the artwork underneath carries both, and anything painted here would be a
 * second surface competing with it — which is the exact thing the last few
 * passes were trying to get rid of.
 *
 * ## What came out, and why
 *
 * "What are you craving?" went first. The artwork opens with its own
 * headline in display type, and two of those a centimetre apart read as a
 * mistake rather than as emphasis.
 *
 * "Cooking near <locality>" followed. It was never load-bearing: the
 * `ExploreHeader` directly above already names the locality, so the block
 * was saying the same thing twice — and every line taken off the artwork is
 * a line not competing with lettering the artwork already carries.
 *
 * What is left is the one control that has to be here rather than in the
 * picture: the search field, and the veg switch beside it. Everything on
 * this block is now either a control or the photograph.
 */
function HeroControls({
  areaLabel,
  onSearch,
  vegMode,
  onPressVeg,
  headerRoom,
}: {
  areaLabel: string;
  onSearch: () => void;
  vegMode: VegMode;
  onPressVeg: () => void;
  /** Top inset plus the pinned app header — what this has to clear. */
  headerRoom: number;
}) {
  const { colors, space, radius } = useTheme();

  return (
    <View style={{ paddingHorizontal: space[4], paddingTop: headerRoom + space[2] }}>
      {/* Light on purpose. The header above draws its own, stronger scrim
          over the status bar and the locality line; this one only has to
          stop an opaque white field from dissolving into the bright pink and
          yellow skies of two of the four banners. Any heavier and the two
          scrims stack into a band across artwork the block exists to show.
          `pointerEvents="none"` — it spans the row and would otherwise eat
          the taps meant for the field beneath it. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.22)', 'rgba(0,0,0,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.7 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.heroSearchRow, { gap: space[2] }]}>
        <Pressable
          onPress={onSearch}
          accessibilityRole="search"
          accessibilityLabel="Search dishes, kitchens"
          style={({ pressed }) => [
            styles.heroSearch,
            {
              backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
              borderRadius: radius.button,
              paddingHorizontal: space[3] + 2,
              gap: space[3],
            },
          ]}
        >
          <Icon name="search" size={20} color={colors.brandInk} />
          <RotatingPlaceholder areaLabel={areaLabel} />
        </Pressable>

        <VegModeButton mode={vegMode} onPress={onPressVeg} />
      </View>
    </View>
  );
}

/**
 * The search bar's placeholder, cycling through real search terms — the
 * same list `FoodSearch` itself offers as suggestions, not invented copy.
 *
 * The fade and the text swap are driven from the SAME plain `setTimeout`
 * chain on the JS thread, deliberately not from `withTiming`'s own
 * completion callback. That callback runs as a worklet on the UI thread,
 * and calling a React state setter from there needs `runOnJS` — passing a
 * functional state update through it is more machinery than this earns.
 * Two `setTimeout`s in sequence (fade out, THEN swap text and fade in) get
 * the same visible result with everything that touches React state staying
 * on the thread React expects it on.
 */
function RotatingPlaceholder({ areaLabel }: { areaLabel: string }) {
  const reduceMotion = useReduceMotion();
  const terms = useMemo(() => [`dishes, kitchens near ${areaLabel}`, ...SUGGESTIONS], [areaLabel]);
  const [index, setIndex] = useState(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (terms.length <= 1 || reduceMotion) return undefined;
    let swap: ReturnType<typeof setTimeout> | null = null;
    const timer = setInterval(() => {
      opacity.value = withTiming(0, { duration: 200 });
      swap = setTimeout(() => {
        swap = null;
        setIndex((current) => (current + 1) % terms.length);
        opacity.value = withTiming(1, { duration: 200 });
      }, 200);
    }, 2600);
    /* Both timers, not just the interval — a `swap` left pending when this
       unmounts (Home swapped for Search/Orders mid-fade) would otherwise
       call `setIndex` on a component nothing is reading any more. */
    return () => {
      clearInterval(timer);
      if (swap) clearTimeout(swap);
    };
  }, [terms.length, reduceMotion, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.flex, style]}>
      <Text variant="body" color="tertiary" numberOfLines={1}>
        {`Search ${terms[index]}`}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bannerCurve: { position: 'absolute', left: 0, bottom: 0 },
  heroSearchRow: { flexDirection: 'row', alignItems: 'center' },
  heroSearch: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  link: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
});
