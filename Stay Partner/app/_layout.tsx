import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AlertProvider } from '@/components/common/organisms/AlertProvider';
import { SplashView } from '@/components/SplashView';
import colors from '@/constants/colors';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { IncomingRequestAlert } from '@/components/IncomingRequestAlert';
import { usePushRouting } from '@/services/push/usePushRouting';
import { setupQueryFocus } from '@/services/queryFocus';

// Hold the native splash until the fonts resolve, so the branded splash below
// never renders in a fallback face.
SplashScreen.preventAutoHideAsync();

/**
 * How long the branded splash stays up once fonts are ready. Without a floor it
 * flashes for a frame or two on a warm start, which reads as a glitch.
 */
const MIN_SPLASH_MS = 1100;

const queryClient = new QueryClient();

/*
 * Wired at module scope, before the first render.
 *
 * `refetchOnWindowFocus` is set on every query in this app and did nothing:
 * react-query reads `document.visibilityState`, which does not exist on a
 * phone. See `services/queryFocus.ts` — without it the only thing that
 * refetched was a screen mounting, so a new request appeared when the owner
 * changed tabs and not when it arrived.
 */
setupQueryFocus();

/**
 * The gate.
 *
 * Three destinations, decided by the session rather than by whichever screen
 * happened to call `router.replace` last:
 *
 *   signedOut                    the login screen
 *   signedIn, no name yet        profile setup
 *   signedIn, profile complete   the app
 *
 * `status === 'loading'` holds the splash rather than rendering a guess. The
 * token is read off disk and checked against `/me` in that window, and flashing
 * the login screen to somebody who turns out to be signed in is the specific
 * thing this avoids.
 *
 * Redirecting here rather than from inside each screen means the answer is in
 * one place. A screen that decides its own routing is a screen that can
 * disagree with another one, and the failure mode is a loop between two of
 * them.
 */
function RootLayoutNav() {
  const { status, profileComplete } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  /*
   * ## There is no payout gate here any more
   *
   * A hotel owner used to be redirected to a bank-details form the moment they
   * signed in, before they could reach their own dashboard. It was the wrong
   * place to ask twice over: an owner opening the app at 8am has a guest
   * arriving, not a form to fill, and somebody who had been running fine for
   * months was suddenly locked out of bookings they needed to manage over a
   * detail that blocks nothing until they ask to be paid.
   *
   * Bank details are asked for at the ONE moment they are actually needed —
   * pressing "Request payout" — where the question explains itself because the
   * owner has just asked for money. `app/earnings/index.tsx` catches the
   * server's `NO_PAYMENT_METHOD` and offers to take them to the form.
   *
   * The server is unchanged and still refuses to create a payout without an
   * account, so nothing here is load-bearing: this was a prompt, not a
   * safeguard, and removing it cannot let an unpayable payout through.
   */

  const inAuthFlow = segments[0] === '(auth)';
  /* `useSegments()` is typed as a 1-tuple, but a nested route genuinely has a
     second segment at runtime — `(auth)/profile-setup` is two. Widened rather
     than indexed past the declared length, which TypeScript rejects outright. */
  const onProfileSetup = (segments as readonly string[])[1] === 'profile-setup';
  const onPayoutSetup = (segments as readonly string[])[1] === 'payout-setup';

  /*
   * One navigator, always mounted, and the gate redirects inside it.
   *
   * The first version of this returned a DIFFERENT `<Stack>` per auth state.
   * That is the mistake worth recording: expo-router builds its route table
   * from the files on disk, not from what a component happens to render, so
   * swapping navigators tears the whole tree down and rebuilds it on every
   * sign-in — losing history, remounting providers, and firing navigation
   * against a tree that is halfway through mounting.
   *
   * Rendering the same Stack every time and moving WITHIN it is what expo-router
   * is built for. The redirect lives in an effect rather than in render because
   * navigating during a render is the other half of the same bug.
   */
  useEffect(() => {
    /* Nothing is known yet — the token is still being checked against `/me`.
       Redirecting on a guess is what would flash the login screen at somebody
       who turns out to be signed in. */
    if (status === 'loading') return;

    /* The root navigator has not mounted, so there is nowhere to navigate to
       yet. Navigating before it exists is a no-op at best and a warning about
       navigating during mount at worst. */
    if (!navigationState?.key) return;

    if (status === 'signedOut') {
      if (!inAuthFlow) router.replace('/login');
      return;
    }

    /* Signed in but never gave a name. Profile setup is the one screen they
       may see — and note this is NOT a session state: they are fully signed
       in, they just have not finished setting up. Modelling it as a session
       state would mean signing somebody out to ask their name. */
    if (!profileComplete) {
      if (!onProfileSetup) router.replace('/profile-setup');
      return;
    }

    /*
     * Signed in and set up. Nothing in the auth flow is theirs any more, so a
     * stale history entry pointing at it goes to the dashboard.
     *
     * `payout-setup` is exempt: it still exists and is still reachable, but as
     * a screen an owner CHOSE to open rather than one they were sent to.
     * Redirecting away from it would bounce anybody who navigated there
     * deliberately straight back out.
     */
    if (inAuthFlow && !onPayoutSetup) router.replace('/');
  }, [status, profileComplete, inAuthFlow, onProfileSetup, onPayoutSetup,
    navigationState?.key, router]);

  /* Mounted before the splash short-circuit, because a hook cannot live
     behind a conditional return — and because the cold-start tap has already
     happened by the time this renders at all. */
  usePushRouting();

  /* Held on the splash until the session is known, so the effect above has a
     real answer to act on by the time anything is painted. */
  if (status === 'loading') return <SplashView />;

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          /* The navigator's own scene container sits behind every screen and
             otherwise defaults to white — visible as a flash during a stack
             transition, and, on a screen that does not paint its own full
             background, wherever content does not fully cover it. Fixed to
             the app's own ground colour rather than left to that default,
             the same way the User App's root Stack already is. */
          contentStyle: { backgroundColor: colors.light.bg },
        }}
      >
        {/* Both groups are declared, and both exist as routes: each has a
            `_layout.tsx`. Naming a group without one is what produced
            "No route named "(auth)" exists in nested children" — expo-router
            flattens a group with no layout into `(auth)/login` and friends, so
            there is no `(auth)` to name. */}
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>

      {/*
        A request arriving, rung and popped up wherever the owner is.

        A native `Modal` inside this component, not a route and not an
        absolutely-positioned overlay: the navigator draws through
        `react-native-screens`, and a native screen can paint over a JS sibling
        whatever the tree order says. A `Modal` gets its own OS window above
        all of it. Position in this tree therefore does not matter — what
        matters is that it is mounted exactly once, and this is the only place
        that is true.

        A route would be wrong for a different reason: a request can land while
        somebody is halfway through a form, and pushing a screen at them would
        put it in their history and take their back button away.

        Below `usePushRouting`, which owns the other half: the phone that was
        asleep.
      */}
      <IncomingRequestAlert />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    JetBrainsMono_500Medium,
  });

  const [booted, setBooted] = useState(false);
  const fontsSettled = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (!fontsSettled) return;
    // Already-hidden throws on some platforms; the app is fine either way.
    SplashScreen.hideAsync().catch(() => {});
    const timer = setTimeout(() => setBooted(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [fontsSettled]);

  // Native splash (solid accent, from app.json) covers this frame.
  if (!fontsSettled) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          {/* Inside the QueryClientProvider: signing out clears the cache, so
              the session needs a client to clear. Outside the navigator, so
              the gate can read the session. */}
          <AuthProvider>
            <GestureHandlerRootView style={styles.flex}>
              <KeyboardProvider>
                {/*
                  The app's own alert, in place of the platform one.

                  Inside `GestureHandlerRootView` so the card's buttons receive
                  touches, and wrapping the navigator so every screen can call
                  `useAlert()`. It wraps the splash too, which costs nothing and
                  means a failure during boot has somewhere to be shown.

                  See `components/ui/AppAlert.tsx` for why `Alert.alert` is not
                  used anywhere in this app.
                */}
                <AlertProvider>
                  {booted ? (
                    <>
                      <StatusBar style="dark" />
                      <RootLayoutNav />
                    </>
                  ) : (
                    <SplashView />
                  )}
                </AlertProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
