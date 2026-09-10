import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextStyle,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { colors, elevation, radius, space, tone as resolveTone, touch, type ToneName } from "@/theme";
import { Icon, type IconName } from "@/components/common/atoms/Icon";
import { Text } from "@/components/common/atoms/Text";
import { styles } from "@/components/common/utils/primitiveStyles";
import { IconBtn } from "@/components/common/atoms/IconBtn";


// ─── Numeric stepper ──────────────────────────────────────────────────────────

/**
 * A minus / value / plus row for the operations numbers — preparation time,
 * delivery radius, order minimums.
 *
 * Holding a button repeats rather than firing once: setting a 45-minute prep
 * time in five-minute steps is nine taps otherwise, on a form that already
 * has a hundred fields.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
  prefix,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  prefix?: string;
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /* The repeat reads the value through a ref: the interval closes over the
     render that started it, so without this it would add one step forever. */
  const latest = useRef(value);
  latest.current = value;

  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const bump = (dir: 1 | -1) => onChange(clamp(latest.current + dir * step));

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  // A component unmounted mid-hold would otherwise leave the interval running.
  useEffect(() => stop, []);

  const hold = (dir: 1 | -1) => {
    stop();
    timer.current = setInterval(() => bump(dir), 110);
  };

  return (
    <View style={styles.stepper}>
      <IconBtn
        glyph="minus"
        accessibilityLabel="Decrease"
        onPress={() => bump(-1)}
        tone="transparent"
        bg="transparent"
        fg={value <= min ? colors.textTertiary : colors.textPrimary}
      />
      <Pressable onLongPress={() => hold(-1)} onPressOut={stop} style={styles.stepperHold} />
      <View style={styles.stepperValue}>
        <Text variant="priceMd">
          {prefix ?? ""}
          {value}
          {suffix ? ` ${suffix}` : ""}
        </Text>
      </View>
      <Pressable onLongPress={() => hold(1)} onPressOut={stop} style={styles.stepperHold} />
      <IconBtn
        glyph="plus"
        accessibilityLabel="Increase"
        onPress={() => bump(1)}
        tone="transparent"
        bg="transparent"
        fg={value >= max ? colors.textTertiary : colors.textPrimary}
      />
    </View>
  );
}
