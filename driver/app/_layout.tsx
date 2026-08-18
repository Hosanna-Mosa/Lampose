import { Archivo_400Regular } from "@expo-google-fonts/archivo/400Regular";
import { Archivo_500Medium } from "@expo-google-fonts/archivo/500Medium";
import { Archivo_600SemiBold } from "@expo-google-fonts/archivo/600SemiBold";
import { Archivo_700Bold } from "@expo-google-fonts/archivo/700Bold";
import { InstrumentSans_400Regular } from "@expo-google-fonts/instrument-sans/400Regular";
import { InstrumentSans_500Medium } from "@expo-google-fonts/instrument-sans/500Medium";
import { InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans/600SemiBold";
import { InstrumentSans_700Bold } from "@expo-google-fonts/instrument-sans/700Bold";
import { MartianMono_400Regular } from "@expo-google-fonts/martian-mono/400Regular";
import { MartianMono_500Medium } from "@expo-google-fonts/martian-mono/500Medium";
import { MartianMono_600SemiBold } from "@expo-google-fonts/martian-mono/600SemiBold";
import { MartianMono_700Bold } from "@expo-google-fonts/martian-mono/700Bold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useDriverStore } from "@/store/driverStore";
import { colors } from "@/theme";

/**
 * The three faces the type scale names.
 *
 * Archivo carries headings, Instrument Sans carries reading text, and Martian
 * Mono carries every figure — money, distance, ETA, order id, hand-off code.
 * React Native cannot synthesise a weight from one family, so each weight is
 * registered separately; `resolveFontFamily` in the theme is the only place
 * allowed to map a (face, weight) pair onto one of these names.
 *
 * Imported by per-weight subpath, NOT from the package root. Each package's
 * barrel `require()`s every weight it ships — 18 files for Archivo alone,
 * italics included — so importing four names from it still bundles all
 * thirty-four .ttf files across the three families. The subpaths pull in
 * exactly the twelve faces the type scale names.
 */
const fonts = {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
  MartianMono_400Regular,
  MartianMono_500Medium,
  MartianMono_600SemiBold,
  MartianMono_700Bold,
};

// Hold the splash until the persisted session is read back AND the faces are
// resolved, so a signed-out rider never sees the tabs flash and nobody sees a
// frame of the platform fallback font before Archivo lands.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const hydrated = useDriverStore((s) => s.hydrated);
  const token = useDriverStore((s) => s.token);
  const signedIn = !!token;

  const [fontsLoaded, fontError] = useFonts(fonts);
  // A font that fails to download must not strand the rider on a splash
  // screen — the app degrades to the platform face and carries on.
  const typeReady = fontsLoaded || !!fontError;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, []);

  useEffect(() => {
    if (hydrated && typeReady) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated, typeReady]);

  if (!typeReady) return null;

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
