const fs = require('fs');
const path = require('path');

// Firebase Android push notifications config file
const googleServicesPath = path.join(__dirname, 'google-services.json');
const googleServicesFile = fs.existsSync(googleServicesPath) ? './google-services.json' : undefined;

/**
 * Brand colours — keep in sync with `theme/index.ts`.
 *
 * These are the customer app's Food palette: the grey ground behind the splash
 * and the adaptive icon, and the brand green that tints notifications.
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
      typedRoutes: false,
      reactCompiler: true,
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
    },
  },
};
