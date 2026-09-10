import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Text, type IconName } from "@/components/common";
import { colors, layout, radius, space, touch } from "@/theme";
import { TABS } from "@/components/dash/utils/shared";

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: space[2],
    paddingHorizontal: space[2],
  },
  glyph: {
    width: 48,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  item: { flex: 1, alignItems: "center", gap: 3, minHeight: touch.min, paddingVertical: space[1] },
});

export function TabBar({ state, navigation }: BottomTabBarProps) {
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
