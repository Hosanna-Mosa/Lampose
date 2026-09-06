const fs = require('fs');
const path = require('path');

// Firebase Android push notifications config file
const googleServicesPath = path.join(__dirname, 'google-services.json');
const googleServicesFile = fs.existsSync(googleServicesPath) ? './google-services.json' : undefined;

/**
 * Brand colours — keep in sync with `theme/index.ts`.
 *
 * The Dock palette Stay Partner also builds from (`Stay Partner/app.config.js`):
 * the warm bone ground behind the splash and the adaptive icon, and the deep
 * teal ACCENT that tints notifications. Nothing here can read the palette at
 * runtime — the OS bakes these in at build time — so this is a copy, and it
 * has to be kept in step by hand.
 */
const BRAND = {
  ink: '#1A1917',
  accent: '#0E6E5C',
  background: '#EFEDE9',
};

export default {
  expo: {
    name: 'Lampose Driver',
    slug: 'driver',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'driver',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: BRAND.background,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.driver.app',
      infoPlist: {
        UIBackgroundModes: ['location', 'remote-notification'],
      },
      /* `react-native-maps` on iOS ships Apple Maps by default; this is what
         switches `MapPanel`'s `PROVIDER_GOOGLE` map over to real Google tiles
         there too, so the two platforms show the same map. Blank if the env
         var is unset — the native module still boots, `MapPanel` just has no
         imagery to draw and falls back to the same "waiting" caption an
         unset key already produces on Android. */
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      package: 'com.driver.app',
      ...(googleServicesFile ? { googleServicesFile } : {}),
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: BRAND.background,
      },
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.RECEIVE_BOOT_COMPLETED',
      ],
      /* Android has no built-in maps renderer the way iOS does, so
         `react-native-maps` cannot draw anything at all here without this —
         not "a plain map instead of Google's", nothing. The manifest bakes
         this in at build time; changing `.env` needs a fresh native build; a
         JS-only reload will not pick it up. */
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
    },
    notification: {
      icon: './assets/images/notification-icon.png',
      color: BRAND.accent,
    },
    web: {
      favicon: './assets/images/icon.png',
      bundler: 'metro',
    },
    plugins: [
      'expo-router',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Driver uses your location to match you with nearby jobs and to share live trip progress with customers, including while the app is in the background.',
          locationWhenInUsePermission:
            'Driver uses your location to match you with nearby jobs and to navigate to pickup and drop points.',
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      'expo-font',
      /* Registers the native audio session. The alert tone is played in the
         foreground by the app itself rather than by a notification, because a
         push needs a registered device token and there is none on a simulator,
         on a refused permission, or before the first successful registration. */
      'expo-audio',
      'expo-web-browser',
      [
        'expo-notifications',
        {
          icon: './assets/images/notification-icon.png',
          color: BRAND.accent,
        },
      ],
    ],
    experiments: {
      typedRoutes: false,
      reactCompiler: true,
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
    },
  },
};
