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
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
/* Imported for the side effect as well as the call: the module sets Expo's
   notification handler at load time, so an offer that wakes the app from cold
   is handled before any screen has mounted. */
import { ensureChannels } from "@/services/offerAlerts";
import { primeOfferSound } from "@/services/alertSound";
import { startOfferPump, useDriverStore } from "@/store/driverStore";
import { colors } from "@/theme";
import { setSessionExpiredHandler } from "@/utils/api";
import { SessionExpiredSheet } from "@/components/ui";

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
  const profile = useDriverStore((s) => s.profile);
  const suspensionNotice = useDriverStore((s) => s.suspensionNotice);
  const refreshProfile = useDriverStore((s) => s.refreshProfile);
  const fetchActiveJob = useDriverStore((s) => s.fetchActiveJob);
  const registerForOffers = useDriverStore((s) => s.registerForOffers);
  const logout = useDriverStore((s) => s.logout);

  /*
    Set the instant ANY authenticated call comes back with a dead token —
    see `SESSION_DEAD_CODES` in `utils/api.ts`. Local state rather than a
    store field: nothing about a dead session needs to survive a reload (there
    is nothing left to resume once it is cleared), and keeping it here means
    the handler registration below has an obvious, single owner.

    Deliberately NOT cleared by `logout()` itself — only by the sheet's own
    button, right after it calls `logout()`. That keeps the one rule intact:
    the ONLY thing that dismisses this dialog is the rider acknowledging it,
    never a side effect of something else changing the token.
  */
  const [sessionExpired, setSessionExpired] = useState(false);

  const signedIn = !!token;
  /*
    Four session states, not two.

    A rider can hold a valid token and still not be allowed to work — the
    account is `pending` while an administrator checks their licence, or they
    never finished the vehicle step. Sending them to the tabs would be an app
    that looks ready and never rings; sending them back to a login form would
    be worse, because signing in again fixes nothing. So the un-onboarded state
    gets its own destination.

    A suspended one gets its own too, and until now did not. `app/suspended.tsx`
    was registered and nothing on any path could reach it, so a rider whose
    account was put on hold — the server refuses EVERY driver route for them,
    `driverAuth.middleware.js` bites before approval is even considered — landed
    on the tabs and met a screen where the duty switch, the offer poll, the
    earnings read and the history all failed silently in different ways. That is
    the state in which somebody sits at a junction for an hour waiting for work
    that the server has already decided will never come. It is checked before
    onboarding, because a suspended rider who also has a half-finished profile
    has one problem and it is not the form.

    Two ways to know that they are suspended, because the profile is the weaker
    of them. A suspended rider cannot read `GET /me` at all, so
    `profile.status` only ever says "suspended" because `refreshProfile` wrote
    it there after being refused — and it can only write it onto a profile
    that is already in hand. A handset holding a token but no profile, after a
    reinstall or a cleared store, would otherwise be sent to the onboarding
    form, where every PATCH is refused 403 and nothing on screen explains any
    of it. The refusal itself does not depend on a previous read, so it is
    asked as well.
  */
  const suspended = signedIn && (profile?.status === "suspended" || !!suspensionNotice);
  const readyToWork = signedIn && !suspended;

  const [fontsLoaded, fontError] = useFonts(fonts);
  // A font that fails to download must not strand the rider on a splash
  // screen — the app degrades to the platform face and carries on.
  const typeReady = fontsLoaded || !!fontError;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
    /* Created before any permission is asked for. On Android the channel — not
       the payload — decides whether an offer makes a sound, and a channel that
       does not exist when the first notification arrives is a silent one. */
    ensureChannels().catch(() => {});
    /* Decoded at launch rather than when the first offer lands. A fifteen
       second countdown is not the moment to be reading a file off disk, and
       the very first offer is the one a rider is most likely to miss. */
    primeOfferSound().catch(() => {});
  }, []);

  useEffect(() => {
    if (hydrated && typeReady) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated, typeReady]);

  /*
    Registered once, for the life of the app, exactly like the offer pump
    below — a dead token can turn up on any screen the rider happens to be on
    (mid-delivery, editing a profile field, wherever), so the hook that hears
    about it cannot be scoped to one screen either. The handler only flips a
    flag; it deliberately does NOT call `logout()` itself, so the token stays
    in place — and whatever the rider was looking at stays on screen behind
    the dialog — until they tap its one button.
  */
  useEffect(() => {
    setSessionExpiredHandler(() => setSessionExpired(true));
    return () => setSessionExpiredHandler(null);
  }, []);

  /*
    The offer pump: the socket listeners plus the poll fallback.

    Started once, here, for the life of the app rather than per screen. An
    offer must be able to arrive while the rider is looking at their earnings,
    and a listener mounted on the home screen would only work while that screen
    was the one on top.
  */
  useEffect(() => {
    if (!signedIn) return;
    const stop = startOfferPump();
    return stop;
  }, [signedIn]);

  /*
    Re-read the account on every cold start.

    The token is persisted, so a rider opens the app already signed in — but
    approval, suspension and the duty flag all changed on the server while the
    app was closed, and the persisted copy is only ever a guess about them. The
    active job is fetched with it so a rider who was killed mid-delivery lands
    back on the doorstep rather than on an empty home screen.
  */
  useEffect(() => {
    if (!hydrated || !signedIn) return;
    refreshProfile().then((alive) => {
      if (!alive) return;
      fetchActiveJob().catch(() => {});
      /* Re-registered on every cold start, not once at sign-up. A push token
         is reissued on reinstall and can be revoked at any time, and a rider
         whose offers quietly went silent has no way to work out why. */
      registerForOffers().catch(() => {});
    });
  }, [hydrated, signedIn, refreshProfile, fetchActiveJob, registerForOffers]);

  /*
    The sheet's one button. Clears the flag AFTER `logout()` rather than
    before — `logout()` itself is synchronous up to its `set({ token: null,
    ... })` (nothing before that line is awaited), so by the time this
    function returns the store has already flipped `signedIn` to false and
    `Stack.Protected guard={!signedIn}` has already picked the auth screen.
    No `router.replace` needed on top of that.
  */
  const handleSessionExpiredLogout = () => {
    logout();
    setSessionExpired(false);
  };

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
          {/* First, so it wins the fallback for a rider who is both suspended
              and un-onboarded. `support` below is still registered and still
              reachable from it — the one route the server lets a suspended
              account through. */}
          <Stack.Protected guard={suspended}>
            <Stack.Screen name="suspended" options={{ animation: "fade" }} />
          </Stack.Protected>

          <Stack.Protected guard={readyToWork}>
            <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
          </Stack.Protected>

          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="auth" options={{ animation: "fade" }} />
          </Stack.Protected>

          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
            <Stack.Screen name="request" options={{ animation: "slide_from_bottom" }} />
            <Stack.Screen name="active" />
            <Stack.Screen name="complete" options={{ animation: "fade" }} />
            <Stack.Screen name="order-detail" />
            <Stack.Screen name="documents" />
            <Stack.Screen name="vehicle" />
            <Stack.Screen name="profile-details" />
            <Stack.Screen name="bank-details" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="support" />
            <Stack.Screen name="support-new" />
            <Stack.Screen name="ticket" />
            {/* `payouts`, `payout-detail`, `incentives` and `notifications`
                stood here. All four screens have been deleted along with the
                invented content that was their only reason to exist — a payout
                ledger, a withdrawal, four bonus schemes and seven alerts, none
                of which any endpoint in this product can produce. A route
                registered against a file that is not there is a crash waiting
                for the one rider who deep-links into it.

                `bank-details` above is the one thing `payouts` did that was
                real, given its own file: `PATCH /me` accepts a `payout` object
                and always has, so editing where the money goes is a working
                feature with an endpoint behind it. Deleting the screen took it
                away from every rider who changes bank after sign-up, which is
                a worse fault than the invented ledger it was deleted with. */}
          </Stack.Protected>

          <Stack.Screen name="+not-found" options={{ animation: "fade" }} />
        </Stack>

        {/*
          Always mounted, as a sibling of the Stack rather than a route — the
          whole point is that it can appear over whatever screen the rider is
          on (mid-delivery, filling a form) without a navigation happening
          first. `visible` is the only thing that changes; the Modal it
          renders portals above everything else regardless of where it sits
          in this tree.
        */}
        <SessionExpiredSheet visible={sessionExpired} onLogout={handleSessionExpiredLogout} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
