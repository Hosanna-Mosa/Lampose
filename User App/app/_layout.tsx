import React, { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WaitingPill } from '@/components/shell';
import { AppStateProvider } from '@/context/AppStateContext';
import { AuthProvider } from '@/context/AuthContext';
import { PendingRequestProvider } from '@/context/PendingRequestContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from '@expo-google-fonts/archivo';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import {
  MartianMono_400Regular,
  MartianMono_500Medium,
  MartianMono_600SemiBold,
  MartianMono_700Bold,
} from '@expo-google-fonts/martian-mono';
import { useFonts } from 'expo-font';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { usePushRouting } from '@/services/push/usePushRouting';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/**
 * Teach React Query what "focused" means on a phone.
 *
 * Its default notion of focus is a browser's `window.focus` event, which
 * never fires here — so `refetchOnWindowFocus` is silently dead on native
 * unless this is wired up. That is not a nicety on this app: the screen
 * waiting for an owner's reply is exactly the screen a student backgrounds,
 * and coming back to a rent and a status frozen at whatever they were twenty
 * minutes ago is the one moment stale data actually costs something.
 *
 * Registered at module scope so it is installed once per app launch rather
 * than per mount of the root component.
 */
AppState.addEventListener('change', (status: AppStateStatus) => {
  focusManager.setFocused(status === 'active');
});

/**
 * Three faces, each with a job.
 *
 * Archivo carries headings, Instrument Sans carries reading text, and Martian
 * Mono carries every number — rent, deposit, timers, distances, booking ids
 * and verification codes. React Native cannot synthesise weights, so each
 * weight is registered as its own family; `constants/tokens.ts` maps them.
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

/**
 * Every screen draws its own header — `StandardHeader`, `ExploreHeader`,
 * `PhotoHeader` — so the navigator never draws one. A native header would sit
 * above the app's own chrome and give two competing back affordances.
 */
function RootLayoutNav() {
  const { colors } = useTheme();

  /* Mounted here rather than per-screen: a notification can arrive on any
     screen, and the cold-start case has no screen at all yet. Inside the
     QueryClientProvider, because tapping one refreshes the request it is
     about. */
  usePushRouting();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        /*
         * The white flash between screens.
         *
         * Every screen paints `colors.bg` on its own root view, but the
         * navigator's scene container sits BEHIND them and defaulted to white.
         * During the frames where one screen has unmounted and the next has not
         * yet drawn, that container is what you see — a white blink on every
         * transition, and very obvious in dark mode.
         *
         * The flow makes it worse than usual: each gate routes back through `/`
         * to re-evaluate the chain, so a single sign-in crosses this boundary
         * three times before it reaches home.
         */
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(entry)" />
      <Stack.Screen name="home" />
    </Stack>
  );
}

/**
 * The navigator, with the live request floating over it.
 *
 * The pill is a sibling of the Stack rather than a child of any screen: it has
 * to survive navigation, which is the entire reason it exists. `box-none` on
 * the wrapper means only the pill itself catches touches — everything else
 * falls through to the screen underneath.
 */
function Shell() {
  return (
    <View style={styles.root}>
      <RootLayoutNav />
      <WaitingPill />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fonts);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    // ThemeProvider sits outside ErrorBoundary on purpose: the error fallback
    // is themed, so it needs tokens available at the moment everything else
    // has already failed.
    <SafeAreaProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <AppStateProvider>
                <PendingRequestProvider>
              {/* `flex: 1` is required here — without it the view collapses and
                  the scene below it is what fills the window. The themed ground
                  itself comes from the Stack's `contentStyle` above, since this
                  component renders ThemeProvider and cannot consume it. */}
              <GestureHandlerRootView style={styles.root}>
                <KeyboardProvider>
                  <Shell />
                </KeyboardProvider>
              </GestureHandlerRootView>
                </PendingRequestProvider>
              </AppStateProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
