import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Text, type IconName } from "@/components/ui";
import { colors, layout, radius, space, touch } from "@/theme";

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Home", icon: "home" },
  { name: "orders", label: "Orders", icon: "orders" },
  { name: "earnings", label: "Earnings", icon: "earnings" },
  { name: "profile", label: "Profile", icon: "profile" },
];

/**
 * The glass bubble's travel — the customer app's `component.tabBubble`
 * (`User App/constants/motion.ts`), so the three apps' bars move alike.
 *
 * Under-damped on purpose: the small settle at the far end is what makes it
 * read as a bubble rather than a cursor. It runs on the tab INDEX, not on
 * points. Reanimated 4 ends a spring on a RELATIVE energy threshold, so the
 * rest thresholds that token also lists have no equivalent to carry over and
 * the units do not need rescaling.
 */
const TAB_BUBBLE_SPRING = { damping: 17, stiffness: 210, mass: 0.8 } as const;

/**
 * Four evenly-weighted destinations on a white bar.
 *
 * The selected tab goes to full-strength ink (near-black) on both glyph and
 * label; an unselected one stays at `textTertiary`. The old bar signalled
 * selection with ink-versus-grey alone at a 1.6:1 difference at 21px, which
 * reads as "nothing is selected" in daylight — the stronger jump to
 * `textPrimary` is what makes it legible on a scooter. Was an orange
 * (`#FF5200`) belonging to neither this app's brand teal nor its neutral
 * scale; black reads as selected without introducing a colour nothing else
 * here uses.
 *
 * The active tab also sits in a bubble of tinted glass that SLIDES to the
 * next tab on a press — the same travelling highlight as the customer app's
 * bar and the partner apps' segmented controls. It is drawn under the tabs,
 * inside the row they share, so its cells are their cells.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  /** The row's own width, so a cell's travel is measured, never guessed. */
  const rowWidth = useSharedValue(0);

  /* By name rather than by `state.index`, so a route that is not one of these
     four (anything added to the folder without a tab) hides the bubble instead
     of parking it under whichever tab shares its position. */
  const activeName = state.routes[state.index]?.name;
  const activeIndex = TABS.findIndex((tab) => tab.name === activeName);

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space[3]) + layout.bottomInsetExtra }]}
    >
      <View
        style={styles.row}
        onLayout={(event) => {
          rowWidth.value = event.nativeEvent.layout.width;
        }}
      >
        {/* The bubble, under everything: the tabs are drawn on top of it. */}
        <GlassBubble index={activeIndex} count={TABS.length} rowWidth={rowWidth} reduceMotion={reduceMotion} />

        {TABS.map((tab, index) => {
          const focused = state.index === index;
          const ink = focused ? colors.textPrimary : colors.textTertiary;

          return (
            <Pressable
              key={tab.name}
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
              style={styles.item}
            >
              <View style={styles.glyph}>
                <Icon name={tab.icon} size={22} color={ink} />
              </View>
              <Text variant="numMeta" style={{ color: ink, fontWeight: focused ? "800" : "500" }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** `#RRGGBB` at an alpha, so the glass follows the brand token rather than a
 *  hand-copied rgba of it. Anything else is returned unchanged. */
function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/**
 * The glass bubble under the active tab.
 *
 * `position` springs from the old tab index to the new one; the bubble's left
 * edge is that index times a cell's width, read from the measured row inside
 * the worklet, so a rotation or a late layout still lands it in the right
 * cell. While it travels it STRETCHES — wider by how far it still has to go —
 * and settles back to a cell's width as it lands.
 *
 * Glass, not paint: a tint of the brand at low alpha, a bright rim, and a
 * highlight across its top half, over the bar's own white. The rider app is
 * light-only (see `theme`), so there is no dark variant to pick.
 */
function GlassBubble({
  index,
  count,
  rowWidth,
  reduceMotion,
}: {
  index: number;
  count: number;
  rowWidth: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const shown = index >= 0;
  const position = useSharedValue(Math.max(0, index));
  const target = useSharedValue(Math.max(0, index));
  const visible = useSharedValue(shown ? 1 : 0);
  const placed = useRef(false);

  useEffect(() => {
    if (index < 0) return;
    target.value = index;
    /* The first placement is a placement, not a move — the bubble must not
       slide in from the first tab when the app opens on the third. */
    position.value = !placed.current || reduceMotion ? index : withSpring(index, TAB_BUBBLE_SPRING);
    placed.current = true;
  }, [index, reduceMotion, position, target]);

  useEffect(() => {
    visible.value = withTiming(shown ? 1 : 0, { duration: 160, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  }, [shown, visible]);

  const style = useAnimatedStyle(() => {
    const cell = count > 0 ? rowWidth.value / count : 0;
    const still = Math.min(Math.abs(target.value - position.value), 1);
    return {
      width: Math.max(0, cell - 6),
      opacity: rowWidth.value > 0 ? visible.value : 0,
      transform: [
        { translateX: position.value * cell + 3 },
        { scaleX: 1 + still * 0.28 },
        { scaleY: 1 - still * 0.06 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bubble,
        { backgroundColor: withAlpha(colors.brand, 0.1), borderColor: "rgba(255, 255, 255, 0.95)" },
        style,
      ]}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0.75)", "rgba(255,255,255,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.7 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, styles.bubbleRim, { borderColor: withAlpha(colors.brand, 0.14) }]} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: space[2],
    paddingHorizontal: space[2],
  },
  /* The four cells, and the box the bubble is measured against and laid over. */
  row: {
    flexDirection: "row",
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    minHeight: touch.min,
    paddingVertical: space[1],
  },
  glyph: {
    width: 48,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Laid over the row's cells: same top and height, left edge at the row's,
     moved across by the worklet. */
  bubble: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: "hidden",
  },
  bubbleRim: { borderRadius: radius.pill, borderWidth: 1, margin: 1 },
});
