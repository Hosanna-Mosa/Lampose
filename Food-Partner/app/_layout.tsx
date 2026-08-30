/* ══════════════════════════════════════════════════════════════════════════
   The root layout: fonts, splash, and the stack.

   NO ROUTE IS GUARDED HERE, and that is deliberate. An application that has
   been submitted has a natural home — the status screen — but locking the
   other screens behind a guard is how a screen becomes unreachable, and the
   whole flow has to stay walkable end to end. `index` decides where to send
   somebody instead, which is a redirect they can navigate back out of rather
   than a wall.
   ══════════════════════════════════════════════════════════════════════════ */
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

import { ensureOrderChannel } from "@/services/orderAlerts";
import { usePartnerStore } from "@/store/partnerStore";
import { colors } from "@/theme";

/**
 * The three faces the type scale names.
 *
 * Imported by per-weight SUBPATH, never from the package root. Each package's
 * barrel `require()`s every weight it ships — italics included — so importing
 * four names from it still bundles all thirty-four .ttf files across the three
 * families. The subpaths pull in exactly the twelve the scale uses.
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

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const hydrated = usePartnerStore((s) => s.hydrated);
  const [fontsLoaded, fontError] = useFonts(fonts);

  /* A font that fails to resolve must not strand a partner on a splash
     screen — the app degrades to the platform face and carries on. */
  const typeReady = fontsLoaded || !!fontError;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
    /* Created before any order can arrive. On Android the channel — not the
       payload — decides whether the alert is audible, so a notification that
       lands before this runs is a silent one. */
    void ensureOrderChannel();
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
          <Stack.Screen name="index" options={{ animation: "fade" }} />
          <Stack.Screen name="signin" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="submitted" options={{ animation: "fade" }} />
          <Stack.Screen name="status" options={{ animation: "fade" }} />
          <Stack.Screen name="(dash)" options={{ animation: "fade" }} />
          {/* Named by its FILE, not its folder: `app/product/` has no _layout, so
              expo-router flattens it and the child route is `product/[id]`.
              Declaring "product" warns that no such route exists. */}
          <Stack.Screen name="product/[id]" options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen name="+not-found" options={{ animation: "fade" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
