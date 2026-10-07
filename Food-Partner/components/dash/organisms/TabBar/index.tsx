/* The dashboard's tab bar: the Adios partner app's floating pill, with a
   glass bubble that slides between tabs — the same travelling highlight as
   the Seating control's AC / Non-AC, stretched while it moves so it reads as
   a bubble. Selected tabs carry the green as INK (`brandInk`) on its tint,
   which is what keeps "this one is selected" readable in a bright kitchen. */
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TABS } from "@/components/dash/utils/shared";
import { onTableCount, pendingTableRequests } from "@/services/tablePump";
import { Txt } from "@/components/ui";
import { elevation, font, ms, radius, size, ui } from "@/theme/ui";

type IconName = keyof typeof Ionicons.glyphMap;

const GLYPHS: Record<string, { icon: IconName; activeIcon: IconName }> = {
  index: { icon: "grid-outline", activeIcon: "grid" },
  menu: { icon: "restaurant-outline", activeIcon: "restaurant" },
  orders: { icon: "receipt-outline", activeIcon: "receipt" },
  tables: { icon: "calendar-outline", activeIcon: "calendar" },
  profile: { icon: "person-outline", activeIcon: "person" },
};

const SIDE_MARGIN = ms(16);
const PILL_HEIGHT = ms(64);
const BOTTOM_GAP = ms(8);
const TOP_CLEARANCE = ms(16);

/* The bubble's spring, on the tab INDEX — under-damped so it settles like a
   bubble rather than stopping like a cursor. */
const BUBBLE_SPRING = {
  damping: 17,
  stiffness: 210,
  mass: 0.8,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.01,
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  /*
   * The bubble runs on the tab index, multiplied out by the measured row in
   * the worklet, so a late layout or a rotation lands it in the right cell.
   * While it travels it is stretched by how far it still has to go, and
   * settles back to one cell as it lands. The first placement is not a move.
   */
  const reduceMotion = useReducedMotion();
  const rowWidth = useSharedValue(0);
  const [measured, setMeasured] = React.useState(false);
  const position = useSharedValue(state.index);
  const target = useSharedValue(state.index);
  const placed = React.useRef(false);
  React.useEffect(() => {
    target.value = state.index;
    position.value = !placed.current || reduceMotion ? state.index : withSpring(state.index, BUBBLE_SPRING);
    placed.current = true;
  }, [state.index, reduceMotion, position, target]);

  /* Table requests waiting an answer — the Dine-in tab's badge. From the
     table pump, so it is right on every tab, not only once Dine-in is open. */
  const [tableRequests, setTableRequests] = React.useState(pendingTableRequests);
  React.useEffect(() => onTableCount(setTableRequests), []);
  const indicatorStyle = useAnimatedStyle(() => {
    const cell = TABS.length ? (rowWidth.value - 8) / TABS.length : 0;
    const still = Math.min(Math.abs(target.value - position.value), 1);
    return {
      width: cell,
      transform: [
        { translateX: position.value * cell },
        { scaleX: 1 + still * 0.28 },
        { scaleY: 1 - still * 0.06 },
      ],
    };
  });

  return (
    <View style={[styles.pill, { bottom: insets.bottom + BOTTOM_GAP }]}>
      <View
        style={styles.row}
        onLayout={(e) => {
          rowWidth.value = e.nativeEvent.layout.width;
          setMeasured(true);
        }}
      >
        {measured ? (
          <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]}>
            {/* Glass: a tint, a bright rim, and a highlight across the top. */}
            <View style={styles.indicatorPill}>
              <View style={styles.glassShine} />
            </View>
          </Animated.View>
        ) : null}
        {TABS.map((tab, index) => {
          const focused = state.index === index;
          const glyph = GLYPHS[tab.name] ?? { icon: "ellipse-outline" as IconName, activeIcon: "ellipse" as IconName };
          const hasBadge = tab.name === "orders" || tab.name === "tables";
          const badgeCount = tab.name === "tables" ? tableRequests : 0;

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
  indicatorPill: {
    width: "88%",
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: ui.brandSkin,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
    overflow: "hidden",
  },
  glassShine: {
    position: "absolute",
    top: 1,
    left: 6,
    right: 6,
    height: "45%",
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
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
