import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { elevation } from '@/constants/tokens';
import { useReduceMotion } from '@/context/ThemeContext';
import { pressScale, usePressAnimation } from '@/hooks/usePressAnimation';
import type { VegMode } from '@/types/food';

/**
 * Every colour on this control is a LITERAL, not a theme token.
 *
 * It sits on the banner artwork, which runs from a shaded green garden to a
 * bright orange sky to a pale pink one to mid blue. No token survives that:
 * `brand` green on the green banner is green on green, and `textTertiary`
 * grey vanishes into the pink. Worse, the tokens FLIP with the app's theme
 * while the artwork underneath does not — a dark-mode surface token would
 * put a near-black control on a near-black photograph.
 *
 * ## No container
 *
 * An earlier pass gave the whole thing an opaque white pill to stand on.
 * It was legible but it read as a sticker laid over the picture. This
 * carries no box at all: the parts are white, and each one casts a shadow
 * so it keeps an edge over the pale banners where white-on-white would
 * otherwise dissolve. The shadow IS the container.
 *
 * ## Why the track stays white in both states
 *
 * The obvious switch turns its track green when on — and green is the one
 * colour that cannot be trusted here, because one of the four banners is a
 * green garden. So the TRACK is always white, on every banner and in both
 * states, and the KNOB carries the state instead: neutral when off, accent
 * when on. A green knob on a white track reads on all four; a green track
 * on green artwork reads on three.
 */
const ON_ART = '#FFFFFF';
const KNOB_OFF = '#9A948A';
/** The light-theme accent, pinned — it is drawn on the white track, which
 *  never follows the theme either. 6.25:1 there. */
const KNOB_ON = '#0E6E5C';
/** Soft, wide, and low-opacity: an edge for the white parts on a pale sky,
 *  not a drop shadow anybody should be able to point at. */
const ART_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.45)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
} as const;

const TRACK_W = 50;
const TRACK_H = 30;
const INSET = 3;
const KNOB = TRACK_H - INSET * 2; // 24
const TRAVEL = TRACK_W - KNOB - INSET * 2; // 20

export type VegModeButtonProps = {
  mode: VegMode;
  onPress: () => void;
};

/**
 * The veg control. A plain switch — track, knob, on or off. Nothing else.
 *
 * Every embellishment tried before this (a diet mark, a coin flip, a
 * growing leaf, a filling gauge with a label riding above it) got in its
 * own way. This is the version with all of that stripped back out: which of
 * the two ON modes is live is left to the picker sheet and the caption line
 * already printed under it on Food Home — this control's only job is on or
 * off, so it only shows on or off.
 *
 * "VEG" sits above it in the same uppercase caption weight the tab bar uses
 * for its own labels, in plain (non-animated) React state rather than through
 * `Animated.Text` — that wraps React Native's raw `Text`, not this app's own
 * `Text`, which is what every other label in the product goes through for
 * its font resolution.
 */
export function VegModeButton({ mode, onPress }: VegModeButtonProps) {
  /* No `useTheme()` here on purpose — see the note on `PILL`. This control
     draws on artwork, so it takes none of its colours from the theme. */
  const reduceMotion = useReduceMotion();
  const { onPressIn, onPressOut, progress: pressProgress } = usePressAnimation('iconButton');

  const on = mode !== 'off';

  const slide = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    slide.value = reduceMotion ? (on ? 1 : 0) : withSpring(on ? 1 : 0, { damping: 16, stiffness: 220 });
  }, [on, reduceMotion, slide]);

  /* Press-scale on the OUTER wrapper, slide on the INNER knob — two views,
     two `transform` keys, neither one silently replacing the other on
     style-array merge. (That exact mistake is what broke every earlier
     version of this control — see git history if it matters why.) */
  const hostStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - pressProgress.value * (1 - pressScale.iconButton) }],
  }));

  /* The knob carries the state, not the track — see the note at the top. */
  const knobStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(slide.value, [0, 1], [KNOB_OFF, KNOB_ON]),
    transform: [{ translateX: slide.value * TRAVEL }],
  }));

  const accessibilityLabel = mode === 'restaurants'
    ? 'Pure veg mode is on, showing only all-veg kitchens. Tap to turn off.'
    : on
      ? 'Veg mode is on, showing veg items from every kitchen. Tap to turn off.'
      : 'Turn on veg mode';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on }}
      hitSlop={8}
      style={styles.host}
    >
      <Animated.View style={[styles.stack, hostStyle]}>
        <Text variant="label" style={styles.word}>
          VEG
        </Text>

        {/* `elevation.raised` on the track is doing the same job the text
            shadow does for the word above it — giving a white object an
            edge on the two banners that are themselves near-white. */}
        <Animated.View style={[styles.track, elevation.raised]}>
          <Animated.View style={[styles.knob, knobStyle]} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  host: { alignItems: 'center' },
  stack: { alignItems: 'center', gap: 3 },
  word: { color: ON_ART, ...ART_SHADOW },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: 'center',
    /* White in BOTH states, on every banner — the state lives on the knob.
       See the note at the top of the file. */
    backgroundColor: ON_ART,
  },
  knob: {
    position: 'absolute',
    left: INSET,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
  },
});
