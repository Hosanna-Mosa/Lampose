/* ══════════════════════════════════════════════════════════════════════════
   The catch-all — and the app's route directory.

   It lists every screen with a link to it. That is deliberate rather than
   decorative: it means no screen in this app can become impossible to reach,
   whatever a guard or a bad link does. It is a development aid and it says so.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Btn, Card, Icon, Text, TopBar } from "@/components/ui";
import { STEPS } from "@/constants/partner";
import { colors, layout, radius, space, touch } from "@/theme";

const ROUTES: { label: string; path: string }[] = [
  { label: "Pitch", path: "/" },
  { label: "Sign in", path: "/signin" },
  ...STEPS.map((s) => ({ label: `Step ${s.num} — ${s.label}`, path: s.route })),
  { label: "Submitted", path: "/submitted" },
  { label: "Application status", path: "/status" },
  { label: "Dashboard — Home", path: "/(dash)" },
  { label: "Dashboard — Menu", path: "/(dash)/menu" },
  { label: "Dashboard — Orders", path: "/(dash)/orders" },
  { label: "Dashboard — Profile", path: "/(dash)/profile" },
  { label: "Add a dish", path: "/product/new" },
];

export default function NotFound() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar back={null} title="Screen not found" />

      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="body" color="secondary">
          That route does not exist. Every screen in the app is listed below.
        </Text>

        <Btn label="Back to the start" onPress={() => router.replace("/")} />

        <Card style={{ gap: space[1] }}>
          <Text variant="eyebrow" color="tertiary">
            All screens
          </Text>
          {ROUTES.map((route) => (
            <Pressable
              key={route.path}
              accessibilityRole="link"
              accessibilityLabel={route.label}
              onPress={() => router.push(route.path as never)}
              style={styles.row}
            >
              <Text variant="body" style={{ flex: 1 }}>
                {route.label}
              </Text>
              <Text variant="numMeta" color="tertiary">
                {route.path}
              </Text>
              <Icon name="chevronRight" size={15} color={colors.textTertiary} />
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: layout.gutter, gap: space[4] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    minHeight: touch.min,
    borderRadius: radius.chip,
  },
});
