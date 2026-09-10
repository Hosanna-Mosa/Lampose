import React, { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AlertProvider } from '@/components/ui';
import { AppStateProvider } from '@/context/AppStateContext';
import { BottomBarProvider } from '@/context/BottomBarContext';
import { AuthProvider } from '@/context/AuthContext';
import { FoodCatalogueProvider } from '@/context/FoodCatalogueContext';
import { FoodProvider } from '@/context/FoodContext';
import { PendingRequestProvider } from '@/context/PendingRequestContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import {
  SourceSans3_400Regular,
  SourceSans3_500Medium,
  SourceSans3_600SemiBold,
  SourceSans3_700Bold,
} from '@expo-google-fonts/source-sans-3';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
/* Stays typography — one family, four sizes. The three faces above are still
   loaded because the FOOD module keeps them; see `TypographyScope`. */
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
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
 * The Dock trio, each face with a job.
 *
 * Outfit carries headings and the hero rent, Source Sans 3 carries reading
 * text, and DM Mono carries the secondary numerals — deposit, timers,
 * distances, counts, booking ids and the gate code. React Native cannot
 * synthesise weights, so each weight is registered as its own family;
 * `constants/tokens.ts` maps them.
 *
 * DM Mono ships only Light/Regular/Medium, so just two of its weights are
 * loaded here and `fontFamilies` folds 600 and 700 onto Medium. Registering
 * fewer files is the point — three faces at four weights each was twelve
 * blocking downloads before the splash could lift.
 */
const fonts = {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  SourceSans3_400Regular,
  SourceSans3_500Medium,
  SourceSans3_600SemiBold,
  SourceSans3_700Bold,
  DMMono_400Regular,
  DMMono_500Medium,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
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
 * The navigator.
 *
 * `WaitingPill` — the draggable bubble that followed a live request around the
 * app — used to sit here as a sibling of the Stack. It has been removed: a
 * control that floats over every screen and has to be dragged out of the way
 * is in the way, and the request it tracked is not lost without it. The
 * confirmation screen still watches the request, the alerts screen still
 * carries the owner's answer, and Bookings still lists it — the pill was a
 * fourth place to find out, at the cost of covering the bottom of every screen
 * in the product.
 *
 * The component itself is still in `components/shell/WaitingPill.tsx` and
 * `PendingRequestProvider` still holds the state it read, because
 * `reservedBottom` on that provider is what the snackbar and the docked cart
 * bar measure themselves against — that half was never about the pill.
 */
function Shell() {
  return (
    <View style={styles.root}>
      <RootLayoutNav />
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
                  {/* Whether the bottom bar is currently out of the way. It sits
                      beside the bottom-edge registry rather than in it: that one
                      answers "how much room is claimed down there", this one
                      answers "is the bar up", and the docked cart bar reads
                      both. Above the Stack because every screen with a feed
                      writes to it and the bar is a sibling of all of them. */}
                  <BottomBarProvider>
                  {/* The cart has to outlive the screens that build it: a student
                      adds a thali, wanders into a listing, comes back. It sits
                      inside PendingRequestProvider because the docked cart bar
                      claims the bottom edge from that same registry. */}
                  <FoodCatalogueProvider>
                    <FoodProvider>
              {/* `flex: 1` is required here — without it the view collapses and
                  the scene below it is what fills the window. The themed ground
                  itself comes from the Stack's `contentStyle` above, since this
                  component renders ThemeProvider and cannot consume it. */}
              <GestureHandlerRootView style={styles.root}>
                <KeyboardProvider>
                  {/*
                    The app's own alert, in place of the platform one.

                    Innermost of the providers, and deliberately: it renders a
                    `Modal` over everything, so it has to sit INSIDE
                    `GestureHandlerRootView` for its buttons to receive
                    touches, and inside `ThemeProvider` because the card is
                    themed. Everything above it can call `useAlert()`.

                    See `components/ui/AppAlert.tsx` for why `Alert.alert` is
                    not used anywhere in this app.
                  */}
                  <AlertProvider>
                    <Shell />
                  </AlertProvider>
                </KeyboardProvider>
              </GestureHandlerRootView>
                    </FoodProvider>
                  </FoodCatalogueProvider>
                  </BottomBarProvider>
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
