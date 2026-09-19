import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Text } from "@/components/common";
import { colors, layout, radius, space, touch } from "@/theme";
import { TABS } from "@/components/dash/utils/shared";

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space[2]) }]}>
      {TABS.map((tab, index) => {
        const focused = state.index === index;
        const ink = focused ? "#FF5200" : "#6B7280";
        const hasBadge = tab.name === "orders";
        const badgeCount = 0;

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
            <View style={[styles.glyphContainer]}>
              <View style={[styles.glyph]}>
                <Icon name={tab.icon} size={22} color={ink} strokeWidth={focused ? 2.3 : 1.75} />
              </View>
              {hasBadge && badgeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color: ink, fontWeight: focused ? "800" : "500" }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 2,
  },
  glyphContainer: {
    position: "relative",
  },
  glyph: {
    width: 48,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: 2,
    backgroundColor: "#EF4444",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  label: {
    fontSize: 12,
  },
});
