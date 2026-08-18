const fs = require('fs');
const path = require('path');

// Firebase config is per-installation and is not committed. Drop your own
// google-services.json next to this file to enable Android push notifications.
const googleServicesPath = path.join(__dirname, 'google-services.json');
const googleServicesFile = fs.existsSync(googleServicesPath) ? './google-services.json' : undefined;

/**
 * Brand colours — keep in sync with `theme/index.ts`.
 *
 * These are the customer app's Food palette: the grey ground behind the splash
 * and the adaptive icon, and the brand green that tints notifications. The
 * notification tint moved from near-black to green deliberately — a black tint
 * on a black-and-white status bar icon is invisible.
 */
const BRAND = {
  ink: '#101214',
  accent: '#22A355',
  background: '#F1F2F4',
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
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
      infoPlist: {
        UIBackgroundModes: ['location', 'remote-notification'],
      },
    },
    android: {
      package: 'com.driver.app',
      ...(googleServicesFile ? { googleServicesFile } : {}),
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: BRAND.background,
      },
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.RECEIVE_BOOT_COMPLETED',
      ],
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
      // Disabled: expo-router's typed-route generator strips a trailing
      // "/index" before normalising Windows backslashes, so `(tabs)/index.tsx`
      // is typed as `/index` instead of `/`, and files outside app/ leak in as
      // routes. The generated .d.ts then fails `npm run typecheck` even though
      // the routes resolve correctly at runtime. Re-enable once that is fixed.
      typedRoutes: false,
      reactCompiler: true,
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      // Run `eas init` to create a project and populate `extra.eas.projectId`.
    },
  },
};
