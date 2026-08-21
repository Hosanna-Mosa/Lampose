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

  /*
   * A selected chip is accent-tinted, not filled near-black.
   *
   * It used to be a solid `textPrimary` pill with the page ground as its label,
   * and on its own that was a perfectly good "on" state. What was wrong with it
   * is that it was a FIFTH one. The app says "this is the one you picked" in
   * four places — the option card, the sharing list, the category tabs, this —
   * and a student who has just learned that a chosen thing goes pale teal with
   * a green edge has to learn it again, differently, in the filter row.
   *
   * So it now borrows `OptionCard`'s language exactly: accent tint, accent
   * border at 1.5 against the unselected 1, accent ink. The heavier border is
   * what keeps it obvious in a horizontally scrolling row, where the tint alone
   * would be a weaker signal than the solid fill it replaces.
   */
  const background = removable
    ? colors.brandTint
    : selected
      ? colors.brandTint
      : colors.surface;
  const labelColor = removable ? colors.info.ink : selected ? colors.brandInk : colors.textPrimary;
  const borderColor = removable ? 'transparent' : selected ? colors.brand : colors.border;

  const body = (
    <Animated.View
      style={[
        styles.chip,
        animatedStyle,
        {
          borderRadius: radius.pill,
          backgroundColor: background,
          borderColor,
          // Heavier when selected — see the note above `background`.
          borderWidth: selected && !removable ? 1.5 : 1,
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

/* ------------------------------------------------------------------ *
 * Option card
 * ------------------------------------------------------------------ */

export type OptionCardProps = {
  /** The answer itself — "PG & Hostels", "2-sharing". */
  label: string;
  /** The line under it. What picking this actually gets you. */
  description?: string;
  selected: boolean;
  onSelect?: () => void;
  /**
   * The right-hand column, between the text and the tick. A price, normally.
   *
   * A node rather than a string because the thing on the right is usually two
   * lines of different type — a figure and its unit — and the card must not
   * decide how money is set. `RentDisplay` owns that.
   */
  trailing?: React.ReactNode;
  /**
   * Sold out, full, not offered here.
   *
   * The card stays on screen and keeps its place in the list — it is the
   * explanation for why the option above it costs what it does — but it loses
   * its tick and its press, because it is information rather than a choice.
   */
  unavailable?: boolean;
  /**
   * A row in a list (default), or a tile in a grid.
   *
   * `tile` exists because a grid says something a list cannot: that the options
   * are PEERS. A stack of full-width rows reads as ordered — the top one looks
   * recommended, the bottom one an afterthought — and where the choices are
   * genuinely equal, as the four kinds of place are, that ordering is a lie the
   * layout tells.
   *
   * The two share every colour, every border weight and the same tick, so a
   * selected tile and a selected row are recognisably the same state. Only the
   * arrangement differs: a tile stacks its content and parks the tick on the
   * top row beside `leading`, so the label and description sit on a common
   * baseline across the grid and can be read as a set.
   */
  layout?: 'row' | 'tile';
  /**
   * A mark at the start of the card — a category monogram, an icon.
   *
   * In `tile` it shares the top row with the tick, which is what keeps the
   * text below it from moving when the card is selected. A tile that reflows on
   * selection reads as a different tile.
   */
  leading?: React.ReactNode;
  /** Single choice (default) or a multi-select list. */
  role?: 'radio' | 'checkbox';
  /** Overrides the composed default, which is label + description + trailing. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: ViewStyle;
  testID?: string;
};

/**
 * The one selectable card in the app.
 *
 * Every "pick one of these" in the product is this component: the kind of place
 * on the entry screen, the sharing type on a listing, the meal plan, the
 * payment method. That is the point of it — before this existed each of those
 * had drawn its own row, and they had drifted into four different ideas of what
 * "selected" looks like.
 *
 * ## What selection is made of
 *
 * Three signals, and deliberately not one:
 *
 *   - the accent TINT behind the card,
 *   - the accent BORDER, at 1.5 against the unselected 1,
 *   - a filled accent disc with a tick in it, replacing a hollow ring.
 *
 * The tint and the border are the reference's own treatment and are what make a
 * selected card obvious across a list at arm's length. The tick is what makes
 * it obvious to someone who cannot separate the tint from the surface — it is a
 * change of SHAPE, not of colour, and it is why this component does not do what
 * the reference literally draws on its sharing rows, which is tint alone.
 *
 * The label also steps from `bodyLg` to `bodyStrong`. That is a fourth channel
 * and the weakest of the four; it is there because it costs nothing, not
 * because it could carry the state on its own.
 *
 * ## The card is the target
 *
 * The whole card takes the press, not the tick. A 22pt disc is under half the
 * minimum target, and a list of them asks for precision the content does not
 * need — anywhere on the row means the same thing.
 */
export function OptionCard({
  label,
  description,
  selected,
  onSelect,
  trailing,
  unavailable = false,
  layout = 'row',
  leading,
  role = 'radio',
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: OptionCardProps) {
  const { colors, space, radius, touch } = useTheme();
  const reduceMotion = useReduceMotion();

  const on = selected && !unavailable;
  const progress = useDerivedValue(() => withTiming(on ? 1 : 0, TICK), [on]);

  const discStyle = useAnimatedStyle(
    () => ({
      opacity: progress.value,
      transform: [{ scale: reduceMotion ? 1 : 0.4 + progress.value * 0.6 }],
    }),
    [reduceMotion],
  );

  const tile = layout === 'tile';

  /* Shared by both layouts, so a selected tile and a selected row are visibly
     the same state and differ only in arrangement. */
  const shell = {
    borderRadius: radius.button,
    /* The selected border is heavier as well as louder. At a constant 1pt the
       tint does all the work, and the tint is the signal that a colour-blind
       user does not get. */
    borderWidth: on ? 1.5 : 1,
    borderColor: unavailable ? colors.borderSubtle : on ? colors.brand : colors.border,
    backgroundColor: unavailable ? colors.surfaceSunken : on ? colors.brandTint : colors.surface,
  };

  const text = (
    <View style={tile ? styles.optionTileText : styles.flex}>
      <Text variant={on ? 'bodyStrong' : 'bodyLg'} color={unavailable ? 'tertiary' : 'primary'}>
        {label}
      </Text>
      {description ? (
        <Text variant="caption" color={unavailable ? 'tertiary' : 'secondary'}>
          {description}
        </Text>
      ) : null}
    </View>
  );

  /* An unavailable card has no control, so it draws no indicator at all — not a
     greyed-out one. A dimmed tick still reads as something you could tap if you
     tried harder. */
  const indicator = unavailable ? null : (
    <View
      style={[
        styles.optionIndicator,
        {
          borderRadius: radius.pill,
          /* The ring is `borderInput`, not `border`: an unanswered control needs
             3:1 against the surface it sits on, and the decorative hairline is a
             fifth of that. Same rule as an empty text field. */
          borderColor: on ? colors.brand : colors.borderInput,
          borderWidth: on ? 0 : 1.75,
        },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          discStyle,
          styles.optionDisc,
          { borderRadius: radius.pill, backgroundColor: colors.brand },
        ]}
      >
        <Icon name="check" size={16} color={colors.onBrand} />
      </Animated.View>
    </View>
  );

  const body = tile ? (
    <View
      style={[
        styles.optionTile,
        shell,
        { minHeight: 148, padding: space[4], gap: space[3] },
      ]}
    >
      {/* The tick rides the leading mark's row, so selecting a tile never
          displaces the text under it. `space-between` on the row keeps the tick
          hard right whether or not a `leading` node was given. */}
      <View style={styles.optionTileHead}>
        {leading ?? <View />}
        {indicator}
      </View>
      {text}
    </View>
  ) : (
    <View
      style={[
        styles.optionCard,
        shell,
        {
          minHeight: 64,
          paddingVertical: space[3],
          paddingHorizontal: space[4],
          gap: space[3],
        },
      ]}
    >
      {leading}
      {text}
      {trailing ? <View style={styles.optionTrailing}>{trailing}</View> : null}
      {indicator}
    </View>
  );

  const spoken =
    accessibilityLabel ?? (description ? `${label}, ${description}` : label);

  if (unavailable || !onSelect) {
    return (
      <View accessible accessibilityLabel={spoken} style={style} testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      accessibilityLabel={spoken}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={[{ minHeight: touch.min }, style]}
    >
      {body}
    </Pressable>
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
    shadowColor: '#1A1917',
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
  optionCard: { flexDirection: 'row', alignItems: 'center' },
  /* The mark and the tick at the top, the words at the bottom, so the labels
     land on one horizontal line across a grid of these. */
  optionTile: { justifyContent: 'space-between', alignItems: 'stretch' },
  optionTileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  optionTileText: { gap: 2 },
  optionTrailing: { alignItems: 'flex-end' },
  /* 22pt to match the radio and the checkbox, so the three indicators are one
     size wherever they appear beside each other. */
  optionIndicator: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  optionDisc: { alignItems: 'center', justifyContent: 'center' },
});
