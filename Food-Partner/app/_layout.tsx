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
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ensureOrderChannel, getPushToken } from "@/services/orderAlerts";
import { primeOrderSound } from "@/services/alertSound";
import { setAccountRejectedHandler } from "@/services/api";
import { registerDevice } from "@/services/foodPartner";
import { isSheetOpen, onNewOrder, onSessionExpired, startOrderPump } from "@/services/orderPump";
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
  const sessionToken = usePartnerStore((s) => s.session?.token ?? null);
  const signOut = usePartnerStore((s) => s.signOut);
  const setStatus = usePartnerStore((s) => s.setStatus);
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
    /* Decoded at launch, not when the first order lands: reading the file off
       disk at the moment a ticket arrives is the chime playing after somebody
       has already walked away from the counter. */
    void primeOrderSound();
  }, []);

  useEffect(() => {
    if (hydrated && typeReady) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated, typeReady]);

  /*
    A rejected restaurant, said out loud.

    `requireFoodPartner` refuses EVERY route behind a session with 403
    ACCOUNT_REJECTED the moment `verificationStatus` flips — not just `/me` —
    so any screen under `(dash)` can hit this the moment an administrator
    rejects an application the app still thinks is pending or approved.
    Reported once, centrally, by `services/api.ts`, exactly the way the User
    App's `client.ts` reports a dead session: no screen has to recognise the
    code for itself, and none of them did before this, which is why a
    rejected partner used to land on an otherwise-empty dashboard with a
    generic error banner instead of `/status`, the screen built to explain it.

    Registered unconditionally, not gated on `hydrated`/`sessionToken`: the
    very first `/me` call after a cold start with a stale "approved" cache is
    exactly the call this exists to catch.
  */
  useEffect(() => {
    setAccountRejectedHandler((verificationNote) => {
      setStatus("rejected", verificationNote);
      router.replace("/status");
    });
    return () => setAccountRejectedHandler(null);
  }, [setStatus]);

  /*
    The order pump: the socket listener plus the poll fallback.

    Started HERE, for the life of the app, rather than on the Orders screen —
    which is where all three alert paths used to live. React Navigation mounts
    a tab lazily, so a kitchen that opened the app onto Home and left it there
    had no socket, no poll and no sound at all. A tablet face-up on a counter
    is the case this feature exists for, and it was the case it missed.

    The same arrangement as the Driver app's `startOfferPump`, for the same
    reason: an order must be able to arrive while somebody is looking at the
    menu.
  */
  useEffect(() => {
    if (!hydrated || !sessionToken) return;
    return startOrderPump(sessionToken);
  }, [hydrated, sessionToken]);

  /*
    This tablet, so the kitchen can be rung when the app is not in front.

    Registered HERE, beside the pump, and moved for exactly the reason the pump
    was: it used to be an effect on the Orders screen, and React Navigation does
    not mount a tab until somebody taps it. A kitchen that opened the app onto
    Home — or a signed-in partner left on the landing screen, which does not
    redirect anybody into the dashboard — had never registered a device token,
    so the one alert that works with the app closed was the one they never got.
    The Driver app registers from its root layout for the same reason.

    Run on every cold start rather than only at sign-in, because the OS can
    reissue a push token at any time and the server upserts by token. A handset
    that cannot register still sees orders — the socket and the poll both stand
    — so none of this is worth an error in front of a cook.
  */
  useEffect(() => {
    if (!hydrated || !sessionToken) return;
    let cancelled = false;
    (async () => {
      const registration = await getPushToken();
      if (cancelled || !registration) return;
      try {
        await registerDevice(registration.token, registration.platform, sessionToken);
      } catch {
        /* A refused permission, a simulator, a flaky network. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, sessionToken]);

  /*
    A session that has run out, said out loud.

    A partner token lasts a week and then stops working, and both of the pump's
    transports fail silently at that point — the realtime server hangs the
    socket up itself, which socket.io does not reconnect from, and the poll
    starts getting a 401. The tablet kept showing the last queue it had loaded
    and never rang again, which reads as "no orders today".

    So the pump reports it and this signs out, which is what actually happened,
    and lands on the screen that can fix it. Everything the kitchen had is
    still on the server; the menu is untouched.
  */
  useEffect(() => {
    if (!hydrated || !sessionToken) return;
    return onSessionExpired(() => {
      signOut();
      router.replace("/signin");
    });
  }, [hydrated, sessionToken, signOut]);

  /*
    An order arriving slides the ticket up, from wherever the kitchen is.

    The same decision the Driver app makes for an offer: a badge is not enough
    when somebody is across the room, and the alert has already made a noise —
    this is what it made a noise ABOUT.

    Guarded so a second order landing while the sheet is open refreshes it
    rather than stacking another copy: `new-order` subscribes to the pump
    itself and reloads. Without the guard, three orders in a minute would be
    three sheets to dismiss.
  */
  useEffect(() => {
    if (!hydrated || !sessionToken) return;
    return onNewOrder(() => {
      if (isSheetOpen()) return;
      router.push("/new-order");
    });
  }, [hydrated, sessionToken]);

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
          {/* Named by its FOLDER, unlike `product` below: `app/support/` has its
              own _layout, so the three screens under it are one route here. */}
          <Stack.Screen name="support" />
          <Stack.Screen name="payouts" />
          {/* Named by its FILE, not its folder: `app/product/` has no _layout, so
              expo-router flattens it and the child route is `product/[id]`.
              Declaring "product" warns that no such route exists. */}
          {/* The new-order sheet. `slide_from_bottom` rather than a sheet
              library: it reads as a sheet, keeps the back gesture, and adds no
              dependency — the same choice the Driver app made for `request`. */}
          <Stack.Screen name="new-order" options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen name="product/[id]" options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen name="+not-found" options={{ animation: "fade" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
