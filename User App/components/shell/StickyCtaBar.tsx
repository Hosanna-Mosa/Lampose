import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, RentDisplay, Text } from '@/components/ui';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { withAlpha } from '@/utils/color';

/** The veil lets list content fade under the bar instead of being clipped. */
const VEIL_HEIGHT = 70;

export type StickyCtaBarProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** The last thing read before the tap. Part of the bar, not the body. */
  note?: string;
  /** Present means the money variant: rent and deposit sit left of the action. */
  rent?: number;
  deposit?: number;
  depositMonths?: number;
  /** The figure is a total for a chosen stay, so it carries no unit suffix. */
  total?: boolean;
  /** What the total covers: "7 days · with mess". Sits under the number. */
  secondaryLine?: string;
  /**
   * "× 3 months" — what the figure beside it gets multiplied by.
   *
   * The bar shows the *rate* and the *count* as two readable parts rather than
   * one pre-multiplied total. A student comparing three places is comparing
   * rates; a total silently folds the length in and makes two listings at the
   * same rate look different because one was viewed at 3 months and the other
   * at 6.
   */
  multiplier?: string;
  /** Measured, never assumed — the bar is 76pt with one button and 180 with three. */
  onMeasure?: (height: number) => void;
};

/**
 * The sticky action bar. Absolute, at the bottom, inside thumb reach.
 *
 * It never hides or reappears on scroll. In a booking flow a primary action
 * that moves reads as a broken screen, and the user's next act is to scroll
 * around hunting for it.
 *
 * Rent and deposit sit to the left of the button so the thumb passes over both
 * numbers on its way to the tap. They are never collapsed into a single total:
 * they are different kinds of money, and the deposit keeps its dotted amber
 * underline to say so.
 */
export function StickyCtaBar({
  label,
  onPress,
  disabled = false,
  loading = false,
  note,
  rent,
  deposit,
  depositMonths,
  total = false,
  secondaryLine,
  multiplier,
  onMeasure,
}: StickyCtaBarProps) {
  const { colors, space, layout, elevation } = useTheme();
  const insets = useSafeAreaInsets();

  /*
   * Content fit, not device width.
   *
   * This used to ask `useShouldStack()`, which answers "is this device
   * narrow?" — the wrong question, and one that made four unrelated components
   * change composition together at 380dp. A 360dp phone whose content happens
   * to fit was being stacked anyway, and the same threshold was reshaping the
   * cost breakdown and the amenity grid at the same instant.
   *
   * The right question is whether THIS bar's own content fits ITS own row. So
   * the price block and the button are measured at their intrinsic widths in a
   * hidden layer, and the row is measured too. If the two children plus the gap
   * exceed the row, the bar stacks. Nothing else in the app is consulted or
   * affected.
   *
   * This also makes font scale fall out for free rather than needing its own
   * term: scaled text produces wider intrinsic measurements, so a 1.15 device
   * stacks exactly when its text has actually grown past the row — not because
   * a multiplier crossed a number someone chose.
   */
  const gap = space[4];
  const [rowWidth, setRowWidth] = useState(0);
  const [priceWidth, setPriceWidth] = useState(0);
  const [buttonWidth, setButtonWidth] = useState(0);

  const hasPrice = rent !== undefined;
  const measured = rowWidth > 0 && priceWidth > 0 && buttonWidth > 0;

  /*
   * Horizontal is the preferred layout and the default before measurement.
   *
   * Defaulting the other way would flash a stacked bar on every mount. Being
   * wrong in this direction is harmless because the price carries `flexShrink`
   * with `minWidth: 0` — an unmeasured frame squeezes the price rather than
   * pushing the button off the edge.
   */
  const stacked = hasPrice && measured && priceWidth + gap + buttonWidth > rowWidth;

  /*
   * This bar owns the bottom edge on every screen it appears on, so the
   * floating request pill has to sit above it rather than on top of it.
   *
   * Declared here rather than by each screen: the bar is the thing that knows
   * its own height, and a screen that forgot to declare it would get a pill
   * overlapping its primary action.
   */
  const { reserveBottom, releaseBottom } = usePendingRequest();
  useEffect(() => () => releaseBottom('cta'), [releaseBottom]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    onMeasure?.(height);
    reserveBottom('cta', height);
  };

  /** Guarded so a layout pass that reports the same number cannot loop. */
  const measure = (set: (value: number) => void, current: number) => (event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.width);
    if (next > 0 && next !== current) set(next);
  };

  return (
    <View style={styles.host} pointerEvents="box-none">
      <LinearGradient
        // The ground at zero alpha, not transparent black — see `withAlpha`.
        colors={[withAlpha(colors.bg, 0), colors.bg]}
        style={{ height: VEIL_HEIGHT }}
        pointerEvents="none"
      />
      <View
        onLayout={handleLayout}
        style={[
          elevation.float,
          {
            backgroundColor: colors.surface,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: insets.bottom + layout.gutter,
            gap: space[2],
          },
        ]}
      >
        {/*
          The measuring layer.

          Absolutely positioned and transparent, so it occupies no space and
          paints nothing. `alignItems: 'flex-start'` is load bearing: a column
          stretches its children by default, which would report both widths as
          the width of the wider one and make the comparison meaningless.

          It renders `RentDisplay` rather than `PriceSlot` on purpose — the slot
          is only an animated wrapper, and duplicating it would run the
          crossfade twice for one visible price.

          Hidden from assistive technology in both directions, so the button
          label and the price are announced once, not twice.
        */}
        {hasPrice ? (
          <View
            style={styles.measure}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View onLayout={measure(setPriceWidth, priceWidth)} style={[styles.money, { gap: space[2] }]}>
              <RentDisplay
                rent={rent}
                deposit={deposit}
                depositMonths={depositMonths}
                size="bar"
                total={total}
                secondaryLine={secondaryLine}
              />
              {multiplier ? <Text variant="numMeta">{multiplier}</Text> : null}
            </View>
            <View onLayout={measure(setButtonWidth, buttonWidth)}>
              <Button label={label} size="lg" />
            </View>
          </View>
        ) : null}

        <View
          onLayout={measure(setRowWidth, rowWidth)}
          style={[
            stacked ? styles.stack : styles.row,
            { gap: stacked ? space[3] : gap },
          ]}
        >
          {rent !== undefined ? (
            // Disabled greys only the button. The number stays fully legible,
            // because it is information rather than part of the control.
            //
            // The price shrinks and the button does not. This is the safety net
            // under the breakpoint: a breakpoint is always a guess, and this
            // makes the guess non-fatal. A clipped primary action is unusable,
            // whereas a tight price is merely tight — so if something has to
            // give, it must not be the button.
            <View style={[styles.money, styles.shrinkable, { gap: space[2] }]}>
              <PriceSlot
                rent={rent}
                deposit={deposit}
                depositMonths={depositMonths}
                total={total}
                secondaryLine={secondaryLine}
              />
              {/* The count, kept out of the figure. It never shrinks — a
                  truncated "× 3 mont…" is worse than a tight rate beside it. */}
              {multiplier ? (
                <Text variant="numMeta" color="secondary" style={styles.noShrink}>
                  {multiplier}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Button
            label={label}
            onPress={onPress}
            disabled={disabled}
            loading={loading}
            size="lg"
            // Stacked, the price has its own row and the button takes the width.
            fullWidth={rent === undefined || stacked}
            style={rent !== undefined && !stacked ? styles.noShrink : styles.flex}
          />
        </View>
        {note ? (
          <Text variant="numMeta" color="secondary">
            {note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The price slot, with the overlapped swap.
 *
 * When the number changes — the user picked a different sharing type and is
 * watching — the old value fades out over 140ms while the new one fades in
 * from t=70ms, so both are on screen from 70 to 140 and the slot is never
 * empty. Tabular digits hold the box width, so the overlap shifts nothing.
 *
 * Digits never tick, roll or odometer. A rolling number implies the value is
 * live and might keep moving; on a rent figure, in a product whose argument is
 * that money is fixed and accountable, that would contradict the whole thesis.
 */
function PriceSlot({
  rent,
  deposit,
  depositMonths,
  total = false,
  secondaryLine,
}: {
  rent: number;
  deposit?: number;
  depositMonths?: number;
  total?: boolean;
  secondaryLine?: string;
}) {
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState(rent);
  const previous = useRef(rent);

  useEffect(() => {
    if (rent === previous.current) return;
    previous.current = rent;
    // The incoming node starts at t=70 while the outgoing one is still fading.
    const timer = setTimeout(() => setShown(rent), reduceMotion ? 0 : 70);
    return () => clearTimeout(timer);
  }, [rent, reduceMotion]);

  return (
    <Animated.View
      key={shown}
      // minWidth:0 is what actually lets a flex child narrow below its own
      // content in React Native. Without it `flexShrink` does nothing at all
      // and the sibling button is what gets pushed off the edge.
      style={styles.shrinkable}
      entering={reduceMotion ? FadeIn.duration(120) : FadeIn.duration(200)}
      exiting={reduceMotion ? FadeOut.duration(120) : FadeOut.duration(140)}
    >
      <RentDisplay
        rent={shown}
        deposit={deposit}
        depositMonths={depositMonths}
        size="bar"
        total={total}
        secondaryLine={secondaryLine}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { flexDirection: 'column', alignItems: 'stretch' },
  noShrink: { flexShrink: 0 },
  shrinkable: { flexShrink: 1, minWidth: 0 },
  host: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  /* Takes no space and paints nothing; `flex-start` keeps children at their
     intrinsic widths instead of stretching them to the widest sibling. */
  measure: { position: 'absolute', top: 0, left: 0, opacity: 0, alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center' },
  /* The rate and its multiplier read as one figure, so they share a baseline. */
  money: { flexDirection: 'row', alignItems: 'baseline' },
  flex: { flex: 1 },
});
