import { Stack } from "expo-router";
import React from "react";

import { colors } from "@/theme";

/**
 * The three support screens, in the ROOT stack rather than the dashboard tabs.
 *
 * A file dropped into `app/(dash)/` becomes a fifth TAB: the tab bar maps a
 * hardcoded four-item array and highlights by index, so a fifth route renders
 * with the bar pinned over it, nothing selected and no way back. Support is a
 * place you go and come back from, which is a push.
 *
 * The `_layout` is what makes this folder a route named `support` — without it
 * expo-router flattens the directory and the routes are `support/index`,
 * `support/new` and `support/[reference]` individually, exactly as
 * `app/product/` is `product/[id]`.
 */
export default function SupportLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[reference]" />
    </Stack>
  );
}
