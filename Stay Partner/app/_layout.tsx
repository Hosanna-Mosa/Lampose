import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SplashView } from '@/components/SplashView';
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
import { usePushRouting } from '@/services/push/usePushRouting';

// Hold the native splash until the fonts resolve, so the branded splash below
// never renders in a fallback face.
SplashScreen.preventAutoHideAsync();

/**
 * How long the branded splash stays up once fonts are ready. Without a floor it
 * flashes for a frame or two on a warm start, which reads as a glitch.
 */
const MIN_SPLASH_MS = 1100;

const queryClient = new QueryClient();

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

  const inAuthFlow = segments[0] === '(auth)';
  const onProfileSetup = segments[1] === 'profile-setup';

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

    /* Signed in and set up. Nothing in the auth flow is theirs any more, so a
       stale history entry pointing at it goes to the dashboard. */
    if (inAuthFlow) router.replace('/');
  }, [status, profileComplete, inAuthFlow, onProfileSetup, navigationState?.key, router]);

  /* Mounted before the splash short-circuit, because a hook cannot live
     behind a conditional return — and because the cold-start tap has already
     happened by the time this renders at all. */
  usePushRouting();

  /* Held on the splash until the session is known, so the effect above has a
     real answer to act on by the time anything is painted. */
  if (status === 'loading') return <SplashView />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Both groups are declared, and both exist as routes: each has a
          `_layout.tsx`. Naming a group without one is what produced
          "No route named "(auth)" exists in nested children" — expo-router
          flattens a group with no layout into `(auth)/login` and friends, so
          there is no `(auth)` to name. */}
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
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
                {booted ? (
                  <>
                    <StatusBar style="dark" />
                    <RootLayoutNav />
                  </>
                ) : (
                  <SplashView />
                )}
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
