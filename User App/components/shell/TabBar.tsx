import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, type IconName } from '@/components/ui';
import { easing } from '@/constants/motion';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

export type TabItem = {
  id: string;
  label: string;
  icon: IconName;
  /** A number badge. 1–9 render as-is; anything above shows 9+. */
  badge?: number;
  /** A bare dot: "something changed", with no count to report. */
  dot?: boolean;
};

export type TabBarProps = {
  tabs: readonly TabItem[];
  activeId: string;
  onChange: (id: string) => void;
};

/**
 * The bottom tab bar. 56pt of content plus the safe-area inset.
 *
 * Labels are always visible. An icon-only bar asks a first-time user to guess,
 * and this audience has never seen the app before — the icon set cannot carry
 * "Bookings" versus "Explore" on its own.
 *
 * There is deliberately no sliding pill or underline. Tabs are peers, not
 * points on a line: Explore is not nearer to Bookings than it is to Profile,
 * and a travelling indicator asserts an adjacency and a direction that a
 * lateral move does not have. A pill also animates position during a screen
 * swap, so a stuttering swap leaves it stranded between two tabs.
 */
export function TabBar({ tabs, activeId, onChange }: TabBarProps) {
  const { colors, space, layout } = useTheme();
  const insets = useSafeAreaInsets();

  /*
   * The bar owns the bottom edge, so the floating request pill sits above it
   * rather than over the tabs. Measured rather than assumed — the height is
   * 56pt plus a safe-area inset that differs on every device, and a pill
   * placed with a guessed number lands on the tabs on half the fleet.
   */
  const { reserveBottom, releaseBottom } = usePendingRequest();
  useEffect(() => () => releaseBottom('tabbar'), [releaseBottom]);

  const measure = (event: LayoutChangeEvent) =>
    reserveBottom('tabbar', event.nativeEvent.layout.height);

  return (
    <View
      accessibilityRole="tablist"
      onLayout={measure}
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderSubtle,
          paddingBottom: insets.bottom + layout.bottomInsetExtra,
        },
      ]}
    >
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          active={tab.id === activeId}
          onPress={() => onChange(tab.id)}
          gap={space[1] + 1}
        />
      ))}
    </View>
  );
}

function TabButton({
  tab,
  active,
  onPress,
  gap,
}: {
  tab: TabItem;
  active: boolean;
  onPress: () => void;
  gap: number;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);

  const progress = useDerivedValue(
    () => withTiming(active ? 1 : 0, { duration: reduceMotion ? 100 : 160, easing: easing.standard }),
    [active, reduceMotion],
  );

  const handlePress = () => {
    // The dip lands where the finger did. It is a press acknowledgement, not
    // an entrance, so it never runs on the tab that is already active.
    if (!reduceMotion && !active) {
      scale.value = withSequence(
        withTiming(0.92, { duration: 120, easing: easing.settle }),
        withTiming(1, { duration: 120, easing: easing.settle }),
      );
    }
    onPress();
  };

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const restLabelStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const activeLabelStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const badgeLabel = tab.badge ? (tab.badge > 9 ? '9+' : String(tab.badge)) : undefined;
  const accessibilityLabel = badgeLabel
    ? `${tab.label}, ${tab.badge} new`
    : tab.dot
      ? `${tab.label}, updated`
      : tab.label;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.tab, { gap }]}
    >
      <Animated.View style={iconStyle}>
        <Icon name={tab.icon} size={24} color={active ? colors.brandInk : colors.textTertiary} />
        {badgeLabel ? (
          <View style={[styles.badge, { backgroundColor: colors.danger.base, borderColor: colors.surface }]}>
            {/* The one deliberate override left. A badge sits inside a 16pt
                disc on a 24pt icon, so it cannot take the 11pt floor — and it
                is exempt from it for the reason the accessibility pass allows:
                the same count is stated in words on the Alerts row in Profile,
                so nothing is only available here. */}
            <Text variant="numMeta" style={{ color: colors.onBrand, fontSize: 10, lineHeight: 12 }}>
              {badgeLabel}
            </Text>
          </View>
        ) : tab.dot ? (
          <View style={[styles.dot, { backgroundColor: colors.danger.base, borderColor: colors.surface }]} />
        ) : null}
      </Animated.View>

      {/* Two overlaid label nodes with opposing opacity. fontWeight cannot be
          interpolated in React Native — it snaps between discrete weights, so
          a single animated node pops in the middle of the crossfade.

          The WIDER copy defines the layout box, and here that is the 600 one
          despite being the smaller point size: `label` is UPPERCASE with 1.1pt
          of tracking, so "BOOKINGS" at 11pt runs about 65pt against roughly
          46pt for "Bookings" at 11.5pt. Comparing point sizes alone gets this
          backwards — uppercasing and tracking are part of the width. */}
      <View>
        <Animated.View style={activeLabelStyle}>
          <Text variant="label" style={{ color: colors.brandInk, letterSpacing: 0 }}>
            {tab.label}
          </Text>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.restLabel, restLabelStyle]}>
          <Text variant="caption" color="tertiary">
            {tab.label}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  restLabel: { alignItems: 'center', justifyContent: 'center' },
});
