import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { component, easing } from '@/constants/motion';
import type { StayCategory } from '@/constants/tokens';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

import { CATEGORY_BLURB, CATEGORY_CHIP_LABEL, CATEGORY_ORDER } from './CategoryTabs';

type IonName = keyof typeof Ionicons.glyphMap;

/**
 * The category's name as it fits under its icon in a fifth of the screen. The
 * full shelf name (`CATEGORY_CHIP_LABEL`) is what a screen reader hears.
 */
const SHORT_LABEL: Record<StayCategory, string> = {
  PG_HOSTEL: 'PG & Hostel',
  BACHELOR: 'Bachelor',
  COLIVE: 'Houses',
  HOTEL: 'Hotels',
  COMMERCIAL: 'Commercial',
};

/** Outline at rest, solid when chosen — the bottom bar's own convention. */
const GLYPHS: Record<StayCategory, readonly [IonName, IonName]> = {
  PG_HOSTEL: ['bed-outline', 'bed'],
  BACHELOR: ['person-outline', 'person'],
  COLIVE: ['home-outline', 'home'],
  HOTEL: ['business-outline', 'business'],
  COMMERCIAL: ['storefront-outline', 'storefront'],
};

/** Room between the track's edge and the tiles; the bubble sits inside it. */
const TRACK_PAD = 4;
const TRACK_RADIUS = 22;
/** Concentric with the track's corners once inset by `TRACK_PAD`. */
const BUBBLE_RADIUS = TRACK_RADIUS - TRACK_PAD;
const TILE_HEIGHT = 56;
/** The band of light that sweeps across the bubble when it lands. */
const SHINE_WIDTH = 26;

export type CategoryGlassBarProps = {
  value: StayCategory;
  onChange: (category: StayCategory) => void;
  categories?: readonly StayCategory[];
  style?: ViewStyle;
};

/**
 * The category row: a pane of glass with a black bubble that moves.
 *
 * Every category gets an equal tile — icon over a short name — so all five
 * are on screen at once with nothing to scroll. Behind the chosen one sits a
 * glossy black bubble. On a tap it SPRINGS to the new tile and stretches while
 * it travels, then a band of light sweeps across it as it lands.
 *
 * The tiles are drawn twice — grey outline, and white solid — and which one
 * shows is decided by how much of the bubble is under the tile at that frame,
 * not by which tile is selected. So the white rides WITH the bubble: a tile it
 * passes over on its way flicks white and back, like a lens moving along the
 * row, and the chosen tile's label never turns white before the black has
 * arrived behind it (white on the glass would be invisible for that moment).
 *
 * In dark mode the bubble is the inverse — pale, with dark ink — because a
 * black bubble on a near-black page is no bubble at all.
 *
 * Glass, not blur: React Native has no cheap backdrop blur on Android, so the
 * track is translucent white over the hero's soft colours, with a rim and a
 * sheen — which reads as glass on both platforms.
 */
export function CategoryGlassBar({
  value,
  onChange,
  categories = CATEGORY_ORDER,
  style,
}: CategoryGlassBarProps) {
  const { colors, mode } = useTheme();
  const reduceMotion = useReduceMotion();
  const dark = mode === 'dark';

  const count = categories.length || 1;
  const index = Math.max(0, categories.indexOf(value));

  const rowWidth = useSharedValue(0);
  const position = useSharedValue(index);
  const target = useSharedValue(index);
  /** 0 → 1 as the band of light crosses the bubble; parked at 1 (hidden). */
  const shine = useSharedValue(1);
  const placed = useRef(false);

  useEffect(() => {
    target.value = index;
    if (!placed.current || reduceMotion) {
      /* The first placement is a placement, not a move. */
      position.value = index;
      placed.current = true;
      return;
    }
    position.value = withSpring(index, component.tabBubble);
    /* The sweep starts as the bubble arrives, not as it leaves. */
    shine.value = 0;
    shine.value = withDelay(160, withTiming(1, { duration: 620, easing: easing.standard }));
  }, [index, reduceMotion, position, target, shine]);

  const bubbleStyle = useAnimatedStyle(() => {
    const cell = rowWidth.value / count;
    const still = Math.min(Math.abs(target.value - position.value), 1);
    return {
      width: Math.max(0, cell),
      opacity: rowWidth.value > 0 ? 1 : 0,
      transform: [
        { translateX: TRACK_PAD + position.value * cell },
        { scaleX: 1 + still * 0.3 },
        { scaleY: 1 - still * 0.08 },
      ],
    };
  });

  const shineStyle = useAnimatedStyle(() => {
    const cell = rowWidth.value / count;
    return {
      opacity: shine.value < 1 ? 1 : 0,
      transform: [
        { translateX: -SHINE_WIDTH * 2 + shine.value * (cell + SHINE_WIDTH * 3) },
        { rotate: '18deg' },
      ],
    };
  });

  /* Android draws an elevation shadow THROUGH a translucent fill, as a grey
     smear inside the glass, so there the glass is a little more opaque, carries
     no elevation, and takes a hairline for its edge; iOS gets the soft shadow. */
  const trackFill = dark
    ? 'rgba(255, 255, 255, 0.06)'
    : Platform.OS === 'android'
      ? 'rgba(255, 255, 255, 0.82)'
      : 'rgba(255, 255, 255, 0.6)';
  const trackEdge = dark
    ? 'rgba(255, 255, 255, 0.12)'
    : Platform.OS === 'android'
      ? 'rgba(0, 0, 0, 0.06)'
      : 'rgba(255, 255, 255, 0.95)';

  /* Black in light mode; the pale inverse in dark mode. */
  const bubbleFill = dark ? '#E6E8EB' : colors.graphite;
  const bubbleInk = dark ? colors.bg : colors.onGraphite;

  return (
    <View
      style={[
        styles.track,
        { backgroundColor: trackFill, borderColor: trackEdge },
        Platform.OS === 'ios' ? styles.trackShadow : null,
        style,
      ]}
    >
      {/* The glass sheen across the top of the pane. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sheenClip]}>
        <LinearGradient
          colors={dark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.6 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/*
        The bubble, under the tiles. No Android elevation on purpose: an
        elevated view is drawn ABOVE its unelevated siblings there, which would
        put the black over the very labels it is meant to sit behind.
      */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.bubble,
          {
            backgroundColor: bubbleFill,
            borderColor: dark ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.14)',
          },
          Platform.OS === 'ios' ? styles.bubbleShadow : null,
          bubbleStyle,
        ]}
      >
        {/* Clipped separately: iOS drops the shadow of a view that clips its
            own contents, so the outer shape casts it and this layer clips. */}
        <View style={[StyleSheet.absoluteFill, styles.bubbleClip]}>
          {/* Gloss: light across the top half, as on a polished stone. */}
          <LinearGradient
            colors={dark ? ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.55 }}
            style={StyleSheet.absoluteFill}
          />
          {/* The band of light that crosses it on landing. */}
          <Animated.View style={[styles.shine, shineStyle]}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', dark ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      </Animated.View>

      <View
        style={styles.row}
        accessibilityRole="tablist"
        accessibilityLabel="Stay type"
        onLayout={(event) => {
          rowWidth.value = event.nativeEvent.layout.width;
        }}
      >
        {categories.map((category, tileIndex) => (
          <CategoryTile
            key={category}
            category={category}
            tileIndex={tileIndex}
            active={category === value}
            position={position}
            onInk={bubbleInk}
            onPress={() => {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              } catch {}
              onChange(category);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function CategoryTile({
  category,
  tileIndex,
  active,
  position,
  onInk,
  onPress,
}: {
  category: StayCategory;
  tileIndex: number;
  active: boolean;
  /** Where the bubble is, in tiles — shared with the bar. */
  position: SharedValue<number>;
  /** The ink that reads on the bubble. */
  onInk: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  const wasActive = useRef(active);

  /* A small pop as the bubble arrives under the newly chosen tile. */
  useEffect(() => {
    if (active && !wasActive.current && !reduceMotion) {
      scale.value = withDelay(
        150,
        withSequence(
          withTiming(1.14, { duration: 130, easing: easing.enter }),
          withSpring(1, { damping: 9, stiffness: 260 }),
        ),
      );
    }
    wasActive.current = active;
  }, [active, reduceMotion, scale]);

  const handlePress = () => {
    if (!reduceMotion && !active) {
      scale.value = withTiming(0.9, { duration: 90, easing: easing.exit });
    }
    onPress();
  };

  /* How much of the bubble is under this tile right now: 1 dead centre, 0
     once it is a whole tile away. */
  const onStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.abs(position.value - tileIndex), 1),
  }));
  const offStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.abs(position.value - tileIndex), 1),
  }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const label = SHORT_LABEL[category];

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      /* Commercial is read by the name on screen; its hint says shops and offices. */
      accessibilityLabel={category === 'COMMERCIAL' ? SHORT_LABEL[category] : CATEGORY_CHIP_LABEL[category]}
      accessibilityHint={CATEGORY_BLURB[category]}
      style={styles.tile}
    >
      <Animated.View style={[styles.tileFace, popStyle]}>
        {/* Off the bubble: grey outline. */}
        <Animated.View style={[styles.tileLayer, offStyle]}>
          <Ionicons name={GLYPHS[category][0]} size={21} color={colors.textSecondary} />
          <Text
            variant="caption"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{ color: colors.textSecondary, fontSize: 10.5, lineHeight: 13, fontWeight: '600' }}
          >
            {label}
          </Text>
        </Animated.View>
        {/* On the bubble: solid, in the bubble's ink. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.tileLayer, onStyle]}>
          <Ionicons name={GLYPHS[category][1]} size={21} color={onInk} />
          <Text
            variant="caption"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{ color: onInk, fontSize: 10.5, lineHeight: 13, fontWeight: '700' }}
          >
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: TRACK_RADIUS,
    borderWidth: 1,
    padding: TRACK_PAD,
  },
  trackShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  sheenClip: { borderRadius: TRACK_RADIUS, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  tile: {
    flex: 1,
    height: TILE_HEIGHT,
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  tileFace: { alignSelf: 'stretch' },
  tileLayer: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  bubble: {
    position: 'absolute',
    left: 0,
    top: TRACK_PAD,
    bottom: TRACK_PAD,
    borderRadius: BUBBLE_RADIUS,
    borderWidth: 1,
  },
  bubbleClip: { borderRadius: BUBBLE_RADIUS - 1, overflow: 'hidden' },
  bubbleShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 9,
  },
  shine: {
    position: 'absolute',
    top: -TILE_HEIGHT / 2,
    bottom: -TILE_HEIGHT / 2,
    left: 0,
    width: SHINE_WIDTH,
  },
});
