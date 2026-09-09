import React, { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import type { VegMode } from '@/types/food';
import { withAlpha } from '@/utils/color';

import { DietMark } from './FoodMarks';

const COPY: Record<VegMode, { headline: string; body: string }> = {
  off: { headline: 'Showing everything', body: 'Non-veg is back on the menu.' },
  items: { headline: 'Veg mode on', body: 'Non-veg dishes are hidden across every kitchen.' },
  restaurants: { headline: 'Pure veg mode on', body: 'Only kitchens with an all-veg menu are shown.' },
};

/** How long the full screen holds before it dismisses itself. */
const HOLD_MS = 1400;
const FADE_MS = 320;

export type VegModeTransitionProps = {
  /** The mode being switched INTO — 'off' included, so switching off gets
   *  its own full-screen moment rather than only switching on. */
  mode: VegMode | null;
  /** Called once the hold ends and the fade-out finishes. The caller applies
   *  the actual filter change up front, not here — this is purely the
   *  "notice something changed" beat over content that has already moved. */
  onDone: () => void;
};

/**
 * The full-screen beat that marks a veg-mode switch, on or off.
 *
 * Filtering a feed is normally silent — a toggle flips and the list
 * underneath just has fewer rows in it, which is right for an ordinary
 * filter. Veg mode was asked for louder than that on purpose: it is a
 * standing decision about what a student is willing to eat, made once and
 * meant to be trusted for the rest of the session, and a change that
 * important deserves a moment that says "you just changed this" rather than
 * a feed that quietly looks different and leaves the diner checking whether
 * the tap even landed.
 *
 * Rendered in a `Modal` rather than an absolutely-positioned View so it
 * covers the header and tab bar too, not just the space between them — the
 * whole point is that the WHOLE screen changes state, not one panel of it.
 *
 * It is not blocking in any way that costs a click: nothing under it needs a
 * tap during the ~1.1s it is up, it takes no input itself, and it always
 * closes itself. A student who has seen it before is never made to wait
 * through it a second time on purpose.
 */
export function VegModeTransition({ mode, onDone }: VegModeTransitionProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.7);

  useEffect(() => {
    if (!mode) return;
    /* Reset before animating in, not just at module load — the Modal is
       reused across every open now (see the note below `copy`), so without
       this the badge's "pop" only plays the first time; every open after
       that would find `scale` already resting at 1 from the last cycle and
       spring from 1 to 1, which is nothing. */
    scale.value = reduceMotion ? 1 : 0.7;
    scale.value = reduceMotion
      ? withTiming(1, { duration: 80 })
      : withSpring(1, { damping: 13, stiffness: 170 });

    /*
     * ONE assignment, not two. `opacity.value = withTiming(1, …)` followed
     * a moment later by `opacity.value = withDelay(…)` does not queue the
     * second animation after the first — assigning `.value` again CANCELS
     * whatever animation was already running on it and starts the new one
     * from wherever it had gotten to. Both were happening in the same
     * synchronous block here, so the fade-IN was replaced before it had
     * moved at all: opacity sat at ~0 for the whole HOLD_MS delay, "faded"
     * from ~0 to 0, and the screen never became visible. `withSequence`
     * chains fade-in → hold → fade-out as ONE animation on ONE assignment,
     * which is the fix.
     */
    opacity.value = withSequence(
      withTiming(1, { duration: reduceMotion ? 80 : 260 }),
      withDelay(
        HOLD_MS,
        withTiming(0, { duration: reduceMotion ? 80 : FADE_MS }, (finished) => {
          if (finished) runOnJS(onDone)();
        }),
      ),
    );
    // Re-running on every `mode` change is the point — a second switch mid-hold
    // restarts the beat for the NEW mode rather than finishing the old one's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  /*
   * The `Modal` is ALWAYS mounted, its own `visible` prop tracking `mode`
   * directly — the same pattern `Dialog` in `components/ui/Overlay.tsx`
   * already uses. It is not a stylistic choice: `mode` flipping between null
   * and a value used to MOUNT and UNMOUNT this whole component's `<Modal>`
   * fresh each time, and React Native does not reliably show a freshly
   * mounted `Modal` if another one (the picker sheet, closing in the same
   * commit) is still tearing down its own native window — most visible on
   * Android. An always-mounted Modal that only toggles `visible` sidesteps
   * that mount race entirely.
   */
  const copy = COPY[mode ?? 'off'];
  const on = mode !== null && mode !== 'off';
  /* The ON beat is brand-green, full bleed — the closest this app comes to a
     brand moment, reserved for exactly this because it is the one filter
     with a whole screen's worth of things to say about it. OFF is the
     ordinary surface: there is nothing to celebrate about seeing non-veg
     again, so it reads as "back to normal" rather than as an event. */
  const background = on ? colors.brand : colors.surface;
  const ink = on ? colors.onBrand : colors.textPrimary;
  const sub = on ? withAlpha(colors.onBrand, 0.82) : colors.textSecondary;

  return (
    <Modal visible={mode !== null} transparent animationType="none" statusBarTranslucent onRequestClose={onDone}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.fill,
          containerStyle,
          { backgroundColor: background, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Animated.View style={[styles.badge, iconStyle, { backgroundColor: on ? colors.onBrand : colors.brandTint }]}>
          {on ? (
            <View style={{ transform: [{ scale: 1.8 }] }}>
              <DietMark diet="veg" size={28} />
            </View>
          ) : (
            <Icon name="food" size={26} color={colors.brandInk} />
          )}
        </Animated.View>

        <Text variant="title1" style={{ color: ink, textAlign: 'center', marginTop: 20 }}>
          {copy.headline}
        </Text>
        <Text variant="body" style={{ color: sub, textAlign: 'center', marginTop: 6 }}>
          {copy.body}
        </Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
