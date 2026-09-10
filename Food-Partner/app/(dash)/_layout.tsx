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

import { Icon, Text, type IconName } from "@/components/common";
import { colors, layout, radius, space, touch } from "@/theme";
import { TabBar } from "@/components/dash/organisms/TabBar";
import { TABS } from "@/components/dash/utils/shared";


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
});
