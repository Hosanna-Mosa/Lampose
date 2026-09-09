import React, { useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon, Text } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { pressScale, usePressAnimation } from '@/hooks/usePressAnimation';

import { FoodPhoto } from './FoodMarks';

export type CuisineRailProps = {
  /** The cuisines actually present in the current feed — never a fixed,
   *  decorative list. See `FoodHome`, which derives these from the real
   *  `Kitchen.cuisineTypes` the seeded restaurants carry and pairs each with
   *  its own bundled artwork. */
  cuisines: readonly { name: string; photo?: string | number }[];
  /** The picture over the "All" chip. */
  allPhoto?: string | number;
  /** `null` means "All". */
  active: string | null;
  onChange: (value: string | null) => void;
  cheapActive: boolean;
  onToggleCheap: () => void;
  /** Opens the full grid of cuisines and dishes. */
  onSeeAll: () => void;
};

/**
 * How many cuisines the rail itself carries before handing the rest to the
 * sheet.
 *
 * Ten is roughly two screens of sideways scrolling on a phone, which is as
 * far as anyone pushes a rail before giving up — past that the tail is
 * effectively invisible, and a filter nobody can find is not a filter. The
 * rest are one tap away rather than twenty swipes away.
 */
const RAIL_MAX = 10;

/** Diameter of a chip's photograph, and the width the label under it wraps
 *  against. The two together come out at the flag tile's 76pt, so the rail
 *  has one baseline rather than two. */
const CHIP_PHOTO = 56;
const CHIP_WIDTH = 72;

/**
 * The arc the rail rides on — a bowl, not a dome.
 *
 * `ARC_RISE` is how far a tile at the screen's edge sits ABOVE one at the
 * centre; `ARC_TILT` is how far it leans, so a tile reads as tangent to a
 * wheel rather than as a card that merely slid upward; `ARC_SHRINK` takes
 * a little size off the edges, which is what sells the arc as depth rather
 * than as a bump in a flat row.
 *
 * The centre of the row is the LOW point, so the tile you are looking at
 * sits at the bottom of the sweep and the ones queueing either side ride up
 * away from it. Flipping this is two signs — the `translateY` and the
 * `rotate` have to flip together, or the tiles lean the wrong way against
 * the curve they are sitting on.
 *
 * A parabola, not a true circle. `y = R − √(R² − d²)` is the honest arc,
 * but across a shallow sweep like this it and `d²` are visually the same
 * curve, and the parabola costs no square root on the UI thread every frame
 * for every tile. Same trade the banner's own bottom curve makes.
 */
const ARC_RISE = 20;
const ARC_TILT = 9;
const ARC_SHRINK = 0.12;

/**
 * The category rail — cuisine chips that actually filter, plus one
 * price-band tile styled like the reference's coupon flag.
 *
 * "Biryani / Pizza / Chicken..." in the reference is decoration — Swiggy
 * already knows the dish taxonomy across every restaurant on the platform,
 * and LAMPOSE does not have that layer. What it does have is each kitchen's
 * own declared cuisine tags, so this rail is built from THOSE — a real,
 * if coarser, filter — rather than a picture of a filter that does nothing.
 */
export function CuisineRail({
  cuisines,
  allPhoto,
  active,
  onChange,
  cheapActive,
  onToggleCheap,
  onSeeAll,
}: CuisineRailProps) {
  const { space, layout } = useTheme();
  const { width: viewport } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  /* A cuisine the rail has cut still has to be reachable while it is the
     ACTIVE filter, or picking "Shawarma" from the sheet would drop it off
     the rail and leave the feed filtered by something invisible. */
  const shown = React.useMemo(() => {
    const head = cuisines.slice(0, RAIL_MAX);
    if (active && !head.some((c) => c.name === active)) {
      const missing = cuisines.find((c) => c.name === active);
      if (missing) return [missing, ...head.slice(0, RAIL_MAX - 1)];
    }
    return head;
  }, [cuisines, active]);

  return (
    /*
     * A horizontal scroll container, which this was missing entirely.
     *
     * The row was a plain `View` with `flexDirection: 'row'` and no scroll
     * container around it — every chip past screen width still rendered,
     * it was just unreachable, because a `View` overflowing its parent has
     * no gesture that gets you to the rest of it. With a coupon tile, "All"
     * and up to ten cuisine chips at ~76pt each, that overflow started well
     * before the tenth chip on any phone; adding the "See all" tile past
     * all of them was what turned a subtle gap into a control nobody could
     * reach at all.
     *
     * `Animated.ScrollView` rather than the plain one only so the offset is
     * readable from the UI thread — the tiles ride an arc off it. The
     * SCROLLING itself is untouched: same gesture, same physics, same
     * momentum. See `ArcTile`.
     */
    <Animated.ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={[
        styles.row,
        {
          gap: space[2],
          paddingHorizontal: layout.gutter,
          /* Room for the rise. Tiles only travel UPWARD from the centre of
             the arc, so the padding is all at the top — and it has to be
             there or the highest tiles are clipped by the row's own bounds. */
          paddingTop: ARC_RISE + space[1],
        },
      ]}
    >
      {/* The one tile that animates on its own — see `ArcTile.rasterize`. */}
      <ArcTile scrollX={scrollX} viewport={viewport} flat={reduceMotion} rasterize={false}>
        <CheapTile active={cheapActive} onPress={onToggleCheap} />
      </ArcTile>

      <ArcTile scrollX={scrollX} viewport={viewport} flat={reduceMotion}>
        <RailChip label="All" photo={allPhoto} active={active === null} onPress={() => onChange(null)} />
      </ArcTile>

      {shown.map((cuisine) => (
        <ArcTile key={cuisine.name} scrollX={scrollX} viewport={viewport} flat={reduceMotion}>
          <RailChip
            label={cuisine.name}
            photo={cuisine.photo}
            active={active === cuisine.name}
            onPress={() => onChange(cuisine.name)}
          />
        </ArcTile>
      ))}

      <ArcTile scrollX={scrollX} viewport={viewport} flat={reduceMotion}>
        <SeeAllChip onPress={onSeeAll} />
      </ArcTile>
    </Animated.ScrollView>
  );
}

/**
 * One tile, placed on the arc.
 *
 * ## Why it measures itself
 *
 * The tile's own centre is read from `onLayout` rather than computed from
 * its index. Index arithmetic needs every tile to be the same width, and
 * this rail's are not: the coupon flag is 72, the chips are 72, and "See
 * all" is deliberately content-sized so its label and caret fit. Measuring
 * costs one layout pass per tile and stays right whatever is in the row.
 *
 * ## Why the first frame is flat
 *
 * `centre` starts at 0, which would read as "this tile is at the far left
 * of the viewport" — every tile would render at full dip and tilt, then
 * snap into place the moment layout arrives. Until a tile has actually been
 * measured it draws flat, so the rail assembles level and curves once,
 * rather than flinching.
 */
function ArcTile({
  scrollX,
  viewport,
  flat,
  rasterize = true,
  children,
}: {
  scrollX: SharedValue<number>;
  viewport: number;
  /** Reduce-motion: the arc is decoration, so it simply does not happen. */
  flat: boolean;
  /**
   * Off for a tile that animates on its OWN, continuously.
   *
   * Rasterising caches the tile as a texture and transforms that instead of
   * redrawing it — which is exactly what stops the text shivering, and
   * exactly the wrong thing for a tile whose contents are still moving.
   * A view that changes has to be re-rasterised to be shown changing, so
   * the cache is rebuilt every frame: the cost of the trick with none of
   * the benefit. `CheapTile` pings, so it draws normally.
   */
  rasterize?: boolean;
  children: React.ReactNode;
}) {
  const centre = useSharedValue(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    centre.value = x + width / 2;
  };

  const style = useAnimatedStyle(() => {
    /* Signed distance from the middle of the screen, normalised so a tile at
       either edge is ±1. Clamped, because a rail longer than the screen has
       tiles well past the edge and they should sit at the arc's end rather
       than continue diving.

       `t` is forced to 0 — a flat tile — rather than returning early with a
       different style object. An animated style that sometimes returns
       `{}` and sometimes returns `transform` is changing its SHAPE between
       frames, and the frame where the shape changes is a visible snap.
       Same properties every frame, always. */
    const measured = !flat && centre.value !== 0;
    const offset = centre.value - scrollX.value - viewport / 2;
    const raw = measured ? offset / (viewport / 2) : 0;
    const t = Math.max(-1, Math.min(1, raw));

    return {
      transform: [
        /* Negative: up. Both signs flip together — see `ARC_RISE`. */
        { translateY: -ARC_RISE * t * t },
        { rotate: `${-t * ARC_TILT}deg` },
        { scale: 1 - Math.abs(t) * ARC_SHRINK },
      ],
    };
  });

  return (
    /*
     * Rasterised, and that is what stops the shake.
     *
     * A tile carries a text label, and `scale` and `rotate` change every
     * frame of a scroll. Without this the label is re-rasterised at a
     * slightly different size and angle each frame, and text snapping to
     * whole pixels as it goes is what reads as a shiver — the tile is not
     * actually moving irregularly, its glyphs are being redrawn on a
     * different grid sixty times a second.
     *
     * Rasterising once and transforming the TEXTURE removes the redraw.
     * It is safe here specifically because tiles only ever scale DOWN from
     * 1 — a texture scaled up past the size it was captured at is the case
     * this trick goes soft on, and the arc never does that.
     */
    <Animated.View
      onLayout={onLayout}
      style={style}
      shouldRasterizeIOS={rasterize}
      renderToHardwareTextureAndroid={rasterize}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The way into the full grid.
 *
 * Not the brand palette. `colors.danger.tint`/`.ink` is a decorative pairing
 * this module already keeps for exactly this — a pale disc with the
 * `mess` glyph on it, dark text below, nothing shouting like an error. See
 * `FoodComingSoon`, which spells out the same rule ("the disc is
 * `danger.tint`... never the solid base, because nothing here is an error
 * and it must not shout like one") for the identical shape elsewhere in
 * this module. Reusing it here means the tile reads as this app's own
 * established "food, decoratively" mark rather than a second, unrelated
 * red invented for one control.
 *
 * The caret sits AFTER the label, not on the icon — it is `chevronRight`
 * rotated 90°, not a new glyph: this module adds an icon only for a real,
 * kept feature (the `Zap` "Quick" badge is the precedent), and a downward
 * caret is a rotation of one already in the set, not a new shape.
 */
function SeeAllChip({ onPress }: { onPress: () => void }) {
  const { colors, radius } = useTheme();
  const { onPressIn, onPressOut, progress } = usePressAnimation('chip');
  const reduceMotion = useReduceMotion();

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - progress.value * (1 - pressScale.chip) }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel="See all cuisines and dishes"
    >
      {/* No fixed `CHIP_WIDTH` here, unlike the photo chips: "See all" plus
          its caret runs past 72pt, and this is the last thing in the row,
          so it is free to be exactly as wide as its own label. */}
      <Animated.View style={[styles.chip, pressStyle]}>
        <View
          style={[
            styles.seeAll,
            {
              width: CHIP_PHOTO,
              height: CHIP_PHOTO,
              borderRadius: radius.pill,
              backgroundColor: colors.danger.tint,
              borderColor: colors.danger.border,
            },
          ]}
        >
          <Icon name="mess" size={26} color={colors.danger.ink} />
        </View>

        <View style={styles.seeAllLabel}>
          <Text variant="bodyStrong" numberOfLines={1}>
            See all
          </Text>
          <View style={styles.caretDown}>
            <Icon name="chevronRight" size={16} color={colors.danger.ink} />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The reference's flag-shaped coupon tile, standing in for a real "under
 * ₹100" price-band filter — the same band `FoodSearch`'s own chips already
 * offer, given the reference's visual treatment rather than invented as a
 * discount.
 */
/** How far the tile leans at the top of a rock, and how long it sits still
 *  between them. The pause is the larger half of the cycle on purpose: a
 *  wiggle that never stops stops being a nudge and becomes a fidget. */
const ROCK_DEG = 7;
const ROCK_REST_MS = 2600;

/**
 * The price-band tile, redesigned onto the rail's own rhythm.
 *
 * It used to be a 72×76 rounded rectangle stacking "Under" over "₹100" —
 * the shape it had when the rail was a row of plain text chips. The rail is
 * circular photographs on an arc now, and a lone rectangle in that row
 * reads as a tile that failed to load rather than as a deliberate one. So
 * it takes the same disc-and-label shape as everything beside it, and stays
 * distinct the way it should have all along: by COLOUR, on the amber set,
 * against fifteen photographs.
 *
 * ## The repeating part
 *
 * It rocks — leans one way, swings through, and settles, like a bell that
 * has just been rung — then holds still for a good deal longer than the
 * rock itself lasted. It is the one tile on the rail asking to be noticed,
 * and the pause is what keeps it asking rather than nagging.
 *
 * The rock and the press-scale live in ONE transform array rather than in
 * two style objects, because a style array REPLACES `transform` rather than
 * merging it — layered, the press would silently win and the rock would
 * never be seen. `VegModeButton` carries the same note; it is the mistake
 * this module has made most often.
 */
function CheapTile({ active, onPress }: { active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const { onPressIn, onPressOut, progress } = usePressAnimation('chip');
  const reduceMotion = useReduceMotion();

  /* −1..1, the lean. Kept as a factor rather than as degrees so the angle
     itself lives in one constant. */
  const rock = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      rock.value = 0;
      return undefined;
    }
    rock.value = withRepeat(
      withSequence(
        /* Wind up short and sharp, swing through wide, then two smaller
           returns — a struck bell loses amplitude each pass, and a rock
           with even swings reads as a metronome instead. */
        withTiming(-1, { duration: 130, easing: Easing.out(Easing.quad) }),
        withTiming(0.85, { duration: 250, easing: Easing.inOut(Easing.quad) }),
        withTiming(-0.5, { duration: 220, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.25, { duration: 190, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 170, easing: Easing.out(Easing.quad) }),
        /* The rest. Holding at 0 for a while inside the sequence is what
           makes this a periodic nudge rather than a permanent wobble. */
        withTiming(0, { duration: ROCK_REST_MS }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(rock);
  }, [reduceMotion, rock]);

  const discStyle = useAnimatedStyle(() => {
    const press = reduceMotion ? 1 : 1 - progress.value * (1 - pressScale.chip);
    return {
      transform: [{ rotate: `${rock.value * ROCK_DEG}deg` }, { scale: press }],
    };
  });

  const ink = active ? colors.warning.on : colors.warning.ink;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel="Under ₹100 dishes"
    >
      <View style={[styles.chip, { width: CHIP_WIDTH }]}>
        <Animated.View
          style={[
            styles.cheapDisc,
            discStyle,
            {
              backgroundColor: active ? colors.warning.base : colors.warning.tint,
              borderColor: colors.warning.border,
            },
          ]}
        >
          {/* `rupee`, not `offer` — this is a price-band filter, not a
              discount, and the offer glyph would claim one. */}
          <Icon name="rupee" size={24} color={ink} />
        </Animated.View>

        <Text
          variant={active ? 'bodyStrong' : 'body'}
          numberOfLines={1}
          style={{ color: active ? colors.textPrimary : colors.textSecondary }}
        >
          Under ₹100
        </Text>
      </View>
    </Pressable>
  );
}

function RailChip({
  label,
  photo,
  active,
  onPress,
}: {
  label: string;
  photo?: string | number;
  active: boolean;
  onPress: () => void;
}) {
  const { colors, space, radius } = useTheme();
  const { onPressIn, onPressOut, progress } = usePressAnimation('chip');
  const reduceMotion = useReduceMotion();

  const underline = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    underline.value = withTiming(active ? 1 : 0, { duration: 180 });
  }, [active, underline]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - progress.value * (1 - pressScale.chip) }],
  }));
  const underlineStyle = useAnimatedStyle(() => ({
    opacity: underline.value,
    transform: [{ scaleX: 0.4 + underline.value * 0.6 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Animated.View style={[styles.chip, pressStyle, { width: CHIP_WIDTH }]}>
        {/* Always drawn, even with no `photo` — `FoodPhoto` falls back to its
            own striped well, and a rail where some chips have a picture and
            others do not would sit at two different heights. A kitchen with
            no dish photography is the ordinary case, not the broken one. */}
        <FoodPhoto height={CHIP_PHOTO} width={CHIP_PHOTO} radius={CHIP_PHOTO / 2} uri={photo} />
        <Text
          variant={active ? 'bodyStrong' : 'body'}
          numberOfLines={1}
          style={{ color: active ? colors.textPrimary : colors.textSecondary }}
        >
          {label}
        </Text>
        <Animated.View
          style={[styles.underline, underlineStyle, { backgroundColor: colors.brand, borderRadius: radius.pill }]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  /* Sized to the photo discs beside it, so the amber tile sits on the rail's
     baseline rather than inventing its own. */
  cheapDisc: {
    width: CHIP_PHOTO,
    height: CHIP_PHOTO,
    borderRadius: CHIP_PHOTO / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  chip: { alignItems: 'center', gap: 4 },
  seeAll: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  /* Wider than a food chip — "See all" plus its caret runs past 72pt, and
     this is the one chip on the rail that is allowed to, since it is also
     the last thing in the row. */
  seeAllLabel: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  /* `chevronRight`, rotated rather than a new down-facing glyph — see the
     component's own doc comment. */
  caretDown: { transform: [{ rotate: '90deg' }] },
  /* Sized to the label rather than the 56pt photo above it, so the active
     mark reads as underlining the WORD — under the picture it would look
     like a shelf the food is standing on. */
  underline: { height: 3, width: '70%' },
});
