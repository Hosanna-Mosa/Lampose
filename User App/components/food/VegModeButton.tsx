import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { elevation } from '@/constants/tokens';
import { useReduceMotion } from '@/context/ThemeContext';
import { pressScale, usePressAnimation } from '@/hooks/usePressAnimation';
import type { VegMode } from '@/types/food';

/**
 * The veg control — a labelled chip, not a bare switch.
 *
 * ## What was wrong with the switch
 *
 * The version this replaces was a white track with a coloured knob and the
 * word VEG floating above it, drawn straight onto the banner artwork with no
 * surface of its own. It was legible. Nobody knew what it did.
 *
 * Two separate reasons, and the fix has to answer both:
 *
 *   1. A naked switch states a STATE, never a subject. On/off — of what? The
 *      only answer was four white capital letters small enough to read as a
 *      watermark on a photograph of a biryani.
 *   2. It had no ground. The search field sitting immediately beside it is an
 *      opaque white pill; this was a floating white shape on artwork. Two
 *      controls in one row, one of which does not look like a control, and
 *      the eye files the odd one out as part of the picture.
 *
 * So it is a pill now, the same opaque white as the field it shares the row
 * with, and it says what it is: the mark, the word, the switch.
 *
 * ## The mark earns its place where four embellishments did not
 *
 * This control has thrown away a diet mark, a coin flip, a growing leaf and a
 * filling gauge, all for the same reason — each was decoration bolted beside a
 * switch that already worked. The green square-and-dot is different in kind.
 * It is not a picture of veg food, it is the mark printed on every packet of
 * it in the country, and a diner reads it without being taught. It is the
 * shortest sentence available for "this is about vegetarian".
 *
 * It is drawn rather than imported: two nested views, a bordered square and a
 * dot. An SVG or a glyph for a shape this simple is a dependency to justify
 * later.
 *
 * ## Why the switch may finally be conventional
 *
 * The old note in this file explained at length why the track had to stay
 * white in BOTH states: green is the one colour that cannot be trusted on a
 * banner that is sometimes a green garden, so the state had to live on the
 * knob instead. That constraint is gone, and gone as a consequence rather
 * than by decision — the switch is inside an opaque pill now, so what is
 * behind it is white, always, whatever the artwork underneath is doing. The
 * track can be grey-when-off and green-when-on like every other switch a
 * person has ever used.
 *
 * That is the real argument for the pill. It does not just make the control
 * legible, it lets the control be ordinary.
 */

/* Literals, not theme tokens. The pill is opaque white on artwork in both
   themes — it does not flip to a dark surface at night, because the
   photograph behind it does not. */
const PILL = '#FFFFFF';
/** Near-black rather than pure, so "VEG" does not ring against the white. */
const INK = '#1B1F1C';
/** The light-theme accent, pinned. 6.25:1 on the white pill. */
const GREEN = '#0E6E5C';
/** An off track has to read as a track, not as a gap in the pill. */
const TRACK_OFF = '#DCD9D3';

const MARK = 15;
const MARK_DOT = 7;

const TRACK_W = 32;
const TRACK_H = 19;
const INSET = 2.5;
const KNOB = TRACK_H - INSET * 2; // 14
const TRAVEL = TRACK_W - KNOB - INSET * 2; // 13

export type VegModeButtonProps = {
  mode: VegMode;
  onPress: () => void;
};

/**
 * Pressing it does not toggle, quite.
 *
 * Off, it opens the picker — "veg items everywhere" and "pure veg kitchens
 * only" are two different filters and the control cannot guess which. On, it
 * turns off directly, because there is only one way to be off. The switch
 * still reads as a switch to a screen reader (`role="switch"`, `checked`)
 * because that is what its STATE is; the extra question on the way in is the
 * screen's business, not the control's.
 */
export function VegModeButton({ mode, onPress }: VegModeButtonProps) {
  const reduceMotion = useReduceMotion();
  const { onPressIn, onPressOut, progress: pressProgress } = usePressAnimation('iconButton');

  const on = mode !== 'off';

  const slide = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    slide.value = reduceMotion ? (on ? 1 : 0) : withSpring(on ? 1 : 0, { damping: 16, stiffness: 220 });
  }, [on, reduceMotion, slide]);

  /* Press-scale on the OUTER pill, slide on the INNER knob — two views, two
     `transform` keys, neither one silently replacing the other on style-array
     merge. (That exact mistake is what broke every earlier version of this
     control — see git history if it matters why.) */
  const hostStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - pressProgress.value * (1 - pressScale.iconButton) }],
  }));

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(slide.value, [0, 1], [TRACK_OFF, GREEN]),
  }));

  const knobStyle = useAnimatedStyle(() => ({
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
    >
      {/* `elevation.raised` for the same reason the search field beside it
          carries one: a white object needs an edge on the two banners that are
          themselves near-white. */}
      <Animated.View style={[styles.pill, elevation.raised, hostStyle]}>
        {/* The mark stays green in both states. Greying it when the filter is
            off would read as "no veg here", which is the opposite of what an
            off filter means. */}
        <View style={styles.mark}>
          <View style={styles.markDot} />
        </View>

        <Text variant="label" style={styles.word}>
          VEG
        </Text>

        <Animated.View style={[styles.track, trackStyle]}>
          <Animated.View style={[styles.knob, knobStyle]} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 9,
    paddingRight: 8,
    height: 40,
    borderRadius: 20,
    backgroundColor: PILL,
  },
  /* A square with a border and a dot — the printed mark, at roughly the size
     it is printed. `borderRadius: 3` rather than a true corner: at 15pt a hard
     90° reads as an aliasing artefact rather than as a square. */
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDot: {
    width: MARK_DOT,
    height: MARK_DOT,
    borderRadius: MARK_DOT / 2,
    backgroundColor: GREEN,
  },
  /* Colour only. The `label` variant already carries its own tracking and
     its own uppercasing from the type scale, and setting `letterSpacing`
     here would quietly override the scale's value for this one word. */
  word: { color: INK },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: 'center',
  },
  knob: {
    position: 'absolute',
    left: INSET,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: PILL,
  },
});
