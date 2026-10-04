/* ══════════════════════════════════════════════════════════════════════════
   The catch-all — and the app's route directory.

   In a developer build it lists every screen with a link to it, so no screen
   can become impossible to reach whatever a guard or a bad link does. In a
   release build it does NOT: that list handed every kitchen a directory of the
   app's internals, dashboard routes included, from any mistyped link.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, EmptyState, ListGroup, ListRow, ScreenShell, ScreenTitle, Txt } from "@/components/ui";
import { STEPS } from "@/constants/partner";
import { font, size, ui } from "@/theme/ui";

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
  const insets = useSafeAreaInsets();
  return (
    <ScreenShell scroll contentStyle={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}>
      <ScreenTitle title="Screen not found" style={styles.title} />

      <EmptyState
        compact
        icon="compass-outline"
        title="Nothing here"
        subtitle={
          __DEV__
            ? "That route does not exist. Every screen in the app is listed below."
            : "That page does not exist."
        }
      />

      <Button title="Back to the start" fullWidth onPress={() => router.replace("/")} />

      {__DEV__ && (
        <ListGroup title="All screens">
          {ROUTES.map((route, index) => (
            <ListRow
              key={route.path}
              label={route.label}
              accessibilityLabel={route.label}
              onPress={() => router.push(route.path as never)}
              divider={index < ROUTES.length - 1}
              right={<Txt style={styles.path}>{route.path}</Txt>}
            />
          ))}
        </ListGroup>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16 },
  // The scroll content is already padded; the title must not add its own.
  title: { paddingHorizontal: 0 },
  path: { fontFamily: font.body.medium, fontSize: size.small, color: ui.muted },
});
