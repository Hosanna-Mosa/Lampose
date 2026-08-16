import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from './Icon';
import { Text } from './Text';
import { easing } from '@/constants/motion';
import { usePressAnimation } from '@/hooks/usePressAnimation';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

const TICK = { duration: 160, easing: easing.enter };
const FILL = { duration: 90 };

/* ------------------------------------------------------------------ *
 * Checkbox
 * ------------------------------------------------------------------ */

export type CheckboxProps = {
  /**
   * Always a plain string, because this is what assistive technology reads.
   * `labelNode` may replace what is *drawn*; it never replaces this.
   */
  label: string;
  /**
   * A richer label — underlined links inside the sentence, typically.
   *
   * The row stays one checkbox target and one accessible name; the node only
   * changes what is painted. Anything tappable inside it must stop propagation
   * itself, or it will toggle the box on the way past.
   */
  labelNode?: React.ReactNode;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
  /** Explains a disabled row, e.g. "not in this building". */
  note?: string;
};

/** A 44pt row around a 22px box — the row is the target, not the box. */
export function Checkbox({ label, labelNode, checked, onChange, indeterminate = false, disabled = false, note }: CheckboxProps) {
  const { colors, space, touch } = useTheme();
  const on = indeterminate || checked;

  const progress = useDerivedValue(() => withTiming(on ? 1 : 0, FILL), [on]);

  const boxStyle = useAnimatedStyle(
    () => ({
      backgroundColor: disabled
        ? colors.surfaceSunken
        : interpolateColor(progress.value, [0, 1], [colors.surface, colors.brand]),
      borderColor: disabled ? colors.border : on ? colors.brand : colors.textTertiary,
    }),
    [disabled, on, colors],
  );

  return (
    <Pressable
      onPress={disabled ? undefined : () => onChange?.(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: indeterminate ? 'mixed' : checked, disabled }}
      accessibilityLabel={label}
      style={[styles.row, { minHeight: touch.min, gap: space[3] }]}
    >
      <Animated.View style={[styles.box, boxStyle]}>
        {/* Indeterminate is a dash, not a cross — a cross reads as "no". */}
        {indeterminate ? (
          <View style={[styles.dash, { backgroundColor: disabled ? colors.textTertiary : colors.onBrand }]} />
        ) : checked ? (
          <Icon name="check" size={16} color={disabled ? colors.textTertiary : colors.onBrand} />
        ) : null}
      </Animated.View>
      {labelNode ? (
        <View style={styles.flex}>{labelNode}</View>
      ) : (
        <Text variant="bodyLg" color={disabled ? 'tertiary' : 'primary'} style={styles.flex}>
          {label}
        </Text>
      )}
      {note ? (
        <Text variant="numMeta" color="tertiary">
          {note}
        </Text>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Radio
 * ------------------------------------------------------------------ */

export type RadioProps = {
  label: string;
  selected: boolean;
  onSelect?: () => void;
  disabled?: boolean;
};

/**
 * Never pre-selected.
 *
 * Gender is a hard filter here, and a wrong default wastes the entire session
 * before the user notices — so the group starts empty and asks.
 */
export function Radio({ label, selected, onSelect, disabled = false }: RadioProps) {
  const { colors, space, touch } = useTheme();
  const reduceMotion = useReduceMotion();

  const progress = useDerivedValue(() => withTiming(selected ? 1 : 0, TICK), [selected]);

  const dotStyle = useAnimatedStyle(
    () => ({
      opacity: progress.value,
      transform: [{ scale: reduceMotion ? 1 : 0.4 + progress.value * 0.6 }],
    }),
    [reduceMotion],
  );

  return (
    <Pressable
      onPress={disabled ? undefined : onSelect}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      style={[styles.row, { minHeight: touch.min, gap: space[3] }]}
    >
      <View
        style={[
          styles.radioRing,
          { borderColor: disabled ? colors.border : selected ? colors.brand : colors.textTertiary },
        ]}
      >
        <Animated.View style={[styles.radioDot, dotStyle, { backgroundColor: colors.brand }]} />
      </View>
      <Text
        variant={selected ? 'bodyStrong' : 'bodyLg'}
        color={disabled ? 'tertiary' : 'primary'}
        style={styles.flex}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Switch
 * ------------------------------------------------------------------ */

export type SwitchProps = {
  label: string;
  value: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
};

/**
 * Switches are for settings that take effect the instant they are flipped.
 * Never for form input — a form needs a submit, and a switch promises there
 * isn't one.
 */
export function Switch({ label, value, onChange, disabled = false }: SwitchProps) {
  const { colors, space, touch, radius } = useTheme();
  const reduceMotion = useReduceMotion();

  const progress = useDerivedValue(() => withTiming(value ? 1 : 0, TICK), [value]);

  const trackStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        [colors.border, colors.brand],
      ),
    }),
    [colors],
  );

  const thumbStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: reduceMotion ? (value ? 20 : 0) : progress.value * 20 }] }),
    [reduceMotion, value],
  );

  return (
    <Pressable
      onPress={disabled ? undefined : () => onChange?.(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      style={[styles.row, { minHeight: touch.min, gap: space[3], opacity: disabled ? 0.6 : 1 }]}
    >
      <Text variant="bodyLg" color={disabled ? 'tertiary' : 'primary'} style={styles.flex}>
        {label}
      </Text>
      <Animated.View style={[styles.track, trackStyle, { borderRadius: radius.pill }]}>
        <Animated.View style={[styles.thumb, thumbStyle, { borderRadius: radius.pill }]} />
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Chip
 * ------------------------------------------------------------------ */

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Renders the brand-tint removable variant with an ✕ target. */
  onRemove?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

/**
 * Two variants in one component: selectable, and removable.
 *
 * Selectable chips are 40pt tall with a 44pt tap slop — the visual box is
 * allowed to be shorter than the target as long as the slop makes up the
 * difference.
 */
export function Chip({ label, selected = false, onPress, onRemove, disabled = false, style }: ChipProps) {
  const { colors, space, radius } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation('chip');

  const removable = Boolean(onRemove);

  const background = removable
    ? colors.brandTint
    : selected
      ? colors.textPrimary
      : colors.surface;
  const labelColor = removable ? colors.info.ink : selected ? colors.bg : colors.textPrimary;
  const borderColor = removable ? 'transparent' : selected ? colors.textPrimary : colors.border;

  const body = (
    <Animated.View
      style={[
        styles.chip,
        animatedStyle,
        {
          borderRadius: radius.pill,
          backgroundColor: background,
          borderColor,
          paddingLeft: space[4],
          paddingRight: removable ? space[2] : space[4],
          gap: space[2],
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <Text variant="bodyStrong" style={{ color: labelColor }}>
        {label}
      </Text>
      {removable ? (
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          style={[styles.chipRemove, { borderRadius: radius.pill, backgroundColor: colors.info.border }]}
        >
          <Icon name="close" size={16} color={colors.info.ink} />
        </Pressable>
      ) : null}
    </Animated.View>
  );

  // A removable chip with no onPress is not wrapped in a Pressable at all: a
  // disabled parent Pressable swallows touches from its children, which would
  // leave the ✕ inert.
  if (!onPress) return <View style={style}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={2}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      style={style}
    >
      {body}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Segmented control
 * ------------------------------------------------------------------ */

export type SegmentedControlProps<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** Announced to screen readers as the group's purpose. */
  accessibilityLabel?: string;
};

/**
 * Two to four options.
 *
 * The active label is two overlaid Text nodes at weight 400 and 600 with
 * opposing opacity, rather than an animated fontWeight — React Native cannot
 * interpolate a weight, so it snaps mid-transition and the crossfade pops.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const { colors, space, radius, touch } = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.segmented,
        {
          backgroundColor: colors.surfaceSunken,
          borderRadius: radius.button,
          padding: space[1] - 1,
          minHeight: touch.min,
        },
      ]}
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option}
            style={[
              styles.segment,
              {
                borderRadius: radius.chip,
                backgroundColor: active ? colors.surface : 'transparent',
              },
            ]}
          >
            {/* Two overlaid labels rather than an animated fontWeight, which
                React Native cannot interpolate — it snaps mid-transition. */}
            <View>
              <Text variant="bodyLg" color={active ? 'primary' : 'secondary'} style={{ opacity: active ? 0 : 1 }}>
                {option}
              </Text>
              <Text
                variant="bodyStrong"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  textAlign: 'center',
                  opacity: active ? 1 : 0,
                  color: colors.textPrimary,
                }}
              >
                {option}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Stepper
 * ------------------------------------------------------------------ */

export type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Read out with the value, e.g. "sharing". */
  accessibilityLabel: string;
  /** Rendered after the number, e.g. "sharing" or "months". */
  unit?: string;
};

/**
 * The value sits in the numeric face so the control's width does not jump
 * when it crosses from 9 to 10. Bounds disable the buttons rather than hiding
 * them — a control that disappears is a control the user has to re-find.
 */
export function Stepper({ value, onChange, min = 1, max = 4, accessibilityLabel, unit }: StepperProps) {
  const { colors, space, radius, touch } = useTheme();

  const step = (delta: number, atBound: boolean, label: string) => (
    <Pressable
      onPress={atBound ? undefined : () => onChange(value + delta)}
      disabled={atBound}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${accessibilityLabel}`}
      accessibilityState={{ disabled: atBound }}
      style={[
        styles.stepButton,
        {
          width: touch.min,
          height: touch.min,
          borderRadius: radius.chip,
          borderColor: atBound ? colors.borderSubtle : colors.border,
          backgroundColor: atBound ? colors.surfaceSunken : colors.surface,
        },
      ]}
    >
      <Text variant="priceMd" color={atBound ? 'tertiary' : 'primary'}>
        {label === 'Decrease' ? '–' : '+'}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.row, { gap: space[3] }]}>
      {step(-1, value <= min, 'Decrease')}
      <Text variant="priceMd" accessibilityLiveRegion="polite">
        {value}
        {unit ? ` ${unit}` : ''}
      </Text>
      {step(1, value >= max, 'Increase')}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioRing: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 11, height: 11, borderRadius: 999 },
  dash: { width: 10, height: 2, borderRadius: 1 },
  track: { width: 52, height: 32, padding: 3, justifyContent: 'center' },
  thumb: {
    width: 26,
    height: 26,
    backgroundColor: '#FFFFFF',
    shadowColor: '#10151C',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  chipRemove: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row' },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stepButton: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
