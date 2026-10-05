import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { elevation, font, ms, radius, size, ui } from "@/theme/ui";
import { SPRING } from "./motion";
import { Txt } from "./Txt";

export interface Segment<K extends string> {
  key: K;
  label: string;
  /** Small count after the label. Hidden at 0. */
  count?: number;
}

interface Props<K extends string> {
  segments: readonly Segment<K>[];
  value: K | null | undefined;
  onChange: (key: K) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A pill of mutually exclusive options with a spring-animated highlight.
 *
 * Tapping the option that is already selected still calls `onChange`, as the
 * buttons these replaced did — a screen that re-sends its current value on a
 * second tap keeps doing so.
 */
export function SegmentedControl<K extends string>({ segments, value, onChange, disabled, style }: Props<K>) {
  const [width, setWidth] = React.useState(0);
  const segmentWidth = segments.length ? width / segments.length : 0;
  const index = segments.findIndex((s) => s.key === value);
  const x = useSharedValue(0);

  React.useEffect(() => {
    x.value = withSpring(Math.max(0, index) * segmentWidth, SPRING);
  }, [index, segmentWidth, x]);

  const indicator = useAnimatedStyle(() => ({ width: segmentWidth, transform: [{ translateX: x.value }] }));

  return (
    <View
      style={[styles.track, disabled && styles.disabled, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width - 8)}
      accessibilityRole="tablist"
    >
      {width > 0 && index >= 0 ? (
        <Animated.View style={[styles.indicatorWrap, indicator]}>
          <View style={styles.indicator} />
        </Animated.View>
      ) : null}
      {segments.map((segment) => {
        const selected = segment.key === value;
        return (
          <Pressable
            key={segment.key}
            style={styles.segment}
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: !!disabled }}
            accessibilityLabel={segment.count ? `${segment.label}, ${segment.count}` : segment.label}
            onPress={() => onChange(segment.key)}
          >
            <Txt
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {segment.label}
            </Txt>
            {segment.count ? (
              <View style={[styles.count, selected && styles.countSelected]}>
                <Txt style={[styles.countText, selected && styles.countTextSelected]}>{segment.count}</Txt>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: ui.sunken,
    borderRadius: radius.pill,
    padding: 4,
    height: ms(46),
  },
  disabled: { opacity: 0.6 },
  indicatorWrap: { position: "absolute", top: 4, bottom: 4, left: 4 },
  indicator: { flex: 1, backgroundColor: ui.surface, borderRadius: radius.pill, ...elevation.sm },
  segment: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 4 },
  label: { flexShrink: 1, fontFamily: font.body.semibold, fontSize: size.medium, color: ui.sec },
  labelSelected: { color: ui.text },
  count: {
    minWidth: ms(20),
    height: ms(20),
    borderRadius: ms(10),
    paddingHorizontal: 5,
    backgroundColor: ui.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  countSelected: { backgroundColor: ui.brand },
  countText: { fontFamily: font.body.bold, fontSize: size.small, color: ui.surface },
  countTextSelected: { color: ui.onBrand },
});
