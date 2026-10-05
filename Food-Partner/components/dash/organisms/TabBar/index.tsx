/* The dashboard's tab bar: the Adios partner app's floating pill, with a
   brand-tinted highlight that glides between tabs. Selected tabs carry the
   green as INK (`brandInk`) on its tint, which is what keeps "this one is
   selected" readable in a bright kitchen. */
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TABS } from "@/components/dash/utils/shared";
import { SPRING, Txt } from "@/components/ui";
import { elevation, font, ms, radius, size, ui } from "@/theme/ui";

type IconName = keyof typeof Ionicons.glyphMap;

const GLYPHS: Record<string, { icon: IconName; activeIcon: IconName }> = {
  index: { icon: "grid-outline", activeIcon: "grid" },
  menu: { icon: "restaurant-outline", activeIcon: "restaurant" },
  orders: { icon: "receipt-outline", activeIcon: "receipt" },
  profile: { icon: "person-outline", activeIcon: "person" },
};

const SIDE_MARGIN = ms(16);
const PILL_HEIGHT = ms(64);
const BOTTOM_GAP = ms(8);
const TOP_CLEARANCE = ms(16);

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const [rowWidth, setRowWidth] = React.useState(0);
  const segment = TABS.length ? (rowWidth - 8) / TABS.length : 0;
  const x = useSharedValue(0);
  React.useEffect(() => {
    x.value = withSpring(state.index * segment, SPRING);
  }, [state.index, segment, x]);
  const indicatorStyle = useAnimatedStyle(() => ({ width: segment, transform: [{ translateX: x.value }] }));

  return (
    <View style={[styles.pill, { bottom: insets.bottom + BOTTOM_GAP }]}>
      <View style={styles.row} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
        {rowWidth > 0 ? (
          <Animated.View style={[styles.indicator, indicatorStyle]}>
            <View style={styles.indicatorPill} />
          </Animated.View>
        ) : null}
        {TABS.map((tab, index) => {
          const focused = state.index === index;
          const glyph = GLYPHS[tab.name] ?? { icon: "ellipse-outline" as IconName, activeIcon: "ellipse" as IconName };
          const hasBadge = tab.name === "orders";
          const badgeCount = 0;

          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.item}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: state.routes[index].key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigation.navigate(state.routes[index].name);
              }}
            >
              <View>
                <Ionicons
                  name={focused ? glyph.activeIcon : glyph.icon}
                  size={ms(21)}
                  color={focused ? ui.brandInk : ui.muted}
                />
                {hasBadge && badgeCount > 0 && (
                  <View style={styles.badge}>
                    <Txt style={styles.badgeText}>{badgeCount > 9 ? "9+" : badgeCount}</Txt>
                  </View>
                )}
              </View>
              <Txt style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                {tab.label}
              </Txt>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** Bottom padding a tab screen's scroll content needs so nothing sits under the bar. */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  return insets.bottom + BOTTOM_GAP + PILL_HEIGHT + TOP_CLEARANCE;
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    left: SIDE_MARGIN,
    right: SIDE_MARGIN,
    height: PILL_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    ...elevation.lg,
  },
  row: { flex: 1, flexDirection: "row", paddingHorizontal: 4 },
  indicator: {
    position: "absolute",
    top: ms(7),
    bottom: ms(7),
    left: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorPill: { width: "86%", height: "100%", borderRadius: radius.pill, backgroundColor: ui.brandSkin },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  label: { fontFamily: font.body.medium, fontSize: size.small, color: ui.muted },
  labelActive: { fontFamily: font.body.semibold, color: ui.brandInk },
  badge: {
    position: "absolute",
    top: -5,
    right: -10,
    minWidth: ms(17),
    height: ms(17),
    borderRadius: ms(9),
    paddingHorizontal: 4,
    backgroundColor: ui.errorSolid,
    borderWidth: 1.5,
    borderColor: ui.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: font.body.bold, fontSize: size.small, color: ui.white },
});
