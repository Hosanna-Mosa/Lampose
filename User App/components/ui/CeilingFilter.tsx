import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from './Text';
import { easing } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { formatCeiling, formatShort } from '@/utils/money';

const TRACK_HEIGHT = 6;
const THUMB = 28;
/** The gesture band is taller than the track so the drag is not a pixel hunt. */
const GESTURE_BAND = 44;
const SNAP = { duration: 240, easing: easing.standard };

export type CeilingSliderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  presets: readonly number[];
  /** Brand for rent, warning for deposit — they are different kinds of money. */
  accent: string;
  zeroLabel?: string;
};

/**
 * A single ceiling: "up to this much", with no floor.
 *
 * There is deliberately no lower bound. A floor can only hide cheaper listings
 * that already meet every other criterion, and no student has ever wanted to
 * exclude a place for being too affordable. Floors are an e-commerce import,
 * where price signals quality. Two colliding handles would also be a
 * screen-reader mess for no gain.
 */
export function CeilingSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  presets,
  accent,
  zeroLabel,
}: CeilingSliderProps) {
  const { colors, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const dragging = useSharedValue(0);
  const lastHaptic = useRef(0);

  const span = max - min;
  const fraction = span > 0 ? (value - min) / span : 0;

  /*
   * Where the thumb is drawn, 0..1, owned by the UI thread.
   *
   * While a finger is down the thumb follows it exactly, frame by frame, and
   * only the SNAPPED value crosses to JS. It used to be drawn from `value`,
   * which meant every frame of a drag waited on a JS round trip and the thumb
   * hopped from step to step behind the finger. When no finger is down it
   * follows `value`, so a preset tap still glides it into place.
   */
  const progress = useSharedValue(fraction);
  useEffect(() => {
    if (dragging.value) return;
    progress.value = reduceMotion ? fraction : withTiming(fraction, SNAP);
  }, [fraction, reduceMotion, dragging, progress]);

  // Haptics are capped to one per 60ms: a step of ₹500 across a 27,000 range
  // is fifty-four steps, and firing on every one turns a drag into a buzz.
  const tick = useCallback(() => {
    const now = Date.now();
    if (now - lastHaptic.current < 60) return;
    lastHaptic.current = now;
    Haptics.selectionAsync();
  }, []);

  // Only report a value when the snapped step actually changes.
  const lastSent = useRef(value);
  lastSent.current = value;
  const commit = useCallback(
    (snapped: number) => {
      if (snapped !== lastSent.current) {
        lastSent.current = snapped;
        tick();
        onChange(snapped);
      }
    },
    [onChange, tick],
  );

  const moveTo = (x: number) => {
    'worklet';
    if (trackWidth <= 0) return;
    const next = Math.min(1, Math.max(0, x / trackWidth));
    progress.value = next;
    const raw = min + next * span;
    const snapped = Math.min(max, Math.max(min, Math.round(raw / step) * step));
    runOnJS(commit)(snapped);
  };

  const settle = () => {
    'worklet';
    dragging.value = 0;
    // Land the thumb on the step it reported, not between two.
    const raw = min + progress.value * span;
    const snapped = Math.min(max, Math.max(min, Math.round(raw / step) * step));
    const target = span > 0 ? (snapped - min) / span : 0;
    progress.value = reduceMotion ? target : withTiming(target, SNAP);
  };

  /*
   * The pan only claims the touch once it has moved sideways, and gives it up
   * if it moves vertically first — this slider sits inside a scrolling sheet,
   * and a scroll that starts on the track must stay a scroll. A plain tap on
   * the track jumps the thumb there.
   */
  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onStart((event) => {
      dragging.value = 1;
      moveTo(event.x);
    })
    .onUpdate((event) => {
      moveTo(event.x);
    })
    .onFinalize(() => {
      if (dragging.value) settle();
    });

  const tapToJump = Gesture.Tap()
    .maxDuration(400)
    .onEnd((event, success) => {
      if (!success) return;
      dragging.value = 1;
      moveTo(event.x);
      settle();
    });

  const gesture = Gesture.Race(pan, tapToJump);

  /**
   * Batch 12 motion audit, rule 2: transform and opacity only. This animated
   * `width` before, which runs layout on every frame — the exact thing that
   * janks a slider on the mid-range Android this product is mostly used on.
   *
   * The fill is laid out at full track width and scaled. `scaleX` grows
   * about the centre, so it is pushed back left by half the shortfall to keep
   * the fill anchored to the start of the track.
   */
  const fillStyle = useAnimatedStyle(() => {
    const scaleX = Math.max(progress.value, 0.0001);
    return {
      transform: [{ translateX: (scaleX - 1) * (trackWidth / 2) }, { scaleX }],
    };
  }, [trackWidth]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * trackWidth - THUMB / 2 },
      // The thumb swells under the finger so it shows through it; not under
      // reduced motion, where scale is banned.
      { scale: reduceMotion ? 1 : withTiming(dragging.value ? 1.15 : 1, { duration: 120 }) },
    ],
  }), [trackWidth, reduceMotion]);

  return (
    <View style={{ gap: space[3] }}>
      <View style={styles.headRow}>
        <Text variant="bodyStrong" style={styles.flexLabel}>
          {label}
        </Text>
        {/* Tabular so the readout does not reflow mid-drag. */}
        <Text variant="priceMd" accessibilityLiveRegion="polite">
          {formatCeiling(value, max, zeroLabel)}
        </Text>
      </View>

      {/* Presets do the work — mobile users tap, they don't drag. The slider
          is the escape hatch for someone whose limit is ₹7,200. */}
      <View style={[styles.presetRow, { gap: space[2] }]}>
        {presets.map((preset) => {
          const active = value === preset;
          return (
            <Pressable
              key={preset}
              onPress={() => onChange(preset)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Up to ${formatCeiling(preset, max, zeroLabel)}`}
              style={[
                styles.preset,
                {
                  borderRadius: radius.pill,
                  backgroundColor: active ? accent : colors.surface,
                  borderColor: active ? accent : colors.border,
                  paddingHorizontal: space[4],
                },
              ]}
            >
              <Text variant="priceSm" style={{ color: active ? colors.onBrand : colors.textPrimary }}>
                {formatShort(preset, max)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <GestureDetector gesture={gesture}>
        <View
          style={[styles.gestureBand, { height: GESTURE_BAND }]}
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: value, text: formatCeiling(value, max, zeroLabel) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            const delta = event.nativeEvent.actionName === 'increment' ? step : -step;
            onChange(Math.min(max, Math.max(min, value + delta)));
          }}
        >
          <View style={[styles.track, { backgroundColor: colors.border, borderRadius: radius.pill }]}>
            <Animated.View
              style={[styles.fill, fillStyle, { backgroundColor: accent, borderRadius: radius.pill }]}
            />
          </View>
          <Animated.View
            style={[
              styles.thumb,
              thumbStyle,
              { borderRadius: radius.pill, backgroundColor: colors.surface, borderColor: accent },
            ]}
          />
        </View>
      </GestureDetector>

      <View style={styles.headRow}>
        <Text variant="numMeta" color="tertiary">
          {formatCeiling(min, max, zeroLabel)}
        </Text>
        <Text variant="numMeta" color="tertiary">
          {formatCeiling(max, max)}
        </Text>
      </View>
    </View>
  );
}

export type CeilingFilterProps = {
  rent: number;
  onRentChange: (value: number) => void;
  deposit: number;
  onDepositChange: (value: number) => void;
  /** Server-computed. Never derived from a summed budget. */
  matchCount?: number;
};

/**
 * Two independent ceilings — rent and deposit — never summed into one.
 *
 * Rent is a monthly constraint; deposit is a capital one. A student with
 * ₹20,000 saved hits a hard wall on deposit that has nothing to do with what
 * they can pay per month, so folding both into a single "total to move in"
 * number would hide affordable rooms behind an unaffordable deposit.
 */
export function CeilingFilter({
  rent,
  onRentChange,
  deposit,
  onDepositChange,
  matchCount,
}: CeilingFilterProps) {
  const { colors, space } = useTheme();

  return (
    <View style={{ gap: space[6] }}>
      <CeilingSlider
        label="Monthly rent — up to"
        value={rent}
        onChange={onRentChange}
        min={3000}
        max={30000}
        step={500}
        presets={[5000, 8000, 10000, 15000, 30000]}
        accent={colors.brand}
      />
      <CeilingSlider
        label="Deposit I can pay — up to"
        value={deposit}
        onChange={onDepositChange}
        min={0}
        max={60000}
        step={1000}
        presets={[10000, 20000, 30000, 45000, 60000]}
        accent={colors.warning.base}
        zeroLabel="No deposit"
      />
      {matchCount !== undefined ? (
        <Text variant="caption" color="secondary">
          {matchCount} places match both ceilings — the two filters are independent, never summed.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  flexLabel: { flex: 1 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap' },
  preset: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  gestureBand: { justifyContent: 'center' },
  track: { height: TRACK_HEIGHT, width: '100%', overflow: 'hidden' },
  fill: { height: TRACK_HEIGHT, width: '100%' },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderWidth: 2,
    shadowColor: '#1A1917',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
