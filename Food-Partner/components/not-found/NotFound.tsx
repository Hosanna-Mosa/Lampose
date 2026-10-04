/* ══════════════════════════════════════════════════════════════════════════
   The catch-all — and the app's route directory.

   In a developer build it lists every screen with a link to it, so no screen
   can become impossible to reach whatever a guard or a bad link does. In a
   release build it does NOT: that list handed every kitchen a directory of the
   app's internals, dashboard routes included, from any mistyped link.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React from "react";
import {
  StyleSheet,
} from "react-native";

import { Box, Btn, Card, Icon, Scroller, Tappable, Text, TopBar } from "@/components/common";
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

export function NotFound() {
  return (
    <Box style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar back={null} title="Screen not found" />

      <Scroller contentContainerStyle={styles.body}>
        <Text variant="body" color="secondary">
          {__DEV__
            ? "That route does not exist. Every screen in the app is listed below."
            : "That page does not exist."}
        </Text>

        <Btn label="Back to the start" onPress={() => router.replace("/")} />

        {__DEV__ && (
        <Card style={{ gap: space[1] }}>
          <Text variant="eyebrow" color="tertiary">
            All screens
          </Text>
          {ROUTES.map((route) => (
            <Tappable
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
            </Tappable>
          ))}
        </Card>
        )}
      </Scroller>
    </Box>
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
