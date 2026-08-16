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
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

// Hold the native splash until the fonts resolve, so the branded splash below
// never renders in a fallback face.
SplashScreen.preventAutoHideAsync();

/**
 * How long the branded splash stays up once fonts are ready. Without a floor it
 * flashes for a frame or two on a warm start, which reads as a glitch.
 */
const MIN_SPLASH_MS = 1100;

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
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
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
