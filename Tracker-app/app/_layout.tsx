import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Box, Btn, Text } from "@/components/common";
import { useAuthStore } from "@/store/authStore";
import { colors, layout, radius, space } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const signedIn = useAuthStore((s) => !!s.session?.token);
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const acknowledgeSessionExpired = useAuthStore((s) => s.acknowledgeSessionExpired);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, []);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  /*
   * Deliberately NOT `if (!hydrated) return null;`. Expo Router expects this
   * component to render a navigator on its very first pass; the native
   * splash screen (kept up by `preventAutoHideAsync` above, hidden once
   * `hydrated` is true) covers the loading window instead, so the `<Stack>`
   * below always exists from the first render onward.
   *
   * `hydrated` is not part of `signedIn` on purpose: before rehydration
   * completes, `session` reads null either way, so the guards below already
   * default to the signed-out group without needing to wait for it.
   */

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          {/*
            `Stack.Protected` guards, not a `router.replace` in a screen's
            own `useEffect` — that imperative call is what threw "Attempted
            to navigate before mounting the Root Layout component" in the
            first place. `useRootNavigationState()` looked like the fix (it
            is the hook Expo Router itself exports for "is the navigator
            ready"), but it reflects the navigator's own reducer STATE,
            which can already look populated on the very same render the
            Stack first mounts — a different, earlier signal than
            `navigationRef.isReady()`, which is what the thrown error
            actually checks (see `assertIsReady` in expo-router's own
            `global-state/routing.js`) and only becomes true slightly later.
            A declarative guard sidesteps the whole race: Expo Router
            resolves which group is active as part of its own rendering,
            never as a side effect racing that rendering. This is the same
            pattern `driver/app/_layout.tsx` already uses for its own
            signed-in/signed-out split, and for the same reason.
          */}
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="index" options={{ animation: "fade" }} />
          </Stack.Protected>

          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="home" options={{ animation: "fade" }} />
            <Stack.Screen name="logout" options={{ animation: "slide_from_bottom" }} />
          </Stack.Protected>

          <Stack.Screen name="+not-found" options={{ animation: "fade" }} />
        </Stack>

        {/*
          The server has stopped accepting this token, but nothing is
          cleared yet — the same rule every other Lampose app in this
          monorepo follows: a session never ends silently. `acknowledgeSessionExpired`
          below is what actually signs out, once the rep taps the one button
          on offer; `home.tsx`'s own guard sends them to the sign-in screen
          the moment `session` goes null.
        */}
        {sessionExpired && (
          <Box style={styles.overlay}>
            <Box style={styles.card}>
              <Text variant="title">Session expired</Text>
              <Text variant="body" color="secondary" style={{ textAlign: "center" }}>
                Please log out and sign in again.
              </Text>
              <Btn label="Logout" onPress={acknowledgeSessionExpired} style={{ width: "100%" }} />
            </Box>
          </Box>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: layout.gutter,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space[5],
    gap: space[3],
    alignItems: "center",
  },
});
