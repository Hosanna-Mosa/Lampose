import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
 * Four evenly-weighted destinations on a white bar.
 *
 * The selected tab takes a brand-tinted pill behind its glyph and green ink on
 * both glyph and label. The old bar signalled selection with ink-versus-grey
 * alone, which is a 1.6:1 difference at 21px and reads as "nothing is
 * selected" in daylight — the tint is what makes it legible on a scooter.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space[3]) + layout.bottomInsetExtra }]}
    >
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: space[2],
    paddingHorizontal: space[2],
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
});
