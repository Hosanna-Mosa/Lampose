import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/ui";
import { colors, font, ms, space } from "@/theme";

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Home", icon: "home" },
  { name: "orders", label: "Orders", icon: "orders" },
  { name: "earnings", label: "Earnings", icon: "earnings" },
  { name: "profile", label: "Profile", icon: "profile" },
];

/**
 * Four evenly-weighted destinations on a hairline. No pill, no fill — the
 * active tab is signalled by ink versus grey alone.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, ms(12)) }]}>
      {TABS.map((tab, index) => {
        const focused = state.index === index;
        const tone = focused ? colors.ink : colors.neutral500;

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
            <Icon name={tab.icon} size={ms(21)} color={tone} strokeWidth={1.5} />
            <Text style={[styles.label, { color: tone }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
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
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.bg,
    paddingTop: ms(8),
    paddingHorizontal: ms(6),
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: ms(5),
    paddingVertical: ms(7),
  },
  label: {
    ...font.bodyBold,
    fontSize: ms(10),
    letterSpacing: ms(10) * 0.1,
    textTransform: "uppercase",
  },
});
