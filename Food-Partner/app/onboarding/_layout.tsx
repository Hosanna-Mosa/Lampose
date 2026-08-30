import { Stack } from "expo-router";
import React from "react";

import { colors } from "@/theme";

/** The five steps, in order. Each screen owns its own header via StepScaffold. */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="restaurant" />
      <Stack.Screen name="operations" />
      <Stack.Screen name="menu" />
      <Stack.Screen name="documents" />
      <Stack.Screen name="contract" />
    </Stack>
  );
}
