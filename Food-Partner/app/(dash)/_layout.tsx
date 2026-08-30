/* ══════════════════════════════════════════════════════════════════════════
   The signed-in restaurant: four tabs.

   Ported from the driver app's tab bar. The selected tab takes a brand-tinted
   pill behind its glyph with brand ink on both glyph and label — ink-versus-
   grey alone is about a 1.6:1 difference and reads as "nothing is selected" in
   daylight, which is the condition a kitchen actually uses this in.
   ══════════════════════════════════════════════════════════════════════════ */
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, Text, type IconName } from "@/components/ui";
import { colors, layout, radius, space, touch } from "@/theme";

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Home", icon: "home" },
  { name: "menu", label: "Menu", icon: "menu" },
  { name: "orders", label: "Orders", icon: "doc" },
  { name: "profile", label: "Profile", icon: "profile" },
];

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space[3]) + layout.bottomInsetExtra }]}>
      {TABS.map((tab, index) => {
        const focused = state.index === index;
        const ink = focused ? colors.brandInk : colors.textTertiary;

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
            <View style={[styles.glyph, focused && { backgroundColor: colors.brandTint }]}>
              <Icon name={tab.icon} size={20} color={ink} />
            </View>
            <Text variant="numMeta" style={{ color: ink }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function DashLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: space[2],
    paddingHorizontal: space[2],
  },
  item: { flex: 1, alignItems: "center", gap: 3, minHeight: touch.min, paddingVertical: space[1] },
  glyph: {
    width: 48,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
