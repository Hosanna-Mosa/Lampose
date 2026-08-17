import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useDriverStore } from "@/store/driverStore";
import { colors } from "@/theme";

// Hold the splash until the persisted session is read back, so a signed-out
// driver never sees the tabs flash. The app uses the platform UI font, so
// there are no faces to wait on.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const hydrated = useDriverStore((s) => s.hydrated);
  const token = useDriverStore((s) => s.token);
  const signedIn = !!token;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, []);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.bg} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: "slide_from_right",
          }}
        >
          {/*
            Declaration order decides where each session state lands, because
            React Navigation falls back to the first non-guarded screen.
          */}
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
          </Stack.Protected>

          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
          </Stack.Protected>

          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="request" options={{ animation: "slide_from_bottom" }} />
            <Stack.Screen name="active" />
            <Stack.Screen name="complete" options={{ animation: "fade" }} />
            <Stack.Screen name="order-detail" />
            <Stack.Screen name="payouts" />
            <Stack.Screen name="payout-detail" />
            <Stack.Screen name="incentives" />
            <Stack.Screen name="documents" />
            <Stack.Screen name="vehicle" />
            <Stack.Screen name="profile-details" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="support" />
            <Stack.Screen name="ticket" />
            <Stack.Screen name="suspended" options={{ animation: "fade" }} />
          </Stack.Protected>

          <Stack.Screen name="+not-found" options={{ animation: "fade" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
