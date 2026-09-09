import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { withAlpha } from '@/utils/color';

/**
 * Where steam rises out of a slide's artwork, in fractions of the card.
 *
 * The plume in the file is PAINTED — a JPEG has no layers, so the wisps
 * above the biryani cannot themselves be made to move. What this does is
 * put real, moving puffs in the same place, continuing up past where the
 * painted ones fade out. The eye reads the pair as one plume, because the
 * painted part is soft and low-contrast and the moving part starts inside
 * it rather than beside it.
 *
 * Fractions rather than pixels because the card is the screen's width on
 * every handset, and the artwork is drawn at the card's exact ratio — so a
 * point measured off the file lands on the same point of the picture at any
 * size. Measure a new one off its own file; do not reuse these numbers.
 */
export type SlideSteam = {
  /** The plume's base — where it leaves the food. */
  x: number;
  y: number;
  /** How far up it travels before it is gone, and how wide a puff is. */
  rise: number;
  spread: number;
  /**
   * Multiplies the peak opacity. 1 is the default and is tuned against a
   * DARK background.
   *
   * It exists because white steam is not equally visible on all four
   * banners, and the same number therefore does not read the same on all of
   * them. Against the green banner's shaded garden a white puff has most of
   * the contrast range to itself; against the pink banner's pale sky it has
   * almost none, because white on light pink is a small step whatever the
   * opacity. The lighter the artwork behind a plume, the harder this has to
   * be pushed to arrive at the same apparent strength.
   */
  strength?: number;
};

/**
 * A headline the APP draws, over artwork whose own lettering was removed
 * from the file.
 *
 * ## Why the artwork had to give the words up
 *
 * A JPEG has no layers, so lettering baked into one cannot be animated — it
 * is the same wall the steam hit. The difference is that steam could be
 * joined from outside and type cannot: a second copy of "Brighter Mood"
 * sliding over the painted one is two headlines, not one moving.
 *
 * So the words were taken OUT of `new1.png` at build time — the background
 * behind them is smooth blurred bokeh, which is reconstructable — and are
 * drawn here instead, where they can move. The rest of the picture, its
 * subhead and its painted button included, is untouched.
 *
 * ## Why it lands where it does
 *
 * `x` and `y` are the top-left of the block the artwork used to have, as
 * fractions, measured off the file.
 *
 * ## The sizes are measured, and they are not on the type scale
 *
 * This is the one place in the app that sets `fontSize` directly, and
 * `Text`'s own doc comment says screens must not. The exception is narrow
 * and deliberate: this is not app type, it is a REPRODUCTION of type that
 * was drawn into a photograph. It has one correct size — the size the
 * painted words were — and that size is whatever the designer chose, not
 * whatever the scale happens to carry. Reaching for the nearest token
 * instead is exactly the mistake the first pass made: `display1` is 21pt
 * against a painted cap height that measures 29 and 32, so the headline
 * came out at two-thirds and looked like a caption.
 *
 * Sizes are in dp for a 360dp-wide card and scale with the card, because
 * the artwork does — fixed points would shrink against the picture on a
 * wide handset.
 *
 * `accent` is SAMPLED off the removed word rather than picked near it, so
 * the live "Mood" is the same yellow the designer used and not a near-miss
 * beside a subhead still painted in the original.
 */
export type SlideHeadline = {
  x: number;
  y: number;
  /** The small line above, if the artwork had one. */
  eyebrow?: string;
  eyebrowSize?: number;
  line1: string;
  line1Size: number;
  /** Drawn in `accent`. The artwork's two-tone headline. */
  line2?: string;
  line2Size?: number;
  accent?: string;
};

/** The card width every measured size was taken against. */
const HEADLINE_REF_WIDTH = 360;

/**
 * A vehicle that drives across its slide, as a separate layer.
 *
 * The banner's artwork is TWO files for this slide: a background plate with
 * no scooter on it, and the scooter alone with an alpha channel. That split
 * is the only way a thing painted into a JPEG can be made to move — the
 * headline needed the same treatment, and there the words could be lifted
 * out programmatically because they sat on smooth bokeh. A scooter over a
 * road and a skyline cannot be, so the two layers have to come from the
 * generator.
 *
 * ## Anchored at the wheels
 *
 * Every point is the sprite's BOTTOM-CENTRE, not its top-left, because a
 * thing on a road is positioned by where it touches the road. With a
 * top-left anchor, shrinking it for perspective lifts it off the surface —
 * the first pass at this had the scooter flying through the sky.
 *
 * ## A PATH, not two endpoints
 *
 * The second pass drove it in a straight line between two points, and it
 * read as a sticker sliding rather than a scooter riding, because this road
 * is not straight: traced off the plate it is an S — up from the bottom
 * edge, bulging out to the right margin, then hooking back left to the pin.
 * A straight line crosses the water for most of it.
 *
 * So the path is a list of points read off the artwork, and `scale` is
 * carried per point too: the road is wide at the bottom and narrow at the
 * pin, so the perspective is not linear either. `tilt` leans the scooter
 * into the climb — small numbers; this is a side-on drawing and anything
 * more than a few degrees reads as a crash.
 *
 * ## Why it ends where it does
 *
 * It arrives AT the location pin. That is not decoration: this is the
 * delivery banner, and a rider reaching the marker is the thing the picture
 * is about. It fades in and out at the two ends so the loop does not
 * teleport, and so the start — which passes behind the feature row — is
 * invisible until it is clear of the words.
 */
export type SlideRider = {
  image: string | number;
  /** Sprite width : height, so the layer never has to guess its own shape. */
  aspect: number;
  /** Sprite width as a fraction of the card's width, at `scale` 1. */
  size: number;
  /**
   * Wheel positions along the road, near end first, spaced evenly in TIME.
   * Read off the plate — re-trace them if the artwork changes.
   */
  path: readonly { x: number; y: number; scale: number; tilt?: number }[];
  durationMs?: number;
};

/** Where the scooter parks when its slide is not the active one. It cannot
 *  simply be hidden: the background plate has no scooter painted on it, so
 *  an unrendered layer leaves an empty road. A third of the way along is
 *  where the original artwork had it. */
const RIDER_REST = 0.32;

export type PromoSlide = {
  id: string;
  /**
   * Background artwork for the card — a remote URL, or a `require()`d
   * bundled asset.
   *
   * This is the half of a promo banner that code cannot produce. A
   * designed illustration (a 3D coffee cup, a plate lit from behind) is
   * what makes a marketplace's banner look like a marketplace's banner;
   * gradients and drifting shapes are what a screen shows when it does not
   * have one. When artwork is present the abstract background below is
   * dropped entirely rather than layered under it — blobs behind an
   * illustration read as noise, not depth.
   *
   * The gradient stays underneath regardless, as the well: artwork that is
   * missing, slow or dead leaves a finished-looking card rather than a
   * hole. Same rule `FoodPhoto` follows for dish photography.
   */
  image?: string | number;
  /** Rendered large and counted up when the slide arrives — for a slide
   *  whose point IS a number ("15 kitchens cooking now"). Omit for the
   *  rest; the headline then stands alone. */
  metric?: number;
  /** Both optional, because artwork often carries its own lettering — a
   *  slide with baked-in words wants no second set drawn over them. */
  headline?: string;
  body?: string;
  /** Which of the app's two warm tokens the slide is painted in — never a
   *  third, invented colour. */
  tone: 'brand' | 'caution';
  /**
   * Where the card goes when tapped.
   *
   * Not optional decoration: artwork for this slot routinely has a button
   * PAINTED INTO it ("Order Now →"). A drawn button that does nothing is
   * worse than no button — it is the one thing on the card a diner is most
   * likely to press, and pressing it teaching them the app ignores them is
   * a lesson they apply to every real button afterwards. A slide carrying
   * artwork with a call to action must carry this too.
   */
  onPress?: () => void;
  /** What the tap does, for a screen reader — the artwork's own lettering
   *  is invisible to one. */
  label?: string;
  /** The artwork's own headline, set live so it can move — see
   *  `SlideHeadline`. Only for files the lettering has been removed from;
   *  set it on one that still has its words and you get both. */
  headlineArt?: SlideHeadline;
  /** A vehicle layered over the plate and driven along a path — see
   *  `SlideRider`. Only for slides whose `image` is a plate with the vehicle
   *  already taken out of it. */
  rider?: SlideRider;
  /** Steam, for artwork that has food hot enough to have some. A LIST,
   *  because a picture can have more than one hot thing in it — the sunset
   *  banner steams from both the chutney bowl and the filter coffee. Omit
   *  and the slide simply has none. See `SlideSteam`. */
  steam?: readonly SlideSteam[];
};

export type PromoBannerProps = {
  slides: readonly PromoSlide[];
  /** Overrides the derived height. Left alone, the page keeps `ASPECT`
   *  whatever the screen is — which is what lets one piece of artwork fit
   *  every handset without being re-cropped per device. */
  height?: number;
};

/* The card is both the animated surface and the tappable one, and the
   scroll/scale style has to land on the same node that takes the press —
   a Pressable wrapping an Animated.View would put the touch target
   outside the transform it is supposed to belong to. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AUTOPLAY_MS = 4600;
/**
 * Page width : height.
 *
 * Measured from the bundled artwork rather than picked — all four
 * `banner-full-*.jpg` are drawn at 1.071, so the page is 1.071 and
 * `contentFit="cover"` has nothing at all to trim. Change one without the
 * other and the lettering starts getting shaved.
 *
 * This is a WHOLE-SCREEN-TOP ratio, not a strip. The artwork carries the
 * background and the message in one picture, and it runs from the very top
 * of the screen: the status bar, the app header and the search field are all
 * laid over it. That is what makes the exact number matter — the four files
 * keep their lettering below 57% of their own height, which at this ratio is
 * about 192dp on a 360dp-wide screen, and the status bar, header and search
 * row together need 174dp of that. Shorten the block and the search field
 * lands on the artwork's headline. `FoodHome` documents the full budget.
 */
export const PROMO_ASPECT = 1.071;
const ASPECT = PROMO_ASPECT;
/** One full sweep cycle: the streak crosses in the first quarter of it and
 *  waits off-screen for the rest, which is what makes it read as an
 *  occasional highlight rather than a windscreen wiper. */
const SHINE_MS = 3800;

/**
 * The promo strip — a full-bleed banner pager that moves on its own.
 *
 * It is the bottom half of ONE block: the hero's colour runs down through
 * the search field and straight into this with no gutter, no corner radius
 * and no gap. See the `cardWidth` note below for why that is the whole
 * point, and `FoodHome` for the wrapper that keeps the two welded.
 *
 * ## What moves, and why each thing does
 *
 *   1. A SHINE sweeps diagonally across the page every few seconds. This is
 *      the loudest thing here on purpose: it is the one motion that reads
 *      from across a room, and it is what makes a flat colour field look
 *      like a surface rather than a rectangle.
 *   2. AURORA — soft radial blobs drift and breathe, with two crisp
 *      outlined rings among them. The first pass at this was invisible at
 *      8% opacity; the pair of shapes now carries actual contrast, and the
 *      rings give the eye an edge to catch, which a pure blur never does.
 *      Both are dropped on any slide carrying artwork.
 *   3. THE PAGE fades against its neighbours as you swipe, and any TEXT on
 *      it parallaxes at a different rate to the page underneath — both
 *      interpolated from live scroll offset, so the depth is continuous
 *      through the gesture rather than snapping at the ends. It does not
 *      SCALE: see `cardStyle`, where full bleed rules that out.
 *   4. THE NUMBER counts up when its slide arrives, then settles with a
 *      spring. It is the one piece of motion about the CONTENT rather than
 *      the container: "15 kitchens" earns a beat because it is the fact
 *      the slide exists to deliver.
 *
 * The pagination bar fills over one autoplay cycle and its completion IS
 * what advances the pager — one clock, so the bar can never disagree with
 * the slide it measures. It rides ON the artwork rather than under it.
 *
 * `HeroCarousel` (the listing detail's photo gallery) stays autoplay-free —
 * see its own doc comment. Nothing on THIS banner is a decision: the slides
 * are facts about a feed already on screen, never a discount, and `FoodHome`
 * is the only place that writes their copy.
 */
export function PromoBanner({ slides, height }: PromoBannerProps) {
  const { space, radius } = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [index, setIndex] = useState(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const fill = useSharedValue(0);
  /* The same number as `index`, readable from the UI thread. The autoplay
     step runs in a worklet and has to know where it currently is; React
     state is not visible there. Both are written together, never one
     without the other. */
  const liveIndex = useSharedValue(0);
  /* Whether the scroll that is ending was a finger or this component's own
     autoplay. Without it a programmatic advance lands, fires
     `onMomentumScrollEnd`, and restarts the progress bar a few hundred
     milliseconds into a cycle the effect below has already begun. */
  const dragging = useRef(false);

  /* Full-bleed pages, not inset cards.
     An earlier pass inset these by the gutter so the strip would read as
     its own object under the hero. On a phone that is the wrong call: the
     gutter, the corner radius and the gap between the hero and the strip
     add up to a visible seam, and the top of the screen stops being one
     surface and becomes two stacked slabs. Every marketplace app this is
     modelled on (Blinkit, Swiggy) runs the header colour straight down
     THROUGH the banner with no break — the search field, the header and
     the artwork are one block, and the page background only begins below
     it. So a page is exactly the screen width, `interval` is the screen
     width, and `FoodHome` butts this against the hero with no gap. */
  const cardWidth = width;
  const cardHeight = height ?? Math.round(cardWidth / ASPECT);
  const interval = cardWidth;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const startFill = () => {
    if (slides.length <= 1 || reduceMotion) return;
    fill.value = 0;
    fill.value = withTiming(1, { duration: AUTOPLAY_MS }, (finished) => {
      'worklet';
      if (!finished) return;
      /*
       * The advance happens HERE, on the UI thread, and that is the whole
       * point of this shape.
       *
       * Reanimated's `scrollTo` is worklet-only. An earlier version handed
       * this callback off with `runOnJS` and called `scrollTo` from the JS
       * thread, where it silently does nothing — so `index` advanced, the
       * dots moved and the bar restarted, while the pager itself never
       * budged. The autoplay looked broken in the one way that is hard to
       * read: everything about it worked except the scrolling.
       *
       * A timing callback already runs on the UI thread, so the scroll goes
       * here and only the React state crosses back over.
       */
      const next = (liveIndex.value + 1) % slides.length;
      scrollTo(scrollRef, next * interval, 0, true);
      liveIndex.value = next;
      runOnJS(setIndex)(next);
    });
  };

  /* Restarted whenever `index` changes — by autoplay, or by a swipe landing
     somewhere new. Its completion calls `advance`, so the bar finishing IS
     the timer rather than a second one running alongside it. */
  useEffect(() => {
    if (slides.length <= 1 || reduceMotion) return undefined;
    startFill();
    return () => cancelAnimation(fill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, slides.length, reduceMotion]);

  const handleScrollEnd = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const wasDrag = dragging.current;
    dragging.current = false;
    const next = Math.round(event.nativeEvent.contentOffset.x / interval);
    if (next !== index) {
      liveIndex.value = next;
      setIndex(next);
    } else if (wasDrag) {
      /* A finger released back onto the SAME card leaves `index` unchanged,
         so the effect below will not re-fire — the bar has to be restarted
         by hand or it stays where the drag cancelled it. An AUTOPLAY scroll
         landing here needs no such thing: the effect started its bar the
         moment `index` changed, and restarting it now would reset a cycle
         already a few hundred milliseconds old. */
      startFill();
    }
  };

  if (!slides.length) return null;

  return (
    <View>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        /* A page IS the screen now, so this is plain paging rather than
           `snapToInterval` over a card-plus-gap rhythm. */
        pagingEnabled
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          dragging.current = true;
          cancelAnimation(fill);
        }}
        onMomentumScrollEnd={handleScrollEnd}
        directionalLockEnabled
      >
        {slides.map((slide, i) => (
          <Slide
            key={slide.id}
            slide={slide}
            index={i}
            active={i === index}
            width={cardWidth}
            height={cardHeight}
            interval={interval}
            scrollX={scrollX}
          />
        ))}
      </Animated.ScrollView>

      {/* Overlaid on the artwork, not stacked under it.
          A pagination row below the banner sits on the PAGE background, and
          that strip of grey between the artwork and the content is exactly
          the seam this pass exists to remove — it would undo the full-bleed
          above it. Both reference apps put their dots inside the banner for
          the same reason. Centred short pills rather than the old
          edge-to-edge segmented bar: over a photograph a full-width rule
          reads as a crack across the image. */}
      {slides.length > 1 ? (
        <View style={[styles.bars, { bottom: space[3], gap: space[1] + 2 }]} pointerEvents="none">
          {slides.map((slide, i) => (
            <View key={slide.id} style={[styles.barTrack, { borderRadius: radius.pill }]}>
              <FillBar active={i === index} done={i < index} fill={fill} radius={radius.pill} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** One card's own scale/opacity, computed from live scroll position rather
 *  than from a loop of `useAnimatedStyle` calls over `slides.map` — hooks
 *  cannot be called per item of a rendered list, only once per component
 *  instance. Same reasoning as `SlidingCell` in the tab bar. */
function Slide({
  slide,
  index,
  active,
  width,
  height,
  interval,
  scrollX,
}: {
  slide: PromoSlide;
  index: number;
  active: boolean;
  width: number;
  height: number;
  interval: number;
  scrollX: SharedValue<number>;
}) {
  const { colors, space } = useTheme();
  const reduceMotion = useReduceMotion();

  /* Opacity alone — the neighbour-scaling this used to do belonged to inset
     cards, where a shrunken card simply showed more of the page around it.
     At full bleed a scaled-down page pulls its own edges off the screen and
     opens a strip of background down the side mid-swipe, which is the seam
     again in a different place. The dip is also gentler than before (0.82,
     not 0.65): a full-screen page is most of what you can see, so the same
     number that read as depth on a small card reads as a flicker here. */
  const cardStyle = useAnimatedStyle(() => {
    const centre = index * interval;
    const range = [centre - interval, centre, centre + interval];
    return {
      opacity: interpolate(scrollX.value, range, [0.82, 1, 0.82], Extrapolation.CLAMP),
    };
  });

  /* The words travel slower than the card they sit on — the depth cue that
     makes a swipe feel like layers moving rather than one flat page. */
  const contentStyle = useAnimatedStyle(() => {
    const centre = index * interval;
    const range = [centre - interval, centre, centre + interval];
    return {
      transform: [{ translateX: interpolate(scrollX.value, range, [46, 0, -46], Extrapolation.CLAMP) }],
    };
  });

  const on = slide.tone === 'brand' ? colors.brand : colors.warning.base;
  const deep = slide.tone === 'brand' ? colors.brandPressed : colors.warning.ink;
  const ink = slide.tone === 'brand' ? colors.onBrand : colors.warning.on;

  const art = slide.image;
  const hasWords = slide.headline !== undefined || slide.body !== undefined || slide.metric !== undefined;
  /* Over artwork the scrim is black in BOTH themes, so the words are white
     in both — `ink` is near-black in dark mode and would vanish into it.
     Without artwork the token is correct as it stands. */
  const textInk = art !== undefined ? '#FFFFFF' : ink;

  return (
    <AnimatedPressable
      onPress={slide.onPress}
      /* A card with nowhere to go is not a button, and must not announce
         itself as one. */
      disabled={!slide.onPress}
      accessibilityRole={slide.onPress ? 'button' : undefined}
      accessibilityLabel={slide.onPress ? (slide.label ?? slide.headline) : undefined}
      /* Square corners: a rounded page at full bleed would cut four notches
         of page background into the block the hero and this are meant to
         form together. */
      style={[{ width, height }, styles.card, cardStyle]}
    >
      {/* The well, always — see the note on `PromoSlide.image`. Artwork that
          never arrives leaves a finished card rather than a hole. */}
      <LinearGradient
        colors={[on, deep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {art !== undefined ? (
        <Image
          source={typeof art === 'string' ? { uri: art } : art}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={220}
        />
      ) : null}

      {/* Words over artwork need their own contrast — the illustration
          underneath was not composed around them. Skipped entirely when
          the card is artwork alone. */}
      {art !== undefined && hasWords ? (
        <LinearGradient
          colors={['rgba(0,0,0,0.62)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {!reduceMotion ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Only without artwork: drifting shapes behind an illustration
              read as noise rather than depth. The shine stays either way —
              it is a treatment of the SURFACE, not a substitute background,
              and a gloss pass over artwork is exactly what it is for. */}
          {art === undefined ? (
            <>
              <Blob id={`${slide.id}-a`} ink={ink} size={240} from={{ x: -70, y: -90 }} to={{ x: 20, y: -46 }} period={7200} />
              <Blob id={`${slide.id}-b`} ink={ink} size={190} from={{ x: width - 160, y: 24 }} to={{ x: width - 96, y: -26 }} period={9100} />
              <Ring ink={ink} size={150} from={{ x: width - 96, y: height - 70 }} to={{ x: width - 132, y: height - 108 }} period={8300} />
              <Ring ink={ink} size={86} from={{ x: width - 190, y: -18 }} to={{ x: width - 214, y: 16 }} period={6400} />
            </>
          ) : null}
          <Shine width={width} height={height} ink={art === undefined ? ink : '#FFFFFF'} />
        </View>
      ) : null}

      {/* Only while this slide is the one being looked at. Five looping
          animations per slide would otherwise run for every slide in the
          pager, all the time, for the three nobody can see. */}
      {/* Rendered whether or not the slide is active — the plate under it has
          no scooter on it, so leaving it out empties the road. */}
      {slide.rider ? (
        <Rider
          spec={slide.rider}
          active={active}
          width={width}
          height={height}
          reduceMotion={reduceMotion}
        />
      ) : null}

      {slide.headlineArt ? (
        <HeadlineArt
          spec={slide.headlineArt}
          active={active}
          width={width}
          height={height}
          reduceMotion={reduceMotion}
        />
      ) : null}

      {active && !reduceMotion
        ? slide.steam?.map((plume, i) => (
            <SteamPlume
              key={i}
              idPrefix={`${slide.id}-steam-${i}`}
              steam={plume}
              width={width}
              height={height}
            />
          ))
        : null}

      {hasWords ? (
        <Animated.View style={[styles.content, { paddingHorizontal: space[4] }, contentStyle]}>
          {slide.metric !== undefined ? (
            <View style={styles.metricRow}>
              <CountUp value={slide.metric} active={active} ink={textInk} reduceMotion={reduceMotion} />
              {slide.headline ? (
                <Text variant="display1" style={{ color: textInk }}>
                  {slide.headline}
                </Text>
              ) : null}
            </View>
          ) : slide.headline ? (
            <Text variant="display1" style={{ color: textInk }}>
              {slide.headline}
            </Text>
          ) : null}
          {slide.body ? (
            <Text variant="body" style={{ color: textInk, marginTop: space[1], opacity: 0.9 }} numberOfLines={2}>
              {slide.body}
            </Text>
          ) : null}
        </Animated.View>
      ) : null}
    </AnimatedPressable>
  );
}

/** One trip, start to arrival. Close to a slide's own 4.6s on screen, so
 *  under autoplay the ride reads as one complete journey per showing rather
 *  than being cut off halfway. */
const RIDE_MS = 4800;

/** The scooter, driving up the road to the pin. See `SlideRider`. */
function Rider({
  spec,
  active,
  width,
  height,
  reduceMotion,
}: {
  spec: SlideRider;
  active: boolean;
  width: number;
  height: number;
  reduceMotion: boolean;
}) {
  const p = useSharedValue(RIDER_REST);
  const w = spec.size * width;
  const h = w / spec.aspect;

  /* Split into parallel arrays once, because `interpolate` takes an input
     range and an output range and a worklet cannot map over objects each
     frame without allocating. Evenly spaced: the scooter covers equal
     stretches of PATH in equal time, which is what a steady speed means on
     a curve. */
  const track = React.useMemo(() => {
    const stops = spec.path.map((_, i) => i / Math.max(1, spec.path.length - 1));
    return {
      stops,
      xs: spec.path.map((q) => q.x),
      ys: spec.path.map((q) => q.y),
      scales: spec.path.map((q) => q.scale),
      tilts: spec.path.map((q) => q.tilt ?? 0),
    };
  }, [spec.path]);

  useEffect(() => {
    if (reduceMotion || !active) {
      p.value = RIDER_REST;
      return undefined;
    }
    p.value = 0;
    p.value = withRepeat(
      /* Linear: a scooter at a steady speed. Easing here would read as it
         slowing down on approach, which a delivery does not do. */
      withTiming(1, { duration: spec.durationMs ?? RIDE_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(p);
  }, [active, reduceMotion, spec.durationMs, p]);

  const style = useAnimatedStyle(() => {
    const t = p.value;
    const s = interpolate(t, track.stops, track.scales, Extrapolation.CLAMP);
    const cx = interpolate(t, track.stops, track.xs, Extrapolation.CLAMP) * width;
    const by = interpolate(t, track.stops, track.ys, Extrapolation.CLAMP) * height;
    const tilt = interpolate(t, track.stops, track.tilts, Extrapolation.CLAMP);
    return {
      /*
       * Visible for 84% of the trip, not 56%.
       *
       * This used to hold off until 0.3 and cut out at 0.86, which meant the
       * scooter appeared a third of the way along and was gone before the
       * end — it read as riding half the road and then giving up. The late
       * fade-in was guarding the feature row that the sprite overlaps at the
       * start, but that overlap is the faint speed STREAKS: the solid body
       * begins about 28% into the sprite and is clear of the words within
       * the first tenth. Guarding it to 0.3 spent a third of the journey
       * hiding a few translucent pink lines.
       *
       * Both ends still fade, because the loop has to get back to the start
       * without the scooter jumping there in plain sight.
       */
      opacity: interpolate(t, [0, 0.1, 0.94, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: cx - w / 2 },
        /* `scale` is applied about the view's CENTRE, so putting the wheels
           on a given line means backing the centre off by half the scaled
           height as well as half the unscaled one. Getting this wrong is
           what floats it above the road. */
        { translateY: by - h / 2 - (s * h) / 2 },
        { rotate: `${tilt}deg` },
        { scale: s },
      ],
    };
  });

  return (
    <Animated.View style={[styles.rider, { width: w, height: h }, style]} pointerEvents="none">
      <Image
        source={typeof spec.image === 'string' ? { uri: spec.image } : spec.image}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
      />
    </Animated.View>
  );
}

/** When each line starts, and how fast its letters follow one another. The
 *  accent line waits for the one above to be most of the way through, so
 *  the phrase lands in reading order instead of all at once. */
const CASCADE = {
  eyebrow: { from: 0, step: 30 },
  line1: { from: 190, step: 38 },
  line2: { from: 520, step: 44 },
};

/**
 * The headline, arriving letter by letter.
 *
 * The first version of this raised whole lines. It worked, but a line that
 * fades up as one block is the same move a hundred screens make on mount —
 * it reads as a screen loading rather than as a headline being delivered.
 * This one springs each CHARACTER into place a few frames after the one
 * before it, so the words assemble left to right. The spring overshoots
 * slightly, which is what stops it feeling mechanical: every letter lands
 * just past its mark and settles back.
 *
 * It replays every time the slide becomes active — every eighteen seconds
 * on a four-slide carousel at 4.6s a slide.
 *
 * ## The one thing that had to be got right
 *
 * A line is only hidden while its slide is ARRIVING. Resting off-screen it
 * sits fully visible, because a swipe drags the next card into view long
 * before it becomes active — hide it whenever it is inactive and you watch
 * a blank banner slide in and then fill itself, which looks like a loading
 * failure. So `active` false means "at rest, visible", not "hidden".
 *
 * The timing works out because `index` moves at the START of an autoplay
 * scroll rather than the end: the letters are already landing while the
 * card is still travelling.
 */
function HeadlineArt({
  spec,
  active,
  width,
  height,
  reduceMotion,
}: {
  spec: SlideHeadline;
  active: boolean;
  width: number;
  height: number;
  reduceMotion: boolean;
}) {
  /* Everything scales with the card, because the picture under it does. */
  const k = width / HEADLINE_REF_WIDTH;
  const size1 = spec.line1Size * k;
  const size2 = (spec.line2Size ?? spec.line1Size) * k;
  const sizeE = (spec.eyebrowSize ?? 9) * k;

  /* Display leading, not UI leading. `lineHeight` stays generous enough that
     the descender of "Brighter"'s g is never clipped, and the gap is closed
     with a negative margin instead — the safe way round. */
  const type = (size: number, color: string) => ({
    fontSize: size,
    lineHeight: size * 1.18,
    letterSpacing: -size * 0.03,
    color,
  });

  return (
    <View
      style={{ position: 'absolute', left: spec.x * width, top: spec.y * height }}
      pointerEvents="none"
    >
      {spec.eyebrow ? (
        <CascadeLine
          text={spec.eyebrow}
          plan={CASCADE.eyebrow}
          active={active}
          reduceMotion={reduceMotion}
          rise={size1 * 0.4}
          textStyle={{ ...type(sizeE, '#FFFFFF'), letterSpacing: sizeE * 0.16 }}
        />
      ) : null}

      <CascadeLine
        text={spec.line1}
        plan={CASCADE.line1}
        active={active}
        reduceMotion={reduceMotion}
        rise={size1 * 0.55}
        textStyle={type(size1, '#FFFFFF')}
        style={{ marginTop: -size1 * 0.06 }}
      />

      {spec.line2 ? (
        <CascadeLine
          text={spec.line2}
          plan={CASCADE.line2}
          active={active}
          reduceMotion={reduceMotion}
          rise={size2 * 0.55}
          textStyle={type(size2, spec.accent ?? '#FFFFFF')}
          style={{ marginTop: -size2 * 0.28 }}
        />
      ) : null}
    </View>
  );
}

function CascadeLine({
  text,
  plan,
  active,
  reduceMotion,
  rise,
  textStyle,
  style,
}: {
  text: string;
  plan: { from: number; step: number };
  active: boolean;
  reduceMotion: boolean;
  rise: number;
  textStyle: TextStyle;
  style?: ViewStyle;
}) {
  /* `Array.from` rather than `split('')` — it splits by code point, so an
     emoji or an accented character in a headline stays one letter instead of
     being torn into surrogate halves that animate separately. */
  const chars = React.useMemo(() => Array.from(text), [text]);

  return (
    <View style={[styles.cascade, style]}>
      {chars.map((ch, i) => (
        <CascadeChar
          key={i}
          delay={plan.from + i * plan.step}
          active={active}
          reduceMotion={reduceMotion}
          rise={rise}
        >
          {/* A no-break space: a plain one at the edge of its own Text can be
              collapsed away, which would close the gap between words. */}
          <Text style={textStyle}>{ch === ' ' ? ' ' : ch}</Text>
        </CascadeChar>
      ))}
    </View>
  );
}

function CascadeChar({
  children,
  delay,
  active,
  reduceMotion,
  rise,
}: {
  children: React.ReactNode;
  delay: number;
  active: boolean;
  reduceMotion: boolean;
  rise: number;
}) {
  const t = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion || !active) {
      /* At rest, and visible — see the note on `HeadlineArt`. */
      t.value = 1;
      return undefined;
    }
    t.value = 0;
    t.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 190, mass: 0.9 }));
    return () => cancelAnimation(t);
  }, [active, reduceMotion, delay, t]);

  const style = useAnimatedStyle(() => ({
    /* Faster than the movement, and clamped, so a letter is readable well
       before it has finished settling — otherwise the overshoot reads as a
       wobble on something half-visible. */
    opacity: interpolate(t.value, [0, 0.5], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: (1 - t.value) * rise },
      { scale: interpolate(t.value, [0, 1], [0.72, 1], Extrapolation.CLAMP) },
    ],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

/** One puff's whole life, base to gone. Slow on purpose: steam that climbs
 *  in under three seconds reads as smoke from something burning. */
const PUFF_MS = 5200;
/** Eight rather than five, so the gap between one puff fading and the next
 *  appearing closes — at five the column visibly thinned between arrivals,
 *  which read as a repeating cycle rather than as something rising without
 *  stopping. Overlapping puffs also compound: eight at a given opacity is a
 *  denser column than seven, which is half of what made the effect legible.
 *  Each is one small SVG circle. */
const PUFF_COUNT = 8;
/** Peak opacity of a single puff, before `SlideSteam.strength`. Two earlier
 *  passes sat at 0.30 and 0.52 and both read as the artwork breathing
 *  rather than as steam; the column only became unmistakable here. */
const PUFF_PEAK = 0.72;

/**
 * Rising steam, laid over the painted plume in the artwork.
 *
 * ## Why puffs rather than one drifting shape
 *
 * A single translating sprite reads as an object moving, not as steam. Real
 * steam is a sequence of separate volumes that each rise, widen and thin
 * out, overlapping so the column looks continuous while no individual part
 * of it is. So this is five identical puffs on the same 5.2s loop, evenly
 * offset by `withDelay`, each fading in near the food, growing to about two
 * and a half times its size and fading out well before the top.
 *
 * Each drifts sideways as it climbs, alternating direction, because a
 * column that goes straight up looks like a pipe.
 *
 * ## What it costs
 *
 * Only the ACTIVE slide renders it — the others unmount theirs, which
 * cancels the loops. Everything animated is transform and opacity, so it
 * all runs on the UI thread and never touches React while it plays.
 */
function SteamPlume({
  idPrefix,
  steam,
  width,
  height,
}: {
  idPrefix: string;
  steam: SlideSteam;
  width: number;
  height: number;
}) {
  const size = steam.spread * width;
  const rise = steam.rise * height;
  const left = steam.x * width - size / 2;
  const top = steam.y * height - size;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: PUFF_COUNT }, (_, i) => (
        <Puff
          key={i}
          /* Unique per slide AND per puff: gradient ids resolve per SVG root
             and two roots sharing one id is a known way to get the wrong
             fill on Android — the same reason `Blob` takes an id. */
          id={`${idPrefix}-${i}`}
          left={left}
          top={top}
          size={size}
          rise={rise}
          delay={(i * PUFF_MS) / PUFF_COUNT}
          peak={Math.min(1, PUFF_PEAK * (steam.strength ?? 1))}
          /* Alternating, and widening as it climbs — the far end of the
             drift is past the halfway point, so a puff keeps leaning the
             way it started instead of coming back. */
          drift={(i % 2 === 0 ? 1 : -1) * size * (0.3 + (i % 3) * 0.12)}
        />
      ))}
    </View>
  );
}

function Puff({
  id,
  left,
  top,
  size,
  rise,
  delay,
  drift,
  peak,
}: {
  id: string;
  left: number;
  top: number;
  size: number;
  rise: number;
  delay: number;
  drift: number;
  peak: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    /* `Easing.out` — steam leaves the food quickly and slows as it thins,
       which is what makes the top of the column feel like it is dissipating
       rather than being switched off. */
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: PUFF_MS, easing: Easing.out(Easing.quad) }), -1, false),
    );
    return () => cancelAnimation(t);
  }, [t, delay]);

  const style = useAnimatedStyle(() => ({
    /* Still a taper, not a flat ramp: the puff spends most of its climb well
       under peak, so the column thins upward the way real steam does rather
       than marching up at one brightness. The mid point is held at a higher
       fraction of peak than before, which is what thickens the BODY of the
       column rather than just its base. Fades out by 0.9 so nothing ever
       pops off at the top. */
    opacity: interpolate(
      t.value,
      [0, 0.1, 0.45, 0.9],
      [0, peak, peak * 0.62, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      { translateY: -t.value * rise },
      { translateX: interpolate(t.value, [0, 0.5, 1], [0, drift, drift * 1.7]) },
      { scale: interpolate(t.value, [0, 1], [0.5, 2.4]) },
    ],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', left, top, width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          {/* A solid core with a longer soft shoulder. The previous 0.9/0.32
              falloff spent most of the puff's area nearly transparent, so a
              bigger puff was not a stronger one — it was the same faint ring
              drawn wider. */}
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="0.42" stopColor="#FFFFFF" stopOpacity="0.62" />
            <Stop offset="0.75" stopColor="#FFFFFF" stopOpacity="0.2" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * The diagonal highlight that crosses the card.
 *
 * One shared value running the WHOLE cycle, with the travel packed into
 * its first quarter — so the streak crosses in about a second and then
 * waits off-screen for three. A `withSequence` of move-then-pause would
 * read the same and cost two more animation nodes; the interpolation range
 * does it with one.
 */
function Shine({ width, height, ink }: { width: number; height: number; ink: string }) {
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: SHINE_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(sweep);
  }, [sweep]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(sweep.value, [0, 0.28, 1], [-160, width + 160, width + 160], Extrapolation.CLAMP) },
      { rotate: '18deg' },
    ],
  }));

  return (
    <Animated.View style={[styles.shine, { height: height * 2.4, top: -height * 0.7 }, style]}>
      <LinearGradient
        colors={[withAlpha(ink, 0), withAlpha(ink, 0.22), withAlpha(ink, 0)]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * A soft blob of light, drifting.
 *
 * The softness is a `RadialGradient` rather than a blur: React Native has
 * no cheap cross-platform blur, and `expo-linear-gradient` only does linear
 * ramps. `react-native-svg` is already in this app for the icon set and the
 * delivery map, so the falloff costs nothing new.
 *
 * The MOVEMENT is on the wrapping `Animated.View`'s transform rather than
 * on the circle's own `cx`/`cy`. Animating SVG props works, but a plain
 * view transform is the path with no platform caveats at all — and the
 * blob is a solid shape being slid around, which is what transforms are
 * for.
 */
function Blob({
  id,
  ink,
  size,
  from,
  to,
  period,
}: {
  id: string;
  ink: string;
  size: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  period: number;
}) {
  const style = useDrift(from, to, period, 1.12);

  return (
    <Animated.View style={[styles.floater, { width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          {/* Unique per slide: gradient ids resolve per SVG root, and two
              roots sharing one id is a known way to get the wrong fill on
              Android. */}
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={ink} stopOpacity="0.30" />
            <Stop offset="0.62" stopColor={ink} stopOpacity="0.10" />
            <Stop offset="1" stopColor={ink} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * An outlined circle, drifting alongside the blobs.
 *
 * The blur gives depth but no edge, and an eye needs an edge to register
 * that something moved at all — which is why the first version of this
 * background read as empty. A hairline ring is the cheapest possible
 * contrast: still abstract, still unmistakably deliberate.
 */
function Ring({
  ink,
  size,
  from,
  to,
  period,
}: {
  ink: string;
  size: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  period: number;
}) {
  const style = useDrift(from, to, period, 1.06);

  return (
    <Animated.View style={[styles.floater, { width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 1.5}
          stroke={ink}
          strokeOpacity={0.22}
          strokeWidth={1.5}
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

/** The shared drift-and-breathe both background shapes run on: a single
 *  looping value read as position and scale, out of phase per caller
 *  through its own `period`. */
function useDrift(
  from: { x: number; y: number },
  to: { x: number; y: number },
  period: number,
  peakScale: number,
) {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(drift);
  }, [drift, period]);

  return useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [from.x, to.x]) },
      { translateY: interpolate(drift.value, [0, 1], [from.y, to.y]) },
      { scale: interpolate(drift.value, [0, 1], [1, peakScale]) },
    ],
  }));
}

/**
 * The slide's number, counting up when it arrives and settling with a
 * spring.
 *
 * Stepped in plain React state rather than through an animated `TextInput`
 * — the usual trick for animating a number on the UI thread. That trick
 * bypasses this app's own `Text`, which is what resolves the typeface, and
 * a headline in the wrong font is a worse outcome than eighteen state
 * updates over two-thirds of a second, which is nothing.
 */
function CountUp({
  value,
  active,
  ink,
  reduceMotion,
}: {
  value: number;
  active: boolean;
  ink: string;
  reduceMotion: boolean;
}) {
  const [shown, setShown] = useState(value);
  const pop = useSharedValue(1);

  useEffect(() => {
    if (!active || reduceMotion || value <= 1) {
      setShown(value);
      return undefined;
    }
    const steps = Math.min(value, 18);
    let step = 0;
    setShown(0);
    const timer = setInterval(() => {
      step += 1;
      setShown(Math.round((value * step) / steps));
      if (step >= steps) {
        clearInterval(timer);
        /* The landing, not the counting — a small overshoot on the last
           number so the count reads as arriving somewhere rather than
           just stopping. */
        pop.value = withSequence(
          withTiming(1.18, { duration: 120 }),
          withSpring(1, { damping: 9, stiffness: 260 }),
        );
      }
    }, 40);
    return () => {
      clearInterval(timer);
      cancelAnimation(pop);
    };
  }, [active, value, reduceMotion, pop]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Animated.View style={style}>
      <Text variant="display1" style={{ color: ink }}>
        {shown}
      </Text>
    </Animated.View>
  );
}

/** The active segment's own fill, 0→100% over one autoplay cycle; a
 *  finished segment shows solid, an upcoming one empty.
 *
 *  White rather than `colors.brand`: these now sit ON the artwork, and a
 *  green bar over a green banner is an invisible one. White holds up over
 *  all three — the dark green, the mid-tone pink and the deep blue — which
 *  a theme token cannot promise, since it knows the app's background and
 *  not the photograph's. */
function FillBar({
  active,
  done,
  fill,
  radius,
}: {
  active: boolean;
  done: boolean;
  fill: SharedValue<number>;
  radius: number;
}) {
  const style = useAnimatedStyle(() => ({
    width: `${active ? fill.value * 100 : done ? 100 : 0}%`,
  }));
  return <Animated.View style={[styles.barFill, style, { borderRadius: radius }]} />;
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  rider: { position: 'absolute', left: 0, top: 0 },
  /* `baseline`, not the default stretch: each letter is its own view, and on
     centre or stretch alignment a comma or a lower-case o would ride at a
     different height from the capital beside it. */
  cascade: { flexDirection: 'row', alignItems: 'baseline' },
  content: { flex: 1, justifyContent: 'center' },
  metricRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  floater: { position: 'absolute' },
  shine: { position: 'absolute', width: 90, left: 0 },
  bars: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barTrack: { width: 22, height: 3, backgroundColor: 'rgba(255,255,255,0.38)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: '#FFFFFF' },
});
