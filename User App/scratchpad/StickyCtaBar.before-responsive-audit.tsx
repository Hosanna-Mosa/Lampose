import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, RentDisplay, Text } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { useShouldStack } from '@/utils/responsive';

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
  onMeasure,
}: StickyCtaBarProps) {
  const { colors, space, layout, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  // Batch 12 accessibility pass: price + button do not fit one row above 1.4×.
  const stacked = useShouldStack();

  const handleLayout = (event: LayoutChangeEvent) => {
    onMeasure?.(event.nativeEvent.layout.height);
  };

  return (
    <View style={styles.host} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(0,0,0,0)', colors.bg]}
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
        <View
          style={[
            stacked ? styles.stack : styles.row,
            { gap: stacked ? space[3] : space[4] },
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
            <PriceSlot
              rent={rent}
              deposit={deposit}
              depositMonths={depositMonths}
              total={total}
              secondaryLine={secondaryLine}
            />
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
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
